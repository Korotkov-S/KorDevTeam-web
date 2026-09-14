import assert from "node:assert/strict";
import test from "node:test";

import type { ClaimedJob } from "./contracts";
import { DeliveryFailure } from "./retry";
import type { LeadRepository, RateDecision } from "./repository";
import { checkLeadWorkerReady, runLeadWorker, runWorkerBatch, type WorkerOptions } from "./worker";

const acceptedAt = new Date("2026-09-14T10:00:00.000Z");
const now = new Date("2026-09-14T10:10:00.000Z");

function job(channel: "crm" | "email", attemptCount = 1, attachment = false): ClaimedJob {
  return {
    id: `${channel === "crm" ? "11111111" : "22222222"}-2222-4222-8222-222222222222`,
    leadId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    channel,
    attemptCount,
    acceptedAt,
    leaseExpiresAt: new Date(+now + 120_000),
    lead: {
      name: "Анна", phone: "+7 999 111-22-33", phoneDigits: "79991112233",
      description: "Нужна интеграция", consent: true, honeypot: "", pagePath: "/contacts", referrer: null,
    },
    attachment: attachment ? {
      objectKey: "intake/private/file.pdf", originalName: "brief.pdf", mediaType: "application/pdf", sha256: "a".repeat(64),
    } : null,
  };
}

function fixture(jobs: ClaimedJob[], token: RateDecision = { kind: "allowed" }) {
  const states = new Map<string, string>();
  const events: string[] = [];
  let claims = 0;
  const repository = {
    async claimDueJobs(ownerId: string, limit: number, leaseMs: number) {
      events.push(`claim:${ownerId}:${limit}:${leaseMs}`);
      claims += 1;
      return claims === 1 ? jobs : [];
    },
    async reserveCrmTokenAttempt(hash: string) { events.push(`token:${hash}`); return token; },
    async markDelivered(command: { jobId: string; responseMetadata?: Record<string, string> }) {
      states.set(command.jobId, "delivered"); events.push(`delivered:${command.jobId}:${JSON.stringify(command.responseMetadata ?? {})}`); return true;
    },
    async reschedule(command: { jobId: string; code: string; nextAttemptAt: Date }) {
      states.set(command.jobId, "retry"); events.push(`retry:${command.jobId}:${command.code}:${command.nextAttemptAt.toISOString()}`); return true;
    },
    async markTerminal(command: { jobId: string; code: string }) {
      states.set(command.jobId, "terminal"); events.push(`terminal:${command.jobId}:${command.code}`); return true;
    },
    async markManualAction(command: { jobId: string; code: string }) {
      states.set(command.jobId, "manual_action"); events.push(`manual:${command.jobId}:${command.code}`); return true;
    },
  } as unknown as LeadRepository;
  const options: WorkerOptions = {
    repository,
    crm: async () => ({ requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", taskId: 42, taskCode: "TASK-42", taskStatus: "new", dueDate: "2026-09-15 18:00:00", replayed: false, rateLimit: 20, rateRemaining: 19 }),
    email: async () => ({ messageId: "<lead@example.test>" }),
    store: { async materialize() { events.push("materialize"); return { path: "/private/materialized", async dispose() { events.push("dispose"); } }; } },
    tempRoot: "/private/tmp",
    ownerId: "33333333-4444-4555-8666-777777777777",
    crmTokenHash: "f".repeat(64),
    clock: { now: () => now },
    random: () => 0,
  };
  return { options, states, events, get claims() { return claims; } };
}

test("one channel failure does not suppress the other channel", async () => {
  const crm = job("crm"), email = job("email");
  const f = fixture([crm, email]);
  f.options.crm = async () => { throw new DeliveryFailure({ kind: "retry" }); };
  const processed = await runWorkerBatch(f.options);
  assert.equal(processed, 2);
  assert.equal(f.states.get(crm.id), "retry");
  assert.equal(f.states.get(email.id), "delivered");
});

test("CRM token exhaustion reschedules to the window end without calling or materializing", async () => {
  const crmJob = job("crm", 3, true);
  const f = fixture([crmJob], { kind: "rate_limited", retryAfterSeconds: 37 });
  let calls = 0;
  f.options.crm = async () => { calls += 1; throw new Error("must not run"); };
  await runWorkerBatch(f.options);
  assert.equal(calls, 0);
  assert.equal(f.states.get(crmJob.id), "retry");
  assert.ok(f.events.includes(`retry:${crmJob.id}:crm_rate_limited:2026-09-14T10:10:37.000Z`));
  assert.equal(f.events.includes("materialize"), false);
});

test("CRM token delay crossing the cutoff becomes manual action immediately", async () => {
  const crmJob = { ...job("crm", 4), acceptedAt: new Date(+now - (23 * 60 + 54.5) * 60_000) };
  const f = fixture([crmJob], { kind: "rate_limited", retryAfterSeconds: 60 });
  await runWorkerBatch(f.options);
  assert.equal(f.states.get(crmJob.id), "manual_action");
  assert.ok(f.events.some(value => value.includes("crm_idempotency_window_expired")));
});

test("CRM cutoff skips delivery and the twelfth transient SMTP failure becomes manual action", async () => {
  const crmJob = { ...job("crm"), acceptedAt: new Date(+now - (23 * 60 + 55) * 60_000) };
  const emailJob = job("email", 12);
  const f = fixture([crmJob, emailJob]);
  let calls = 0;
  f.options.crm = async () => { calls += 1; return {} as never; };
  f.options.email = async () => { calls += 1; throw new DeliveryFailure({ kind: "retry" }); };
  await runWorkerBatch(f.options);
  assert.equal(calls, 1);
  assert.equal(f.states.get(crmJob.id), "manual_action");
  assert.equal(f.states.get(emailJob.id), "manual_action");
  assert.ok(f.events.some(value => value.includes("crm_idempotency_window_expired")));
  assert.ok(f.events.some(value => value.includes("email_attempts_exhausted")));
});

test("materialized attachment is disposed after both successful and failed delivery", async () => {
  const crmJob = job("crm", 1, true), emailJob = job("email", 1, true);
  const f = fixture([crmJob, emailJob]);
  f.options.email = async () => { throw new DeliveryFailure({ kind: "manual_action", code: "smtp_configuration_invalid" }); };
  await runWorkerBatch(f.options);
  assert.equal(f.events.filter(value => value === "materialize").length, 2);
  assert.equal(f.events.filter(value => value === "dispose").length, 2);
  assert.equal(f.states.get(crmJob.id), "delivered");
  assert.equal(f.states.get(emailJob.id), "manual_action");
});

test("delivery persists only the bounded receipt projection", async () => {
  const crmJob = job("crm"), emailJob = job("email");
  const f = fixture([crmJob, emailJob]);
  f.options.crm = async () => ({
    requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", taskId: 42, taskCode: "TASK-42", taskStatus: "new",
    dueDate: "2026-09-15 18:00:00", replayed: false, rateLimit: 20, rateRemaining: 19,
    rawBody: "Bearer secret contact payload",
  } as never);
  await runWorkerBatch(f.options);
  const delivered = f.events.filter(value => value.startsWith("delivered:"));
  assert.match(delivered[0], /"taskId":"42"/);
  assert.match(delivered[0], /"rateRemaining":"19"/);
  assert.doesNotMatch(delivered[0], /name|phone|token/i);
  assert.match(delivered[1], /"messageId":"<lead@example.test>"/);
});

test("competing worker batches never deliver a job hidden by an active lease", async () => {
  const claimed = job("crm");
  let active = false, calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const base = fixture([]);
  base.options.repository.claimDueJobs = async () => {
    if (active) return [];
    active = true;
    return [claimed];
  };
  base.options.crm = async () => {
    calls += 1;
    await gate;
    return { requestId: null, taskId: 1, taskCode: "ONE", taskStatus: "new", dueDate: "2026-09-15 18:00:00", replayed: false, rateLimit: 20, rateRemaining: 19 };
  };
  const first = runWorkerBatch(base.options);
  await new Promise(resolve => setImmediate(resolve));
  const second = await runWorkerBatch({ ...base.options, ownerId: "44444444-5555-4666-8777-888888888888" });
  assert.equal(second, 0);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, 1);
});

test("a repository-reclaimed expired lease is delivered with its new attempt fence", async () => {
  const reclaimed = job("email", 2);
  const f = fixture([]);
  let expired = false;
  f.options.repository.claimDueJobs = async () => expired ? [reclaimed] : [];
  assert.equal(await runWorkerBatch(f.options), 0);
  expired = true;
  assert.equal(await runWorkerBatch({ ...f.options, ownerId: "55555555-6666-4777-8888-999999999999" }), 1);
  assert.equal(f.states.get(reclaimed.id), "delivered");
});

test("long-running worker stops after the current batch and never claims again", async () => {
  const f = fixture([job("email")]);
  const controller = new AbortController();
  f.options.email = async envelope => { controller.abort(); return { messageId: `<${envelope.leadId}>` }; };
  await runLeadWorker({ ...f.options, signal: controller.signal, pollIntervalMs: 1 });
  assert.equal(f.claims, 1);
  assert.equal(f.states.get(job("email").id), "delivered");
});

test("worker readiness validates configuration and database only", async () => {
  const events: string[] = [];
  await checkLeadWorkerReady({
    environment: { marker: "safe" },
    validateConfig(environment) { events.push(`config:${environment.marker}`); },
    async checkDatabase() { events.push("database"); },
  });
  assert.deepEqual(events, ["config:safe", "database"]);
});
