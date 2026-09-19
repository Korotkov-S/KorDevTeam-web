import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { eq } from "drizzle-orm";
import apiModule from "../../server/api-app.js";
import { configureProxy } from "../../server/proxy.mjs";
import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { leads, leadDeliveryJobs } from "../../src/server/db/schema";
import { readLeadWebConfig } from "../../src/server/leads/config";
import { LeadError, type LeadErrorCode } from "../../src/server/leads/errors";
import type { LeadRouterOverrides } from "../../src/server/leads/http";
import type { LeadServiceDependencies } from "../../src/server/leads/service";
import { startTestRuntime } from "./support/runtime";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sensitive = "SELECT password FROM leads /private/contact.txt postgresql://admin:secret@db +79991234567 vendor-private-body";
const environment = {
  LEAD_CONSENT_VERSION: "2026-09", LEAD_HASH_KEY: Buffer.alloc(32, 7).toString("base64"),
  LEAD_S3_ENDPOINT: "https://unreachable.invalid", LEAD_S3_REGION: "local", LEAD_S3_BUCKET: "private",
  LEAD_S3_ACCESS_KEY_ID: "local-key", LEAD_S3_SECRET_ACCESS_KEY: "local-secret", LEAD_S3_PREFIX: "private/leads",
  LEAD_S3_SSE: "AES256", CLAMAV_HOST: "unreachable.invalid", CLAMAV_PORT: "3310",
};

function multipart(values: Record<string, string> = {}, file?: Blob) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Тест", phone: "+79991234567", consent: "accepted", pagePath: "/contact", ...values })) form.set(key, value);
  if (file) form.set("file", file, "private.png");
  return form;
}

function headers(response: Response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("vary")?.split(/,\s*/).includes("Origin"));
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
}

async function errorResponse(response: Response, status: number, code: LeadErrorCode) {
  assert.equal(response.status, status); headers(response);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["error", "request_id"]);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
  assert.equal(body.error.code, code); assert.match(body.error.message, /[А-Яа-я]/); assert.match(body.request_id, uuid);
  assert.doesNotMatch(JSON.stringify(body), /SELECT|password|private\/|secret|79991234567|vendor-private|stack|delivery|objectKey/);
  return body;
}

async function local(t: TestContext, overrides: LeadRouterOverrides = {}, production = false, trust = "1") {
  // A missing bundle export is the expected initial RED, before importing the new source module.
  const build = await import("../../build/server/index.js");
  assert.equal(typeof build.entry.module.createLeadRouter, "function");
  const { createLeadRouter } = await import("../../src/server/leads/http");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "leads-http-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const logs: unknown[] = [];
  const config = readLeadWebConfig({ ...environment, LEAD_TEMP_ROOT: tempRoot });
  const dependencies: LeadServiceDependencies = {
    config,
    repository: {
      consumeIpAttempt: async () => ({ kind: "allowed" }), findBySubmissionKey: async () => null,
      accept: async () => ({ kind: "accepted", response: { leadId: randomUUID(), status: "accepted" } }),
    },
    scanner: { scan: async () => assert.fail("unexpected scanner call") },
    objectStore: { putFile: async () => assert.fail("unexpected S3 call"), delete: async () => assert.fail("unexpected S3 delete") },
    ...overrides,
  };
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = production ? "production" : "test";
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  const app = express(); configureProxy(app, trust);
  app.use(apiModule.createApiApp({ leadRouter: createLeadRouter({ ...dependencies, log: record => logs.push(record) }) }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, logs, tempRoot, post: (extra: Record<string, string> = {}, body: BodyInit = multipart()) => fetch(`${origin}/api/leads`, {
    method: "POST", headers: { Origin: origin, "Idempotency-Key": randomUUID(), ...extra }, body,
  }) };
}

test("built runtime durably accepts 201, replays 200, rejects 409 and ignores 202 without exposing delivery state", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const db = createDb(process.env.TEST_DATABASE_URL!);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "leads-runtime-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const runtime = await startTestRuntime({ ...environment, LEAD_TEMP_ROOT: tempRoot, TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);
  const ready = await fetch(`${runtime.origin}/api/health/ready`);
  assert.equal(ready.status, 200); assert.deepEqual(await ready.json(), { status: "ready" });
  const key = randomUUID();
  const post = (values = {}) => fetch(`${runtime.origin}/api/leads`, { method: "POST", headers: { Origin: runtime.origin, "Idempotency-Key": key }, body: multipart(values) });
  const accepted = await post(); assert.equal(accepted.status, 201); headers(accepted);
  const body = await accepted.json(); assert.match(body.leadId, uuid);
  assert.deepEqual(body, { leadId: body.leadId, status: "accepted" });
  assert.equal(accepted.headers.get("idempotency-replayed"), null);
  assert.equal((await db.select().from(leads).where(eq(leads.id, body.leadId))).length, 1);
  assert.deepEqual((await db.select().from(leadDeliveryJobs).where(eq(leadDeliveryJobs.leadId, body.leadId))).map(job => job.channel).sort(), ["crm", "email"]);
  const replay = await post(); assert.equal(replay.status, 200); headers(replay);
  assert.equal(replay.headers.get("idempotency-replayed"), "true"); assert.deepEqual(await replay.json(), body);
  await errorResponse(await post({ name: "Changed" }), 409, "idempotency_conflict");
  const ignored = await post({ website: "robot", consent: "no" }); assert.equal(ignored.status, 202); headers(ignored);
  assert.deepEqual(await ignored.json(), { status: "received" });
  assert.equal((await db.select().from(leads)).length, 1);
  assert.doesNotMatch(runtime.output(), /79991234567|Changed|SELECT|local-secret|Idempotency-Key/);
});

test("runtime with invalid web config keeps liveness and fails readiness plus submission safely", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const runtime = await startTestRuntime({ ...environment, LEAD_HASH_KEY: "", LEAD_TEMP_ROOT: "/private/not-a-real-lead-directory", TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);
  const ready = await fetch(`${runtime.origin}/api/health/ready`);
  assert.equal(ready.status, 503); assert.deepEqual(await ready.json(), { status: "not_ready" });
  const response = await fetch(`${runtime.origin}/api/leads`, { method: "POST", headers: { Origin: runtime.origin, "Idempotency-Key": randomUUID() }, body: multipart() });
  await errorResponse(response, 503, "service_unavailable");
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal((await fetch(`${runtime.origin}/api/health`)).status, 200);
  assert.doesNotMatch(runtime.output(), /lead_config_invalid|not-a-real-lead-directory|79991234567|local-secret/);
});

test("router receives untouched multipart and rejects JSON before the shared parser", async t => {
  const f = await local(t);
  const response = await f.post(); assert.equal(response.status, 201); headers(response);
  await errorResponse(await f.post({ "Content-Type": "application/json" }, "{not-json"), 400, "validation_error");
  await errorResponse(await f.post({}, multipart({ consent: "no" })), 400, "validation_error");
});

test("web intake sweeps only stale owned uploads before its first accepted request", async t => {
  const f = await local(t);
  const old = path.join(f.tempRoot, "11111111-2222-4333-8444-555555555555.upload");
  const recent = path.join(f.tempRoot, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.upload");
  const foreign = path.join(f.tempRoot, "foreign.upload");
  await Promise.all([writeFile(old, "old private bytes"), writeFile(recent, "active private bytes"), writeFile(foreign, "foreign")]);
  await utimes(old, new Date(1), new Date(1));

  assert.equal((await f.post()).status, 201);
  assert.deepEqual((await readdir(f.tempRoot)).sort(), ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.upload", "foreign.upload"]);
});

test("web intake fails closed and sanitizes an unavailable startup sweep", async t => {
  const f = await local(t, { sweepUploads: async () => { throw new Error(sensitive); } });
  await errorResponse(await f.post(), 503, "service_unavailable");
  assert.doesNotMatch(JSON.stringify(f.logs), /SELECT|private|password|secret|79991234567/);
});

test("rejects missing, malformed, duplicate-shaped and non-UUID keys before service work", async t => {
  const f = await local(t);
  await errorResponse(await fetch(`${f.origin}/api/leads`, { method: "POST", headers: { Origin: f.origin }, body: multipart() }), 400, "validation_error");
  for (const key of ["", "bad", "12345678-1234-0234-0234-123456789abc", `${randomUUID()}, ${randomUUID()}`]) {
    await errorResponse(await f.post({ "Idempotency-Key": key }), 400, "validation_error");
  }
});

test("same-origin no-JS form submission receives server idempotency and a fixed PII-free redirect", async t => {
  const f = await local(t);
  const postNative = async (pagePath: string, values: Record<string, string> = {}) => {
    const serialized = new Request(`${f.origin}/api/leads`, {
      method: "POST", body: multipart({ pagePath, ...values }),
    });
    const body = Buffer.from(await serialized.arrayBuffer());
    return new Promise<Response>((resolve, reject) => {
      const request = httpRequest(`${f.origin}/api/leads`, { method: "POST", headers: {
        Accept: "text/html",
        Origin: f.origin,
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": serialized.headers.get("content-type")!,
        "Content-Length": String(body.byteLength),
      } }, incoming => {
        const chunks: Buffer[] = [];
        incoming.on("data", chunk => chunks.push(Buffer.from(chunk)));
        incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode,
          headers: incoming.headers as HeadersInit,
        })));
      });
      request.on("error", reject);
      request.end(body);
    });
  };

  for (const pagePath of [
    "/services/integrations/",
    "/cases/+79991234567/",
    "/victim%40example.com/",
    "/unknown-route/",
  ]) {
    const response = await postNative(pagePath);
    assert.equal(response.status, 303);
    headers(response);
    assert.equal(response.headers.get("location"), "/#lead-submitted-message");
    assert.doesNotMatch(response.headers.get("location") ?? "", /services|unknown|79991234567|%2B79991234567|victim|example|Тест/);
  }

  const rejectedPiiPath = await postNative("/cases/+79991234567/", { consent: "no" });
  assert.equal(rejectedPiiPath.status, 303);
  headers(rejectedPiiPath);
  assert.equal(rejectedPiiPath.headers.get("location"), "/#lead-submit-error");
  assert.doesNotMatch(rejectedPiiPath.headers.get("location") ?? "", /cases|79991234567|%2B79991234567/);
});

test("multipart parser errors return a safe HTTP response rather than resetting the socket", async t => {
  const f = await local(t);
  const duplicate = multipart(); duplicate.append("phone", "+79990000000");
  await errorResponse(await f.post({}, duplicate), 400, "validation_error");
  await errorResponse(await f.post({ "Content-Type": "multipart/form-data; boundary=broken" }, "--broken\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nunterminated"), 400, "validation_error");
  assert.deepEqual(await readdir(f.tempRoot), []);
});

test("chunked oversized file returns 413 while upload is still in flight", async t => {
  const f = await local(t);
  const stream = Readable.from((async function* () {
    yield Buffer.from('--upload\r\nContent-Disposition: form-data; name="file"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n');
    for (let index = 0; index < 402; index++) yield Buffer.alloc(65_536);
    await new Promise(resolve => setTimeout(resolve, 20));
    yield Buffer.from('\r\n--upload--\r\n');
  })());
  const response = await fetch(`${f.origin}/api/leads`, {
    method: "POST", headers: { Origin: f.origin, "Idempotency-Key": randomUUID(), "Content-Type": "multipart/form-data; boundary=upload" },
    body: stream, duplex: "half",
  } as unknown as RequestInit);
  await errorResponse(response, 413, "file_too_large");
  assert.deepEqual(await readdir(f.tempRoot), []);
});

test("same-origin policy rejects absent, opaque and foreign origins plus every non same-origin fetch site", async t => {
  const f = await local(t);
  for (const origin of ["", "null", "https://evil.invalid", `${f.origin}/`]) await errorResponse(await f.post({ Origin: origin }), 403, "validation_error");
  for (const site of ["cross-site", "same-site", "none", "same-origin, cross-site", ""]) await errorResponse(await f.post({ "Sec-Fetch-Site": site }), 403, "validation_error");
  assert.equal((await f.post({ "Sec-Fetch-Site": "same-origin" })).status, 201);
});

test("production requires trusted HTTPS and exact canonical Origin even for localhost requests", async t => {
  const f = await local(t, {}, true);
  await errorResponse(await f.post({ Origin: "https://kordev.team" }), 426, "validation_error");
  for (const origin of [f.origin, "https://www.kordev.team", "https://kordev.team:443", "https://kordev.team/", "https://evil.invalid"]) {
    await errorResponse(await f.post({ Origin: origin, "X-Forwarded-Proto": "https" }), 403, "validation_error");
  }
  await errorResponse(await f.post({ Origin: "https://kordev.team", "X-Forwarded-Proto": "https", "Sec-Fetch-Site": "cross-site" }), 403, "validation_error");
  const accepted = await f.post({ Origin: "https://kordev.team", "X-Forwarded-Proto": "https", "Sec-Fetch-Site": "same-origin" });
  assert.equal(accepted.status, 201); headers(accepted);
});

test("untrusted forwarded HTTPS cannot bypass production TLS requirement", async t => {
  const f = await local(t, {}, true, "0");
  await errorResponse(await f.post({ Origin: "https://kordev.team", "X-Forwarded-Proto": "https" }), 426, "validation_error");
});

test("oversized request produces 413 before reading the upload", async t => {
  const f = await local(t);
  const body = new Uint8Array(26_214_400 + 131_073);
  await errorResponse(await f.post({ "Content-Type": "multipart/form-data; boundary=oversized" }, body), 413, "file_too_large");
});

test("unsupported real attachment produces 415 and staging is disposed", async t => {
  const f = await local(t);
  const form = multipart(); form.set("file", new Blob(["executable"], { type: "application/octet-stream" }), "private.exe");
  await errorResponse(await f.post({}, form), 415, "unsupported_file_type");
  assert.deepEqual(await readdir(f.tempRoot), []);
});

for (const [code, status] of [["unsafe_file", 422], ["scan_unavailable", 503], ["storage_unavailable", 503], ["service_unavailable", 503], ["internal_error", 500]] as const) {
  test(`maps ${code} to safe ${status} without leaking exception details`, async t => {
    const error = new LeadError(code); error.message = sensitive;
    const f = await local(t, { repository: {
      consumeIpAttempt: async () => { throw error; }, findBySubmissionKey: async () => null, accept: async () => assert.fail("unexpected insert"),
    } });
    await errorResponse(await f.post(), status, code);
    assert.equal(f.logs.length, 1);
    const log = f.logs[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(log).sort(), ["code", "duration_ms", "request_id", "status"]);
    assert.match(String(log.request_id), uuid); assert.equal(log.status, status); assert.equal(log.code, code);
    assert.doesNotMatch(JSON.stringify(f.logs), /SELECT|private|password|secret|79991234567|127\.0\.0\.1|vendor/);
  });
}

test("unknown exceptions become safe 503 and request IDs are server-generated and unique", async t => {
  const f = await local(t, { repository: {
    consumeIpAttempt: async () => { throw new Error(sensitive); }, findBySubmissionKey: async () => null, accept: async () => assert.fail("unexpected insert"),
  } });
  const first = await errorResponse(await f.post({ "X-Request-ID": sensitive }), 503, "service_unavailable");
  const second = await errorResponse(await f.post(), 503, "service_unavailable");
  assert.notEqual(first.request_id, second.request_id);
});

test("rate limits use integer Retry-After bounded to 1..3600 seconds", async t => {
  let retryAfterSeconds = 45;
  const f = await local(t, { repository: {
    consumeIpAttempt: async () => ({ kind: "rate_limited", retryAfterSeconds }), findBySubmissionKey: async () => assert.fail("unexpected lookup"), accept: async () => assert.fail("unexpected insert"),
  } });
  for (const [input, expected] of [[45, "45"], [0, "1"], [99_999, "3600"], [1.2, "2"], [NaN, "60"]] as const) {
    retryAfterSeconds = input;
    const response = await f.post(); await errorResponse(response, 429, "rate_limit_exceeded");
    assert.equal(response.headers.get("retry-after"), expected);
  }
});

test("preflight and unsupported methods stay inside the no-CORS safe lead boundary", async t => {
  const f = await local(t);
  for (const method of ["OPTIONS", "GET", "PUT"]) {
    const response = await fetch(`${f.origin}/api/leads`, { method, headers: { Origin: "https://evil.invalid" } });
    await errorResponse(response, 405, "validation_error");
  }
});
