import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";

import { createDb } from "../db/client";
import { leadAttachments, leadDeliveryJobs, leadRateLimits, leads } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createLeadRepository, type AcceptCommand, type LeaseFence } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

function command(overrides: Partial<AcceptCommand> = {}): AcceptCommand {
  return {
    submissionKey: randomUUID(), requestFingerprint: "a".repeat(64),
    fields: { name: "Анна", phone: "+7 (999) 111-22-33", phoneDigits: "79991112233", description: "Нужна CRM", consent: true, honeypot: "" },
    context: { pagePath: "/services/crm", referrer: "https://korotkov.dev/services", utm: { source: "test" } },
    phoneHash: "b".repeat(64), ipHash: "c".repeat(64), consentVersion: "2026-09-14",
    attachment: null,
    ...overrides,
  };
}

const attachment = {
  objectKey: "lead-intake/opaque-object", originalName: "brief.pdf", mediaType: "application/pdf" as const,
  byteSize: 1024, sha256: "d".repeat(64), scanMetadata: { engine: "ClamAV", result: "clean" },
  scannedAt: new Date("2026-09-14T09:00:00.000Z"),
};

async function fixture() {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  let time = new Date("2026-09-14T09:00:00.000Z");
  const clock = { now: () => new Date(time) };
  return { db, clock, repository: createLeadRepository(db, clock), advance(ms: number) { time = new Date(+time + ms); } };
}

databaseTest("eight identical concurrent accepts persist one lead, attachment and exactly two jobs", async () => {
  const { db, repository } = await fixture();
  const input = command({ attachment });
  const results = await Promise.all(Array.from({ length: 8 }, () => repository.accept(input)));
  assert.equal(results.filter((r) => r.kind === "accepted").length, 1);
  assert.equal(results.filter((r) => r.kind === "replayed").length, 7);
  const [lead] = await db.select().from(leads);
  assert.equal((await db.select().from(leads)).length, 1);
  for (const result of results) {
    assert.ok(result.kind === "accepted" || result.kind === "replayed");
    assert.deepEqual(result.response, { leadId: lead.id, status: "accepted" });
  }
  assert.equal(lead.acceptedAt.toISOString(), "2026-09-14T09:00:00.000Z");
  assert.equal(lead.expiresAt.toISOString(), "2026-10-14T09:00:00.000Z");
  assert.equal(lead.consentAt.toISOString(), lead.acceptedAt.toISOString());
  assert.deepEqual(lead.utm, { source: "test" });
  const attachments = await db.select().from(leadAttachments);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].expiresAt.toISOString(), lead.expiresAt.toISOString());
  assert.deepEqual((await db.select().from(leadDeliveryJobs)).map((r) => r.channel).sort(), ["crm", "email"]);
  assert.equal((await db.select().from(leadRateLimits))[0].count, 1);
  assert.deepEqual(await repository.findBySubmissionKey(input.submissionKey), {
    id: lead.id, submissionKey: input.submissionKey, requestFingerprint: input.requestFingerprint,
    consentVersion: input.consentVersion, successResponse: { leadId: lead.id, status: "accepted" },
  });
  assert.equal(await repository.findBySubmissionKey(randomUUID()), null);
});

databaseTest("concurrent differing fingerprints conflict without spending the phone bucket", async () => {
  const { db, repository } = await fixture();
  const input = command();
  const results = await Promise.all([repository.accept(input), repository.accept({ ...input, requestFingerprint: "e".repeat(64) })]);
  assert.deepEqual(results.map((r) => r.kind).sort(), ["accepted", "conflict"]);
  assert.equal((await db.select().from(leads)).length, 1);
  assert.equal((await db.select().from(leadAttachments)).length, 0);
  assert.equal((await db.select().from(leadRateLimits))[0].count, 1);
  assert.equal((await repository.accept({ ...input, requestFingerprint: "short" })).kind, "conflict");
});

databaseTest("failure inserting the second outbox job rolls back lead, attachment, both jobs and phone quota", async () => {
  const { db, repository } = await fixture();
  // Real PostgreSQL failure at the last write, keeping transaction semantics intact.
  await db.execute(sql`CREATE FUNCTION fail_email_job() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.channel = 'email' THEN RAISE EXCEPTION 'injected_transaction_failure'; END IF; RETURN NEW; END $$`);
  await db.execute(sql`CREATE TRIGGER fail_email BEFORE INSERT ON lead_delivery_jobs FOR EACH ROW EXECUTE FUNCTION fail_email_job()`);
  const input = command({ attachment });
  await assert.rejects(() => repository.accept(input));
  for (const table of [leads, leadAttachments, leadDeliveryJobs, leadRateLimits]) {
    assert.equal((await db.select().from(table)).length, 0);
  }
  await db.execute(sql`DROP TRIGGER fail_email ON lead_delivery_jobs`);
  assert.equal((await repository.accept(input)).kind, "accepted");
});

databaseTest("concurrent IP attempts admit five and return the exact remaining fixed window", async () => {
  const { db, repository, advance } = await fixture();
  advance(10_500);
  const decisions = await Promise.all(Array.from({ length: 12 }, () => repository.consumeIpAttempt("a".repeat(64))));
  assert.equal(decisions.filter((r) => r.kind === "allowed").length, 5);
  assert.deepEqual(decisions.filter((r) => r.kind === "rate_limited"), Array(7).fill({ kind: "rate_limited", retryAfterSeconds: 1790 }));
  assert.equal((await db.select().from(leadRateLimits))[0].count, 5);
  advance(1_789_000);
  assert.deepEqual(await repository.consumeIpAttempt("a".repeat(64)), { kind: "rate_limited", retryAfterSeconds: 1 });
  advance(500);
  assert.deepEqual(await repository.consumeIpAttempt("a".repeat(64)), { kind: "allowed" });
});

databaseTest("eight new concurrent phone submissions admit three; replay still works at quota", async () => {
  const { db, repository, advance } = await fixture();
  const inputs = Array.from({ length: 8 }, () => command());
  const results = await Promise.all(inputs.map((input) => repository.accept(input)));
  assert.equal(results.filter((r) => r.kind === "accepted").length, 3);
  assert.deepEqual(results.filter((r) => r.kind === "rate_limited"), Array(5).fill({ kind: "rate_limited", retryAfterSeconds: 3600 }));
  const acceptedIndex = results.findIndex((r) => r.kind === "accepted");
  assert.equal((await repository.accept(inputs[acceptedIndex])).kind, "replayed");
  assert.equal((await db.select().from(leads)).length, 3);
  assert.equal((await db.select().from(leadDeliveryJobs)).length, 6);
  assert.equal((await db.select().from(leadRateLimits))[0].count, 3);
  advance(3_600_000);
  assert.equal((await repository.accept(command())).kind, "accepted");
});

databaseTest("concurrent CRM reservations admit twenty per token and reset at the minute boundary", async () => {
  const { db, repository, advance } = await fixture();
  advance(59_500);
  const results = await Promise.all(Array.from({ length: 25 }, () => repository.reserveCrmTokenAttempt("f".repeat(64))));
  assert.equal(results.filter((r) => r.kind === "allowed").length, 20);
  assert.deepEqual(results.filter((r) => r.kind === "rate_limited"), Array(5).fill({ kind: "rate_limited", retryAfterSeconds: 1 }));
  assert.equal((await db.select().from(leadRateLimits))[0].count, 20);
  assert.deepEqual(await repository.reserveCrmTokenAttempt("e".repeat(64)), { kind: "allowed" });
  advance(500);
  assert.deepEqual(await repository.reserveCrmTokenAttempt("f".repeat(64)), { kind: "allowed" });
});

databaseTest("concurrent workers claim disjoint jobs and receive immutable lead metadata without internal hashes", async () => {
  const { db, repository } = await fixture();
  const input = command({ attachment });
  await repository.accept(input);
  const batches = await Promise.all(Array.from({ length: 8 }, (_, i) => repository.claimDueJobs(`worker-${i}`, 1, 120_000)));
  const jobs = batches.flat();
  assert.equal(jobs.length, 2);
  assert.equal(new Set(jobs.map((job) => job.id)).size, 2);
  for (const job of jobs) {
    assert.equal(job.attemptCount, 1);
    assert.equal(job.leaseExpiresAt.toISOString(), "2026-09-14T09:02:00.000Z");
    assert.equal(job.acceptedAt.toISOString(), "2026-09-14T09:00:00.000Z");
    assert.deepEqual(job.lead, { ...input.fields, pagePath: input.context.pagePath, referrer: input.context.referrer });
    assert.deepEqual(job.attachment, { objectKey: attachment.objectKey, originalName: "brief.pdf", mediaType: "application/pdf", sha256: "d".repeat(64) });
    assert.ok(!JSON.stringify(job).includes(input.phoneHash));
    assert.ok(!JSON.stringify(job).includes(input.ipHash));
    assert.ok(!JSON.stringify(job).includes(input.requestFingerprint));
  }
  assert.deepEqual(await repository.claimDueJobs("other", 10, 120_000), []);
  assert.ok((await db.select().from(leadDeliveryJobs)).every((job) => job.status === "processing"));
});

databaseTest("only expired processing leases are reclaimed once and stale attempts cannot mutate", async () => {
  const { db, repository, advance } = await fixture();
  await repository.accept(command());
  const [job] = await repository.claimDueJobs("owner", 1, 120_000);
  const fence: LeaseFence = { jobId: job.id, ownerId: "owner", attemptCount: job.attemptCount };
  await db.update(leadDeliveryJobs).set({ status: "terminal" }).where(sql`${leadDeliveryJobs.id} <> ${job.id}`);
  advance(119_999);
  assert.deepEqual(await repository.claimDueJobs("other", 10, 120_000), []);
  advance(1);
  assert.equal(await repository.markDelivered(fence), false);
  const reclaimed = (await Promise.all(Array.from({ length: 8 }, () => repository.claimDueJobs("owner", 1, 120_000)))).flat();
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].id, job.id);
  assert.equal(reclaimed[0].attemptCount, 2);
  assert.equal(await repository.markDelivered(fence), false);
  assert.equal(await repository.reschedule({ ...fence, nextAttemptAt: new Date("2026-09-15"), code: "vendor_retry" }), false);
  assert.equal(await repository.markTerminal({ ...fence, code: "vendor_terminal" }), false);
  assert.equal(await repository.markManualAction({ ...fence, code: "idempotency_expired" }), false);
  assert.equal(await repository.markDelivered({ ...fence, attemptCount: 2, ownerId: "wrong" }), false);
  assert.equal(await repository.markDelivered({ ...fence, attemptCount: 2 }), true);
});

databaseTest("delivery transitions release leases; retries wait until due and terminal/manual jobs stay closed", async () => {
  const { db, repository, advance } = await fixture();
  await repository.accept(command());
  const jobs = await repository.claimDueJobs("owner", 10, 120_000);
  const crm = jobs.find((job) => job.channel === "crm")!;
  const email = jobs.find((job) => job.channel === "email")!;
  const fence = (id: string, attemptCount = 1): LeaseFence => ({ jobId: id, ownerId: "owner", attemptCount });
  assert.equal(await repository.markDelivered({ ...fence(email.id), vendorRequestId: "email-id", responseMetadata: { messageId: "email-id" } }), true);
  assert.equal(await repository.reschedule({ ...fence(crm.id), nextAttemptAt: new Date("2026-09-14T09:01:00Z"), code: "vendor_retry" }), true);
  assert.deepEqual(await repository.claimDueJobs("owner", 10, 120_000), []);
  advance(60_000);
  assert.equal((await repository.claimDueJobs("owner", 10, 120_000))[0].id, crm.id);
  assert.equal(await repository.markManualAction({ ...fence(crm.id, 2), code: "idempotency_expired" }), true);
  await repository.accept(command());
  for (const job of await repository.claimDueJobs("owner", 10, 120_000)) {
    assert.equal(await repository.markTerminal({ ...fence(job.id), code: "vendor_terminal" }), true);
  }
  advance(180_000);
  assert.deepEqual(await repository.claimDueJobs("owner", 10, 120_000), []);
  const rows = await db.select().from(leadDeliveryJobs);
  assert.ok(rows.every((row) => row.leaseOwner === null && row.leaseExpiresAt === null));
  const delivered = rows.find((row) => row.id === email.id)!;
  assert.equal(delivered.deliveredAt!.toISOString(), "2026-09-14T09:00:00.000Z");
  assert.equal(delivered.vendorRequestId, "email-id");
  assert.deepEqual(delivered.responseMetadata, { messageId: "email-id" });
  assert.equal(rows.find((row) => row.id === crm.id)!.lastErrorCode, "idempotency_expired");
});

databaseTest("retention finds bounded expired leads and deletes rows only after expiration", async () => {
  const { db, repository, advance } = await fixture();
  const first = await repository.accept(command({ attachment }));
  assert.equal(first.kind, "accepted");
  if (first.kind !== "accepted") throw new Error("missing accepted lead");
  assert.equal(await repository.attachmentKeyExists(attachment.objectKey), true);
  assert.equal(await repository.attachmentKeyExists("not-stored"), false);
  assert.equal(await repository.deleteLeadAfterObject(first.response.leadId), false);
  advance(30 * 86_400_000 - 1);
  assert.deepEqual(await repository.findExpiredLeads(10), []);
  advance(1);
  assert.deepEqual(await repository.findExpiredLeads(1), [{ id: first.response.leadId, objectKey: attachment.objectKey }]);
  assert.equal(await repository.deleteLeadAfterObject(first.response.leadId), true);
  assert.equal(await repository.attachmentKeyExists(attachment.objectKey), false);
  for (const table of [leads, leadAttachments, leadDeliveryJobs]) assert.equal((await db.select().from(table)).length, 0);
  const second = await repository.accept(command());
  assert.ok(second.kind === "accepted");
  advance(30 * 86_400_000);
  assert.deepEqual(await repository.findExpiredLeads(1), [{ id: second.response.leadId, objectKey: null }]);
});

databaseTest("invalid lease and batch bounds are rejected before claiming work", async () => {
  const { repository } = await fixture();
  await repository.accept(command());
  for (const leaseMs of [0, -1, 120_001, NaN]) await assert.rejects(() => repository.claimDueJobs("owner", 1, leaseMs));
  for (const limit of [0, -1, 1001, 1.5]) {
    await assert.rejects(() => repository.claimDueJobs("owner", limit, 120_000));
    await assert.rejects(() => repository.findExpiredLeads(limit));
  }
  assert.equal((await repository.claimDueJobs("owner", 1, 1000)).length, 1);
});

databaseTest("arbitrary vendor and scan metadata never become persisted credentials or raw error text", async () => {
  const { db, repository } = await fixture();
  await repository.accept(command({ attachment: { ...attachment, scanMetadata: { engine: "ClamAV", result: "clean", token: "scan-secret" } } }));
  const [email, crm] = await repository.claimDueJobs("owner", 2, 120_000);
  await repository.markDelivered({ jobId: email.id, ownerId: "owner", attemptCount: 1,
    vendorRequestId: "Bearer private-secret", responseMetadata: {
      messageId: "mail-id", authorization: "Bearer private-secret", rawBody: "192.0.2.1",
      taskCode: "x".repeat(5000),
    },
  });
  await repository.markTerminal({ jobId: crm.id, ownerId: "owner", attemptCount: 1, code: "provider error: Bearer private-secret" });
  const rows = await db.select().from(leadDeliveryJobs);
  assert.deepEqual(rows.find((row) => row.id === email.id)!.responseMetadata, { messageId: "mail-id" });
  assert.equal(rows.find((row) => row.id === email.id)!.vendorRequestId, null);
  assert.equal(rows.find((row) => row.id === crm.id)!.lastErrorCode, "delivery_error");
  assert.deepEqual((await db.select().from(leadAttachments))[0].scanMetadata, { engine: "ClamAV", result: "clean" });
});
