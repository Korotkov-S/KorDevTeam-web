import assert from "node:assert/strict";
import test from "node:test";
import { createLeadService, type LeadServiceInput } from "./service";
import type { AcceptCommand, AcceptDecision, RateDecision } from "./repository";
import type { StoredLead } from "./contracts";
import type { LeadWebConfig } from "./config";
import { LeadError } from "./errors";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { leadAttachments, leadDeliveryJobs, leads } from "../db/schema";
import { createLeadRepository } from "./repository";
import { normalizeLeadContext, normalizeLeadFields, requestFingerprint } from "./validation";

const config: LeadWebConfig = { consentVersion: "v2", hashKey: "secret", tempRoot: "/private/tmp", clamav: { host: "localhost", port: 3310, timeoutMs: 1000 }, s3: { endpoint: new URL("https://private.invalid"), region: "private", bucket: "private", accessKeyId: "private", secretAccessKey: "private", prefix: "leads/private/", serverSideEncryption: "AES256" } };
const response = { leadId: "stored-lead", status: "accepted" as const };
function fixture(options: { existing?: StoredLead; rate?: RateDecision; result?: AcceptDecision; fail?: string; disposeFails?: boolean; scanError?: LeadError } = {}) {
  const events: string[] = [], commands: AcceptCommand[] = [], keys: string[] = [], deleted: string[] = [];
  const step = (name: string) => { events.push(name); if (options.fail === name) throw new Error("private dependency details"); };
  const input: LeadServiceInput = { fields: { name: " Jane ", phone: "+1 23456", consent: "accepted" }, context: { pagePath: "/contact" }, submissionKey: "12345678-1234-4234-8234-123456789abc", requestIp: "192.0.2.17", attachment: { path: "/stage/file", originalName: "file.pdf", declaredMime: "application/pdf", byteSize: 10, sha256: "a".repeat(64) }, dispose: async () => { events.push("temp.dispose"); if (options.disposeFails) throw new Error("private temp path"); } };
  const service = createLeadService({ config, repository: {
    consumeIpAttempt: async (hash, globalHash) => {
      step("ip");
      assert.match(hash, /^[a-f0-9]{64}$/); assert.notEqual(hash, input.requestIp);
      assert.match(globalHash, /^[a-f0-9]{64}$/); assert.notEqual(globalHash, hash);
      return options.rate ?? { kind: "allowed" };
    },
    findBySubmissionKey: async key => { step("find"); assert.equal(key, input.submissionKey); return options.existing ?? null; },
    accept: async command => { step("repository.accept"); commands.push(command); return options.result ?? { kind: "accepted", response }; },
  }, inspect: async staged => { step("inspect"); return { ...staged, originalName: "safe.pdf", mediaType: "application/pdf" }; },
  scanner: { scan: async path => { step("scan"); if (options.scanError) throw options.scanError; assert.equal(path, input.attachment!.path); return { scanMetadata: { engine: "ClamAV", result: "OK" }, scannedAt: new Date(1) }; } },
  objectStore: {
    putFile: async value => { step("s3.put"); keys.push(value.objectKey); assert.equal(value.path, input.attachment!.path); assert.equal(value.contentType, "application/pdf"); },
    delete: async key => { step("s3.delete"); deleted.push(key); },
  } });
  return { service, input, events, commands, keys, deleted };
}

test("clean file is inspected and fully scanned before random private upload and durable acceptance", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.accept(f.input), { kind: "accepted", response });
  assert.deepEqual(f.events, ["ip", "find", "inspect", "scan", "s3.put", "repository.accept", "temp.dispose"]);
  assert.match(f.keys[0], /^leads\/private\/[a-f0-9-]{36}$/);
  assert.equal(f.commands[0].attachment!.objectKey, f.keys[0]);
  assert.equal(f.commands[0].attachment!.originalName, "safe.pdf");
  assert.deepEqual(f.commands[0].attachment!.scanMetadata, { engine: "ClamAV", result: "OK" });
  assert.equal(f.commands[0].consentVersion, "v2");
  assert.equal(f.commands[0].fields.name, "Jane");
  assert.ok(!JSON.stringify(f.commands).includes("192.0.2.17"));
  await f.service.accept(f.input); assert.notEqual(f.keys[0], f.keys[1]);
});

test("no-file acceptance delegates the durable transaction without scanner or S3", async () => {
  const f = fixture(); f.input.attachment = null;
  assert.equal((await f.service.accept(f.input)).kind, "accepted");
  assert.deepEqual(f.events, ["ip", "find", "repository.accept", "temp.dispose"]);
  assert.equal(f.commands[0].attachment, null);
});

test("honeypot ignores invalid fields and key before validation, rate, or external work", async () => {
  const f = fixture(); f.input.fields = { website: "robot" }; f.input.submissionKey = "bad";
  assert.deepEqual(await f.service.accept(f.input), { kind: "ignored" });
  assert.deepEqual(f.events, ["temp.dispose"]);
});

test("stored replay uses old consent version and skips all external file work", async () => {
  const seed = fixture();
  const existing: StoredLead = { id: response.leadId, submissionKey: seed.input.submissionKey, consentVersion: "v1", successResponse: response, requestFingerprint: requestFingerprint({ fields: normalizeLeadFields(seed.input.fields), context: normalizeLeadContext(seed.input.context), consentVersion: "v1", attachmentSha256: seed.input.attachment!.sha256 }) };
  const f = fixture({ existing });
  assert.deepEqual(await f.service.accept(f.input), { kind: "replayed", response });
  assert.deepEqual(f.events, ["ip", "find", "temp.dispose"]);
  f.input.fields.name = "Changed";
  await assert.rejects(f.service.accept(f.input), error => error instanceof LeadError && error.status === 409);
  assert.deepEqual(f.events.slice(3), ["ip", "find", "temp.dispose"]);
});

for (const [result, kind] of [
  [{ kind: "replayed", response }, "replayed"],
  [{ kind: "rate_limited", retryAfterSeconds: 20 }, "rate_limited"],
  [{ kind: "conflict" }, "conflict"],
] as const) test(`concurrent ${kind} compensates only this newly uploaded object`, async () => {
  const f = fixture({ result });
  if (kind === "conflict") await assert.rejects(f.service.accept(f.input), error => error instanceof LeadError && error.code === "idempotency_conflict" && error.status === 409);
  else assert.deepEqual(await f.service.accept(f.input), result);
  assert.deepEqual(f.deleted, f.keys);
  assert.deepEqual(f.events, ["ip", "find", "inspect", "scan", "s3.put", "repository.accept", "s3.delete", "temp.dispose"]);
});

for (const fail of ["ip", "find", "inspect", "scan", "s3.put", "repository.accept"]) test(`failure at ${fail} is sanitized, stops later work and disposes staging`, async () => {
  const f = fixture({ fail });
  await assert.rejects(f.service.accept(f.input), /^LeadError: service_unavailable$/);
  const order = ["ip", "find", "inspect", "scan", "s3.put", "repository.accept"];
  assert.deepEqual(f.events, [...order.slice(0, order.indexOf(fail) + 1), ...(fail === "repository.accept" ? ["s3.delete"] : []), "temp.dispose"]);
});

test("IP rate limit returns before lookup or scan and still disposes staging", async () => {
  const rate = { kind: "rate_limited" as const, retryAfterSeconds: 12 };
  const f = fixture({ rate });
  assert.deepEqual(await f.service.accept(f.input), rate);
  assert.deepEqual(f.events, ["ip", "temp.dispose"]);
});

for (const code of ["unsafe_file", "scan_unavailable"] as const) test(`${code} never uploads or creates a lead`, async () => {
  const f = fixture({ scanError: new LeadError(code) });
  await assert.rejects(f.service.accept(f.input), error => error instanceof LeadError && error.code === code);
  assert.deepEqual(f.events, ["ip", "find", "inspect", "scan", "temp.dispose"]);
  assert.equal(f.commands.length, 0);
});

test("invalid submission and fields reject before an IP attempt and dispose staging", async () => {
  for (const invalid of ["fields", "key"]) {
    const f = fixture();
    if (invalid === "fields") f.input.fields.consent = "no";
    else f.input.submissionKey = "not-a-uuid";
    await assert.rejects(f.service.accept(f.input), /validation_error/);
    assert.deepEqual(f.events, ["temp.dispose"]);
  }
});

test("no-file service acceptance durably persists both CRM and email jobs", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = process.env.TEST_DATABASE_URL!;
  await resetTestDatabase(url);
  const db = createDb(url);
  const repository = createLeadRepository(db, { now: () => new Date("2026-09-14T12:00:00Z") });
  const f = fixture(); f.input.attachment = null;
  const service = createLeadService({ config, repository,
    scanner: { scan: async () => assert.fail("scanner invoked for no file") },
    objectStore: { putFile: async () => assert.fail("S3 invoked for no file"), delete: async () => assert.fail("S3 delete invoked for no file") },
  });
  const result = await service.accept(f.input);
  assert.equal(result.kind, "accepted");
  const records = await db.select().from(leads);
  assert.equal(records.length, 1);
  assert.deepEqual((await db.select().from(leadDeliveryJobs)).map(job => ({ leadId: job.leadId, channel: job.channel })).sort((a, b) => a.channel.localeCompare(b.channel)), [
    { leadId: records[0].id, channel: "crm" }, { leadId: records[0].id, channel: "email" },
  ]);
  assert.deepEqual(await db.select().from(leadAttachments), []);
  assert.deepEqual(f.events, ["temp.dispose"]);
});

test("compensation failure and temp cleanup errors expose no dependency details", async () => {
  const f = fixture({ result: { kind: "conflict" }, fail: "s3.delete" });
  await assert.rejects(f.service.accept(f.input), /^LeadError: service_unavailable$/);
  assert.equal(f.events.filter(event => event === "s3.delete").length, 1);
  assert.equal(f.events.at(-1), "temp.dispose");
  const cleanup = fixture({ disposeFails: true });
  await assert.rejects(cleanup.service.accept(cleanup.input), /^LeadError: service_unavailable$/);
  assert.ok(!cleanup.events.includes("s3.delete"));
});
