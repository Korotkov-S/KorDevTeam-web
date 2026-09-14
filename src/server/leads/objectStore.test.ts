import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { LeadS3Config } from "./config";
import { createPrivateAttachmentStore, createPrivateS3Client, MissingPrivateObjectError, sweepMaterializedAttachments } from "./objectStore";

const config: LeadS3Config = { endpoint: new URL("https://private.invalid"), region: "lead-region", bucket: "private-leads", accessKeyId: "lead-only", secretAccessKey: "private-secret", prefix: "intake/private/", serverSideEncryption: "AES256" };
function client(send: (command: any) => Promise<any>): Pick<S3Client, "send"> { return { send: send as S3Client["send"] }; }
async function root(t: test.TestContext) {
  const path = await mkdtemp(join(tmpdir(), "lead-store-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("put streams the file with private cache and encryption, without public ACL", async t => {
  const path = join(await root(t), "input"); await writeFile(path, "private bytes");
  const store = createPrivateAttachmentStore(config, client(async command => {
    assert.ok(command instanceof PutObjectCommand);
    const { Body, ...input } = command.input;
    assert.ok(Body instanceof Readable);
    assert.deepEqual(input, { Bucket: "private-leads", Key: "intake/private/random", ContentType: "application/pdf", CacheControl: "private, no-store", ServerSideEncryption: "AES256" });
    const parts = []; for await (const chunk of Body) parts.push(chunk);
    assert.equal(Buffer.concat(parts).toString(), "private bytes");
    return {};
  }));
  await store.putFile({ objectKey: "intake/private/random", path, contentType: "application/pdf" });
});

test("materialize uses random 0600 files and an idempotent disposer", async t => {
  const tempRoot = await root(t);
  const store = createPrivateAttachmentStore(config, client(async command => {
    assert.ok(command instanceof GetObjectCommand);
    assert.deepEqual(command.input, { Bucket: "private-leads", Key: "intake/private/key" });
    return { Body: Readable.from(["private ", "bytes"]) };
  }));
  const first = await store.materialize({ objectKey: "intake/private/key", tempRoot });
  const second = await store.materialize({ objectKey: "intake/private/key", tempRoot });
  assert.notEqual(first.path, second.path);
  assert.equal((await stat(first.path)).mode & 0o777, 0o600);
  assert.equal(await readFile(first.path, "utf8"), "private bytes");
  await Promise.all([first.dispose(), first.dispose(), second.dispose()]);
  assert.deepEqual(await readdir(tempRoot), []);
});

test("materialized disposer retries bounded unlink failures", async t => {
  const tempRoot = await root(t);
  let attempts = 0;
  const store = createPrivateAttachmentStore(config, client(async () => ({ Body: Readable.from(["private bytes"]) })), {
    async unlink(path) {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("busy private path"), { code: "EBUSY" });
      await rm(path);
    },
  });
  const materialized = await store.materialize({ objectKey: "intake/private/key", tempRoot });
  await materialized.dispose();
  assert.equal(attempts, 3);
  assert.deepEqual(await readdir(tempRoot), []);
});

test("startup sweep removes only old owned regular materializations", async t => {
  const tempRoot = await root(t);
  const old = join(tempRoot, "11111111-2222-4333-8444-555555555555.attachment");
  const recent = join(tempRoot, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.attachment");
  const foreign = join(tempRoot, "foreign.attachment");
  const target = join(tempRoot, "target");
  const link = join(tempRoot, "99999999-8888-4777-8666-555555555555.attachment");
  await Promise.all([writeFile(old, "old"), writeFile(recent, "recent"), writeFile(foreign, "foreign"), writeFile(target, "target")]);
  const { symlink, utimes } = await import("node:fs/promises");
  await symlink(target, link);
  await utimes(old, new Date(1), new Date(1));
  await sweepMaterializedAttachments(tempRoot, new Date(1000));
  assert.deepEqual((await readdir(tempRoot)).sort(), ["99999999-8888-4777-8666-555555555555.attachment", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.attachment", "foreign.attachment", "target"].sort());
});

test("a broken download removes partial files and sanitizes the dependency error", async t => {
  const tempRoot = await root(t);
  const store = createPrivateAttachmentStore(config, client(async () => ({ Body: Readable.from((async function* () { yield "partial"; throw new Error("secret endpoint"); })()) })));
  await assert.rejects(store.materialize({ objectKey: "intake/private/key", tempRoot }), /^LeadError: storage_unavailable$/);
  assert.deepEqual(await readdir(tempRoot), []);
});

test("empty and over-limit downloads fail closed and clean staging", async t => {
  const tempRoot = await root(t);
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(26_214_401)]) {
    const store = createPrivateAttachmentStore(config, client(async () => ({ Body: Readable.from([bytes]) })));
    await assert.rejects(store.materialize({ objectKey: "intake/private/key", tempRoot }), /storage_unavailable/);
    assert.deepEqual(await readdir(tempRoot), []);
  }
});

test("the dedicated SDK client signs and addresses requests with only the lead config", async t => {
  let captured: { url?: string; authorization?: string } | undefined;
  const server = createServer((request, response) => {
    captured = { url: request.url, authorization: request.headers.authorization };
    request.resume(); response.writeHead(204); response.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const store = createPrivateAttachmentStore({ ...config, endpoint: new URL(`http://127.0.0.1:${address.port}`) });
  await store.delete("intake/private/key");
  assert.equal(captured?.url?.split("?")[0], "/private-leads/intake/private/key");
  assert.match(captured?.authorization ?? "", /Credential=lead-only\/\d{8}\/lead-region\/s3\/aws4_request/);
});

test("production S3 client has explicit connection, idle and hard request timeouts below the lease", async () => {
  const client = createPrivateS3Client(config);
  try {
    const handler = client.config.requestHandler;
    assert.equal(typeof (handler as { httpHandlerConfigs?: unknown }).httpHandlerConfigs, "function");
    const resolved = await (handler as unknown as { configProvider: Promise<Record<string, unknown>> }).configProvider;
    assert.deepEqual({
      connectionTimeout: resolved.connectionTimeout,
      socketTimeout: resolved.socketTimeout,
      requestTimeout: resolved.requestTimeout,
      throwOnRequestTimeout: resolved.throwOnRequestTimeout,
    }, {
      connectionTimeout: 5_000,
      socketTimeout: 30_000,
      requestTimeout: 45_000,
      throwOnRequestTimeout: true,
    });
  } finally { client.destroy(); }
});

test("hanging S3 send is aborted by the injected hard operation timeout", async t => {
  const tempRoot = await root(t);
  let observedSignal: AbortSignal | undefined;
  const store = createPrivateAttachmentStore(config, {
    send: ((_command: unknown, options?: { abortSignal?: AbortSignal }) => new Promise((_resolve, reject) => {
      observedSignal = options?.abortSignal;
      options?.abortSignal?.addEventListener("abort", () => reject(new Error("private timeout cause")), { once: true });
    })) as S3Client["send"],
  }, { operationTimeoutMs: 5 });
  await assert.rejects(store.materialize({ objectKey: "intake/private/key", tempRoot }), /^LeadError: storage_unavailable$/);
  assert.equal(observedSignal?.aborted, true);
  assert.deepEqual(await readdir(tempRoot), []);
});

test("abort interrupts a trickling materialized download and removes its partial file", async t => {
  const tempRoot = await root(t);
  const body = new PassThrough();
  body.write("partial private bytes");
  const controller = new AbortController();
  const store = createPrivateAttachmentStore(config, client(async () => ({ Body: body })), { operationTimeoutMs: 60_000 });
  const materializing = store.materialize({ objectKey: "intake/private/key", tempRoot, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(materializing, /^LeadError: storage_unavailable$/);
  assert.equal(body.destroyed, true);
  assert.deepEqual(await readdir(tempRoot), []);
});

test("confirmed missing objects propagate for delivery and deletion; generic 404 is not confirmed missing", async t => {
  const tempRoot = await root(t);
  const store = createPrivateAttachmentStore(config, client(async () => { throw Object.assign(new Error("secret"), { name: "NoSuchKey" }); }));
  await assert.rejects(store.materialize({ objectKey: "intake/private/key", tempRoot }), MissingPrivateObjectError);
  await assert.rejects(store.delete("intake/private/key"), MissingPrivateObjectError);
  const generic = createPrivateAttachmentStore(config, client(async () => { throw { $metadata: { httpStatusCode: 404 } }; }));
  await assert.rejects(generic.delete("intake/private/key"), error => error instanceof Error && !(error instanceof MissingPrivateObjectError) && error.message === "storage_unavailable");
});

test("delete uses the private bucket; out-of-prefix operations cannot reach S3", async () => {
  const store = createPrivateAttachmentStore(config, client(async command => {
    assert.ok(command instanceof DeleteObjectCommand);
    assert.deepEqual(command.input, { Bucket: "private-leads", Key: "intake/private/key" });
    return {};
  }));
  await store.delete("intake/private/key");
  await assert.rejects(store.delete("other/key"), /storage_unavailable/);
});

test("orphan listing paginates the private prefix and excludes recent or foreign objects", async () => {
  let page = 0;
  const store = createPrivateAttachmentStore(config, client(async command => {
    assert.ok(command instanceof ListObjectsV2Command);
    assert.deepEqual(command.input, { Bucket: "private-leads", Prefix: "intake/private/", ...(page ? { ContinuationToken: "next" } : {}) });
    return page++ === 0 ? { IsTruncated: true, NextContinuationToken: "next", Contents: [{ Key: "intake/private/old", LastModified: new Date(1) }, { Key: "other/old", LastModified: new Date(1) }] } : { Contents: [{ Key: "intake/private/new", LastModified: new Date(100) }] };
  }));
  const objects = []; for await (const object of store.listOlderThan(new Date(50))) objects.push(object);
  assert.deepEqual(objects, [{ key: "intake/private/old", lastModified: new Date(1) }]);
  assert.equal(page, 2);
});
