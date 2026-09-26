import assert from "node:assert/strict";
import test from "node:test";

import type { ClaimedJob } from "./contracts";
import { FatalTempCleanupError } from "./objectStore";
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
    providerAttemptCount: 0,
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
    async syncCrmTokenBudget(hash: string, limit: number, remaining: number) { events.push(`sync:${hash}:${limit}:${remaining}`); },
    async renewLease(command: { jobId: string }, leaseMs: number) { events.push(`renew:${command.jobId}:${leaseMs}`); return true; },
    async beginProviderAttempt(command: { jobId: string }) { events.push(`provider:${command.jobId}`); return (jobs.find(item => item.id === command.jobId)?.providerAttemptCount ?? 0) + 1; },
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
  const emailJob = { ...job("email", 12), providerAttemptCount: 11 };
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

test("CRM crossing the exact cutoff during attachment materialization stops before provider attempt", async () => {
  const exactCutoff = new Date("2026-09-14T10:10:00.000Z");
  let currentTime = new Date("2026-09-14T10:09:59.999Z");
  const crmJob = { ...job("crm", 1, true), acceptedAt: new Date("2026-09-13T10:15:00.000Z") };
  const f = fixture([crmJob]);
  f.options.clock = { now: () => currentTime };
  f.options.store = { async materialize() {
    f.events.push("materialize");
    currentTime = exactCutoff;
    return { path: "/private/materialized", async dispose() { f.events.push("dispose"); } };
  } };
  let crmCalls = 0;
  f.options.crm = async () => { crmCalls += 1; return {} as never; };

  await runWorkerBatch(f.options);

  assert.equal(f.states.get(crmJob.id), "manual_action");
  assert.equal(crmCalls, 0);
  assert.equal(f.events.some(event => event.startsWith("provider:")), false);
  assert.ok(f.events.includes(`manual:${crmJob.id}:crm_idempotency_window_expired`));
  assert.ok(f.events.includes("dispose"));
});

test("CRM crossing the exact cutoff during provider-attempt persistence stops before vendor call", async () => {
  const exactCutoff = new Date("2026-09-14T10:10:00.000Z");
  let currentTime = new Date("2026-09-14T10:09:59.999Z");
  const crmJob = { ...job("crm"), acceptedAt: new Date("2026-09-13T10:15:00.000Z") };
  const f = fixture([crmJob]);
  f.options.clock = { now: () => currentTime };
  f.options.repository.beginProviderAttempt = async command => {
    f.events.push(`provider:${command.jobId}`);
    currentTime = exactCutoff;
    return 1;
  };
  let crmCalls = 0;
  f.options.crm = async () => { crmCalls += 1; return {} as never; };

  await runWorkerBatch(f.options);

  assert.equal(f.states.get(crmJob.id), "manual_action");
  assert.equal(crmCalls, 0);
  assert.ok(f.events.includes(`provider:${crmJob.id}`));
  assert.ok(f.events.includes(`manual:${crmJob.id}:crm_idempotency_window_expired`));
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
  const crmDelivery = delivered.find(value => value.includes(crmJob.id)) ?? "";
  const emailDelivery = delivered.find(value => value.includes(emailJob.id)) ?? "";
  assert.match(crmDelivery, /"taskId":"42"/);
  assert.match(crmDelivery, /"rateRemaining":"19"/);
  assert.doesNotMatch(crmDelivery, /name|phone|token/i);
  assert.match(emailDelivery, /"messageId":"<lead@example.test>"/);
  assert.ok(f.events.includes(`sync:${"f".repeat(64)}:20:19`));
});

test("CRM deal delivery persists only bounded contact, deal, and activity identifiers", async () => {
  const crmJob = job("crm");
  const f = fixture([crmJob]);
  f.options.crm = async () => ({
    requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    contactId: 72,
    contactReused: true,
    dealId: 915,
    pipelineId: 12,
    stageId: 34,
    activityId: 1502,
    activityDueAt: "2026-09-15 18:00:00",
    replayed: false,
    rateLimit: 20,
    rateRemaining: 19,
    dealTitle: "Анна",
    activitySubject: "Связаться по заявке",
  } as never);

  await runWorkerBatch(f.options);

  const delivery = f.events.find(value => value.startsWith(`delivered:${crmJob.id}:`)) ?? "";
  assert.match(delivery, /"contactId":"72"/);
  assert.match(delivery, /"contactReused":"true"/);
  assert.match(delivery, /"dealId":"915"/);
  assert.match(delivery, /"pipelineId":"12"/);
  assert.match(delivery, /"stageId":"34"/);
  assert.match(delivery, /"activityId":"1502"/);
  assert.match(delivery, /"activityDueAt":"2026-09-15 18:00:00"/);
  assert.doesNotMatch(delivery, /Анна|Связаться по заявке/u);
});

test("claimed jobs start concurrently and renew their leases while providers are in flight", async () => {
  const first = job("crm"), second = job("email");
  const f = fixture([first, second]);
  let started = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.options.heartbeatIntervalMs = 1;
  f.options.crm = async () => { started += 1; await gate; return { requestId: null, taskId: 1, taskCode: "ONE", taskStatus: "new", dueDate: "2026-09-15 18:00:00", replayed: false, rateLimit: 20, rateRemaining: 18 }; };
  f.options.email = async () => { started += 1; await gate; return { messageId: "mail" }; };
  const running = runWorkerBatch(f.options);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(started, 2, "later jobs must not wait behind the first provider call");
  assert.ok(f.events.some(value => value.startsWith(`renew:${first.id}:`)));
  assert.ok(f.events.some(value => value.startsWith(`renew:${second.id}:`)));
  release();
  assert.equal(await running, 2);
});

test("lost lease transition rejects the completed batch with a sanitized operational error", async () => {
  const f = fixture([job("email")]);
  f.options.repository.markDelivered = async () => false;
  await assert.rejects(() => runWorkerBatch(f.options), /^Error: lead_lease_lost$/);
});

test("heartbeat lease loss prevents the post-provider state transition", async () => {
  const emailJob = job("email");
  const f = fixture([emailJob]);
  f.options.heartbeatIntervalMs = 1;
  f.options.repository.renewLease = async () => false;
  f.options.email = async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { messageId: "ambiguous-provider-result" };
  };
  await assert.rejects(() => runWorkerBatch(f.options), /^Error: lead_lease_lost$/);
  assert.equal(f.states.has(emailJob.id), false);
});

test("provider attempts exclude token and materialization failures and prevent a thirteenth SMTP call", async () => {
  const blocked = fixture([job("crm", 4, true)], { kind: "rate_limited", retryAfterSeconds: 5 });
  await runWorkerBatch(blocked.options);
  assert.equal(blocked.events.some(value => value.startsWith("provider:")), false);

  const storageFailure = fixture([job("email", 7, true)]);
  storageFailure.options.store = { async materialize() { throw new Error("private S3 endpoint"); } };
  await runWorkerBatch(storageFailure.options);
  assert.equal(storageFailure.events.some(value => value.startsWith("provider:")), false);
  assert.equal(storageFailure.states.get(job("email").id), "retry");

  const exhaustedJob = { ...job("email", 9), providerAttemptCount: 12 };
  const exhausted = fixture([exhaustedJob]);
  let calls = 0;
  exhausted.options.email = async () => { calls += 1; return { messageId: "never" }; };
  await runWorkerBatch(exhausted.options);
  assert.equal(calls, 0);
  assert.equal(exhausted.states.get(exhaustedJob.id), "manual_action");
});

test("dispose failure is retried by the store and then surfaces after delivery", async () => {
  const f = fixture([job("email", 1, true)]);
  f.options.store = { async materialize() { return { path: "/private/materialized", async dispose() { throw new Error("private path"); } }; } };
  await assert.rejects(() => runWorkerBatch(f.options), /^Error: lead_temp_cleanup_failed$/);
  assert.equal(f.states.get(job("email").id), "delivered");
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

test("shutdown aborts hanging materialization, stops heartbeat and exits after recording retry", async () => {
  const attachmentJob = job("email", 1, true);
  const f = fixture([attachmentJob]);
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined, renewals = 0;
  f.options.heartbeatIntervalMs = 1;
  f.options.repository.renewLease = async () => { renewals += 1; return true; };
  f.options.store = {
    async materialize(input) {
      receivedSignal = input.signal;
      return new Promise((_resolve, reject) => input.signal?.addEventListener("abort", () => reject(new Error("private S3 wait")), { once: true }));
    },
  };
  const running = runLeadWorker({ ...f.options, signal: controller.signal, pollIntervalMs: 1 });
  await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort();
  await running;
  const renewalsAtExit = renewals;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(receivedSignal, controller.signal);
  assert.equal(f.states.get(attachmentJob.id), "retry");
  assert.equal(renewals, renewalsAtExit, "heartbeat must stop before worker exits");
  assert.equal(f.claims, 1);
});

test("fatal materialization cleanup stops the long-running worker without retry or another claim", async () => {
  const attachmentJob = job("email", 1, true);
  const f = fixture([attachmentJob]);
  f.options.store = { async materialize() { throw new FatalTempCleanupError(); } };
  await assert.rejects(() => runLeadWorker(f.options), /^Error: lead_temp_cleanup_failed$/);
  assert.equal(f.claims, 1);
  assert.equal(f.states.size, 0);
  assert.equal(f.events.some(value => value.startsWith("provider:")), false);
  assert.equal(f.events.some(value => value.startsWith("retry:")), false);
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
