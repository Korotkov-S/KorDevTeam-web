import assert from "node:assert/strict";
import test from "node:test";
import { type S3Client } from "@aws-sdk/client-s3";

import type { LeadS3Config } from "./config";
import { createPrivateAttachmentStore, MissingPrivateObjectError } from "./objectStore";
import type { ExpiredLead, LeadRepository } from "./repository";
import { runLeadRetention, type RetentionOptions } from "./retention";
import { runLeadRetentionCommand } from "../../../server/lead-retention.mjs";

type FixtureOptions = {
  expired?: ExpiredLead[];
  objects?: { key: string; lastModified: Date }[];
  deleteResults?: Record<string, "deleted" | "missing" | Error>;
  references?: Record<string, boolean | Error>;
  rowResults?: Record<string, boolean | Error>;
  rateLimitResult?: number | Error;
};

function retentionFixture(events: string[] = [], options: FixtureOptions = {}) {
  const deletedLeadIds: string[] = [];
  const calls = { limit: 0, cutoff: new Date(0) };
  const repository: Pick<LeadRepository, "findExpiredLeads" | "attachmentKeyExists" | "deleteLeadAfterObject" | "deleteExpiredRateLimits"> = {
    async findExpiredLeads(limit) {
      calls.limit = limit;
      return options.expired ?? [{ id: "lead-a", objectKey: "private/a.pdf" }];
    },
    async attachmentKeyExists(key) {
      events.push(`repository.exists:${key}`);
      const result = options.references?.[key] ?? false;
      if (result instanceof Error) throw result;
      return result;
    },
    async deleteLeadAfterObject(id) {
      events.push(`repository.delete:${id}`);
      const result = options.rowResults?.[id] ?? true;
      if (result instanceof Error) throw result;
      if (result) deletedLeadIds.push(id);
      return result;
    },
    async deleteExpiredRateLimits(limit) {
      events.push(`repository.delete-rate-limits:${limit}`);
      const result = options.rateLimitResult ?? 0;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const store: RetentionOptions["store"] = {
    async deleteForRetention(key) {
      events.push(`store.delete:${key}`);
      const result = options.deleteResults?.[key] ?? "deleted";
      if (result instanceof Error) throw result;
      return result;
    },
    async *listOlderThan(cutoff) {
      calls.cutoff = cutoff;
      for (const object of options.objects ?? []) yield object;
    },
  };
  return {
    repository,
    store,
    clock: { now: () => new Date("2026-09-14T12:00:00.000Z") },
    deletedLeadIds,
    calls,
  };
}

test("never deletes the row before its private object", async () => {
  const events: string[] = [];
  const report = await runLeadRetention(retentionFixture(events));
  assert.deepEqual(events, ["store.delete:private/a.pdf", "repository.delete:lead-a", "repository.delete-rate-limits:100"]);
  assert.deepEqual(report, { deletedLeads: 1, deletedObjects: 1, deletedOrphans: 0, deletedRateLimits: 0, failures: 0 });
});

test("storage failure preserves its row and does not stop later leads", async () => {
  const events: string[] = [];
  const fixture = retentionFixture(events, {
    expired: [{ id: "lead-a", objectKey: "private/a.pdf" }, { id: "lead-b", objectKey: null }],
    deleteResults: { "private/a.pdf": new Error("private endpoint and credentials") },
  });
  const report = await runLeadRetention(fixture);
  assert.deepEqual(fixture.deletedLeadIds, ["lead-b"]);
  assert.deepEqual(events, ["store.delete:private/a.pdf", "repository.delete:lead-b", "repository.delete-rate-limits:100"]);
  assert.deepEqual(report, { deletedLeads: 1, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 1 });
});

test("confirmed missing object permits the expired row deletion", async () => {
  const events: string[] = [];
  const fixture = retentionFixture(events, {
    deleteResults: { "private/a.pdf": new MissingPrivateObjectError() },
  });
  const report = await runLeadRetention(fixture);
  assert.deepEqual(events, ["store.delete:private/a.pdf", "repository.delete:lead-a", "repository.delete-rate-limits:100"]);
  assert.deepEqual(report, { deletedLeads: 1, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 0 });
});

test("lead without an attachment is deleted directly", async () => {
  const events: string[] = [];
  const report = await runLeadRetention(retentionFixture(events, { expired: [{ id: "lead-a", objectKey: null }] }));
  assert.deepEqual(events, ["repository.delete:lead-a", "repository.delete-rate-limits:100"]);
  assert.deepEqual(report, { deletedLeads: 1, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 0 });
});

test("one run requests at most 100 expired rows and uses a strict two-hour orphan cutoff", async () => {
  const fixture = retentionFixture([], {
    expired: Array.from({ length: 101 }, (_, index) => ({ id: `lead-${index}`, objectKey: null })),
  });
  const report = await runLeadRetention({ ...fixture, limit: 100 });
  assert.equal(fixture.calls.limit, 100);
  assert.equal(fixture.calls.cutoff.toISOString(), "2026-09-14T10:00:00.000Z");
  assert.equal(report.deletedLeads, 100);
  assert.equal(fixture.deletedLeadIds.includes("lead-100"), false);
  for (const limit of [0, 101, 1.5, Number.NaN]) {
    await assert.rejects(runLeadRetention({ ...fixture, limit }), /lead_retention_limit_invalid/);
  }
});

test("orphan sweep keeps recent and referenced objects and deletes only old unreferenced keys", async () => {
  const events: string[] = [];
  const fixture = retentionFixture(events, {
    expired: [],
    objects: [
      { key: "private/referenced", lastModified: new Date("2026-09-14T09:00:00.000Z") },
      { key: "private/recent", lastModified: new Date("2026-09-14T11:59:59.000Z") },
      { key: "private/cutoff", lastModified: new Date("2026-09-14T10:00:00.000Z") },
      { key: "private/orphan", lastModified: new Date("2026-09-14T09:59:59.999Z") },
    ],
    references: { "private/referenced": true },
  });
  const report = await runLeadRetention(fixture);
  assert.deepEqual(events, [
    "repository.exists:private/referenced",
    "repository.exists:private/orphan",
    "store.delete:private/orphan",
    "repository.delete-rate-limits:100",
  ]);
  assert.deepEqual(report, { deletedLeads: 0, deletedObjects: 0, deletedOrphans: 1, deletedRateLimits: 0, failures: 0 });
});

test("orphan inspection is bounded even when every old object is still referenced", async () => {
  const events: string[] = [];
  const objects = Array.from({ length: 101 }, (_, index) => ({
    key: `private/referenced-${index}`,
    lastModified: new Date("2026-09-14T09:00:00.000Z"),
  }));
  const references = Object.fromEntries(objects.map(object => [object.key, true]));
  const fixture = retentionFixture(events, { expired: [], objects, references });
  const report = await runLeadRetention({ ...fixture, limit: 100 });
  assert.equal(events.filter(event => event.startsWith("repository.exists:")).length, 100);
  assert.equal(events.includes("repository.exists:private/referenced-100"), false);
  assert.equal(events.at(-1), "repository.delete-rate-limits:100");
  assert.deepEqual(report, { deletedLeads: 0, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 0 });
});

test("orphan failures are isolated and logging never includes keys or dependency errors", async () => {
  const records: unknown[] = [];
  const fixture = retentionFixture([], {
    expired: [],
    objects: [
      { key: "private/lookup-secret", lastModified: new Date(1) },
      { key: "private/delete-secret", lastModified: new Date(1) },
      { key: "private/success", lastModified: new Date(1) },
    ],
    references: { "private/lookup-secret": new Error("database password"), "private/delete-secret": false },
    deleteResults: { "private/delete-secret": new Error("storage credentials") },
  });
  const report = await runLeadRetention({ ...fixture, logger: { write(record) { records.push(record); } } });
  assert.deepEqual(report, { deletedLeads: 0, deletedObjects: 0, deletedOrphans: 1, deletedRateLimits: 0, failures: 2 });
  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, /lookup-secret|delete-secret|database password|storage credentials/);
  assert.match(serialized, /lead_retention_completed/);
});

test("expired rate-limit cleanup is bounded, counted and isolated without logging bucket identifiers", async () => {
  const records: unknown[] = [];
  const success = retentionFixture([], { expired: [], rateLimitResult: 7 });
  assert.deepEqual(await runLeadRetention({ ...success, limit: 9, logger: { write(record) { records.push(record); } } }), {
    deletedLeads: 0, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 7, failures: 0,
  });
  assert.equal(success.calls.limit, 9);
  assert.match(JSON.stringify(records), /"deletedRateLimits":7/);

  const failedRecords: unknown[] = [];
  const failure = retentionFixture([], { expired: [], rateLimitResult: new Error("bucket-secret deadbeef") });
  assert.deepEqual(await runLeadRetention({ ...failure, logger: { write(record) { failedRecords.push(record); } } }), {
    deletedLeads: 0, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 1,
  });
  assert.doesNotMatch(JSON.stringify(failedRecords), /bucket-secret|deadbeef/);
});

test("private store reports confirmed NoSuchKey only to retention", async () => {
  const config: LeadS3Config = {
    endpoint: new URL("https://private.invalid"), region: "lead-region", bucket: "private-leads",
    accessKeyId: "lead-only", secretAccessKey: "private-secret", prefix: "private/", serverSideEncryption: "AES256",
  };
  const client = { send: (async () => { throw Object.assign(new Error("secret"), { name: "NoSuchKey" }); }) as S3Client["send"] };
  const store = createPrivateAttachmentStore(config, client);
  assert.equal(await store.deleteForRetention("private/missing"), "missing");
  await assert.rejects(store.delete("private/missing"), MissingPrivateObjectError);
});

test("retention command runs one bounded batch and succeeds only without failures", async () => {
  const requested: unknown[] = [];
  const lines: string[] = [];
  const report = { deletedLeads: 2, deletedObjects: 1, deletedOrphans: 3, deletedRateLimits: 4, failures: 0 };
  const exitCode = await runLeadRetentionCommand(async () => ({
    entry: { module: { async runLeadRetention(options: unknown) { requested.push(options); return report; } } },
  }), { info(line: string) { lines.push(line); }, error(line: string) { lines.push(line); } });
  assert.equal(exitCode, 0);
  assert.deepEqual(requested, [{ limit: 100 }]);
  assert.deepEqual(lines, ["Lead retention completed: leads=2 objects=1 orphans=3 rate_limits=4 failures=0"]);
});

test("retention command returns a nonzero exit code when any item failed", async () => {
  const lines: string[] = [];
  const exitCode = await runLeadRetentionCommand(async () => ({
    entry: { module: { async runLeadRetention() {
      return { deletedLeads: 1, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 1 };
    } } },
  }), { info(line: string) { lines.push(line); }, error(line: string) { lines.push(line); } });
  assert.equal(exitCode, 1);
  assert.deepEqual(lines, ["Lead retention failed: leads=1 objects=0 orphans=0 rate_limits=0 failures=1"]);
});
