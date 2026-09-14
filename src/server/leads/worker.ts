import { checkDatabaseReady, getDb } from "../db/client";
import type { ClaimedJob } from "./contracts";
import { readLeadWorkerConfig, type LeadWorkerConfig } from "./config";
import { sendToCrm, type CrmReceipt, type DeliveryEnvelope } from "./crm";
import { createLeadEmailTransport, sendLeadEmail, type EmailReceipt } from "./email";
import { createPrivateAttachmentStore, MissingPrivateObjectError, sweepMaterializedAttachments, type PrivateAttachmentStore } from "./objectStore";
import { createLeadRepository, type LeadRepository } from "./repository";
import {
  classifyDeliveryFailure, CRM_CUTOFF_MS, nextRetryAt, type DeliveryDecision,
} from "./retry";
import { subjectHash } from "./validation";

const LEASE_MS = 120_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 40_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const STARTUP_SWEEP_AGE_MS = 24 * 60 * 60_000;

export type WorkerClock = { now(): Date };
export type WorkerOptions = {
  repository: LeadRepository;
  crm(envelope: DeliveryEnvelope): Promise<CrmReceipt>;
  email(envelope: DeliveryEnvelope): Promise<EmailReceipt>;
  store: Pick<PrivateAttachmentStore, "materialize">;
  tempRoot: string;
  ownerId: string;
  crmTokenHash: string;
  batchSize?: number;
  clock: WorkerClock;
  random?: () => number;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  heartbeatIntervalMs?: number;
  heartbeatSleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

type ReadinessOptions = {
  environment?: Readonly<Record<string, string | undefined>>;
  validateConfig?: (environment: Readonly<Record<string, string | undefined>>) => unknown;
  checkDatabase?: () => Promise<void>;
};

function fence(job: ClaimedJob, ownerId: string) {
  return { jobId: job.id, ownerId, attemptCount: job.attemptCount };
}

function receiptMetadata(receipt: CrmReceipt | EmailReceipt, keys: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = (receipt as unknown as Record<string, unknown>)[key];
    if (value !== null && ["string", "number", "boolean"].includes(typeof value)) result[key] = String(value);
  }
  return result;
}

function envelope(job: ClaimedJob, attachmentPath: string | null): DeliveryEnvelope {
  return {
    leadId: job.leadId,
    jobId: job.id,
    acceptedAt: job.acceptedAt,
    name: job.lead.name,
    phone: job.lead.phone,
    description: job.lead.description,
    pagePath: job.lead.pagePath,
    referrer: job.lead.referrer,
    attachment: job.attachment && attachmentPath ? {
      path: attachmentPath,
      originalName: job.attachment.originalName,
      mediaType: job.attachment.mediaType,
      sha256: job.attachment.sha256,
    } : null,
  };
}

async function recordDecision(
  job: ClaimedJob,
  options: WorkerOptions,
  decision: DeliveryDecision,
  providerAttemptCount: number,
): Promise<void> {
  const claim = fence(job, options.ownerId);
  if (decision.kind === "terminal") {
    await requireLease(options.repository.markTerminal({ ...claim, code: decision.code }));
    return;
  }
  if (decision.kind === "manual_action") {
    await requireLease(options.repository.markManualAction({ ...claim, code: decision.code }));
    return;
  }
  let nextAttemptAt: Date;
  try {
    nextAttemptAt = nextRetryAt({
      channel: job.channel,
      attemptCount: providerAttemptCount,
      acceptedAt: job.acceptedAt,
      now: options.clock.now(),
      retryAfterSeconds: decision.retryAfterSeconds,
      random: options.random,
    });
  } catch (error) {
    const finalDecision = classifyDeliveryFailure(job.channel, error);
    await requireLease(options.repository.markManualAction({
      ...claim,
      code: finalDecision.kind === "retry" ? "retry_configuration_invalid" : finalDecision.code,
    }));
    return;
  }
  await requireLease(options.repository.reschedule({ ...claim, code: `${job.channel}_delivery_retry`, nextAttemptAt }));
}

async function requireLease(operation: Promise<boolean>): Promise<void> {
  if (!await operation) throw new Error("lead_lease_lost");
}

function startLeaseHeartbeat(job: ClaimedJob, options: WorkerOptions): { stop(): Promise<void> } {
  const controller = new AbortController();
  let failure: Error | undefined, stopped: Promise<void> | undefined;
  const interval = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const loop = (async () => {
    while (!controller.signal.aborted) {
      await (options.heartbeatSleep ?? wait)(interval, controller.signal);
      if (controller.signal.aborted) break;
      try {
        if (!await options.repository.renewLease(fence(job, options.ownerId), LEASE_MS)) {
          failure = new Error("lead_lease_lost");
          break;
        }
      } catch {
        failure = new Error("lead_worker_heartbeat_failed");
        break;
      }
    }
  })();
  return {
    stop() {
      return stopped ??= (async () => {
        controller.abort();
        await loop;
        if (failure) throw failure;
      })();
    },
  };
}

async function scheduleInfrastructureFailure(job: ClaimedJob, options: WorkerOptions): Promise<void> {
  const claim = fence(job, options.ownerId), nextAttemptAt = new Date(+options.clock.now() + 1_000);
  if (job.channel === "crm" && +nextAttemptAt >= +job.acceptedAt + CRM_CUTOFF_MS) {
    await requireLease(options.repository.markManualAction({ ...claim, code: "crm_idempotency_window_expired" }));
  } else {
    await requireLease(options.repository.reschedule({ ...claim, code: `${job.channel}_storage_retry`, nextAttemptAt }));
  }
}

async function processClaimedJob(job: ClaimedJob, options: WorkerOptions): Promise<void> {
  const claim = fence(job, options.ownerId);
  const heartbeat = startLeaseHeartbeat(job, options);
  let heartbeatStopped = false;
  const stopHeartbeat = async () => {
    if (!heartbeatStopped) {
      await heartbeat.stop();
      heartbeatStopped = true;
    }
  };
  const currentTime = options.clock.now();
  let materialized: Awaited<ReturnType<PrivateAttachmentStore["materialize"]>> | undefined;
  try {
    if (job.channel === "crm" && +currentTime >= +job.acceptedAt + CRM_CUTOFF_MS) {
      await stopHeartbeat();
      await requireLease(options.repository.markManualAction({ ...claim, code: "crm_idempotency_window_expired" }));
      return;
    }
    if (job.channel === "email" && job.providerAttemptCount >= 12) {
      await stopHeartbeat();
      await requireLease(options.repository.markManualAction({ ...claim, code: "email_attempts_exhausted" }));
      return;
    }

    if (job.channel === "crm") {
      const token = await options.repository.reserveCrmTokenAttempt(options.crmTokenHash);
      if (token.kind === "rate_limited") {
        await stopHeartbeat();
        const nextAttemptAt = new Date(+options.clock.now() + token.retryAfterSeconds * 1000);
        if (+nextAttemptAt >= +job.acceptedAt + CRM_CUTOFF_MS) {
          await requireLease(options.repository.markManualAction({ ...claim, code: "crm_idempotency_window_expired" }));
        } else {
          await requireLease(options.repository.reschedule({ ...claim, code: "crm_rate_limited", nextAttemptAt }));
        }
        return;
      }
    }

    if (job.attachment) {
      try {
        materialized = await options.store.materialize({ objectKey: job.attachment.objectKey, tempRoot: options.tempRoot });
      } catch (error) {
        await stopHeartbeat();
        if (error instanceof MissingPrivateObjectError) {
          await recordDecision(job, options, { kind: "manual_action", code: "attachment_missing" }, job.providerAttemptCount);
        } else {
          await scheduleInfrastructureFailure(job, options);
        }
        return;
      }
    }
    const deliveryEnvelope = envelope(job, materialized?.path ?? null);
    const providerAttemptCount = await options.repository.beginProviderAttempt(claim);
    if (providerAttemptCount === null) throw new Error("lead_lease_lost");
    if (job.channel === "crm") {
      let receipt: CrmReceipt;
      try { receipt = await options.crm(deliveryEnvelope); }
      catch (error) {
        await stopHeartbeat();
        await recordDecision(job, options, classifyDeliveryFailure(job.channel, error), providerAttemptCount);
        return;
      }
      if (receipt.rateLimit !== null && receipt.rateRemaining !== null) {
        if (receipt.rateLimit < 1 || receipt.rateRemaining > receipt.rateLimit) {
          await stopHeartbeat();
          await recordDecision(job, options, { kind: "manual_action", code: "crm_invalid_response" }, providerAttemptCount);
          return;
        }
        await options.repository.syncCrmTokenBudget(options.crmTokenHash, receipt.rateLimit, receipt.rateRemaining);
      }
      await stopHeartbeat();
      await requireLease(options.repository.markDelivered({
        ...claim,
        ...(receipt.requestId ? { vendorRequestId: receipt.requestId } : {}),
        responseMetadata: receiptMetadata(receipt, ["requestId", "taskId", "taskCode", "taskStatus", "dueDate", "replayed", "rateLimit", "rateRemaining"]),
      }));
    } else {
      let receipt: EmailReceipt;
      try { receipt = await options.email(deliveryEnvelope); }
      catch (error) {
        await stopHeartbeat();
        await recordDecision(job, options, classifyDeliveryFailure(job.channel, error), providerAttemptCount);
        return;
      }
      await stopHeartbeat();
      await requireLease(options.repository.markDelivered({ ...claim, responseMetadata: receiptMetadata(receipt, ["messageId"]) }));
    }
  } finally {
    let heartbeatFailure: "lead_lease_lost" | "lead_worker_heartbeat_failed" | undefined;
    try { await stopHeartbeat(); }
    catch (error) { heartbeatFailure = error instanceof Error && error.message === "lead_lease_lost" ? "lead_lease_lost" : "lead_worker_heartbeat_failed"; }
    if (materialized) {
      try { await materialized.dispose(); }
      catch { throw new Error("lead_temp_cleanup_failed"); }
    }
    if (heartbeatFailure) throw new Error(heartbeatFailure);
  }
}

function assertWorkerOptions(options: WorkerOptions): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.ownerId)) {
    throw new Error("lead_worker_owner_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(options.crmTokenHash)) throw new Error("lead_worker_token_hash_invalid");
  const batchSize = options.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("lead_worker_batch_invalid");
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 60_000) throw new Error("lead_worker_poll_invalid");
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1 || heartbeatIntervalMs >= LEASE_MS) throw new Error("lead_worker_heartbeat_invalid");
}

export async function runWorkerBatch(options: WorkerOptions): Promise<number> {
  assertWorkerOptions(options);
  if (options.signal?.aborted) return 0;
  const jobs = await options.repository.claimDueJobs(options.ownerId, options.batchSize ?? 10, LEASE_MS);
  const results = await Promise.allSettled(jobs.map(job => processClaimedJob(job, options)));
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) {
    const codes = failures.map(result => result.reason instanceof Error ? result.reason.message : "");
    if (codes.includes("lead_lease_lost")) throw new Error("lead_lease_lost");
    if (codes.includes("lead_temp_cleanup_failed")) throw new Error("lead_temp_cleanup_failed");
    throw new Error("lead_worker_batch_failed");
  }
  return jobs.length;
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function runLeadWorker(options: WorkerOptions): Promise<void> {
  assertWorkerOptions(options);
  while (!options.signal?.aborted) {
    const processed = await runWorkerBatch(options);
    if (options.signal?.aborted) break;
    if (processed === 0) await (options.sleep ?? wait)(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, options.signal);
  }
}

export async function checkLeadWorkerReady(options: ReadinessOptions = {}): Promise<void> {
  const environment = options.environment ?? process.env;
  (options.validateConfig ?? readLeadWorkerConfig)(environment);
  await (options.checkDatabase ?? checkDatabaseReady)();
}

export function createLeadWorker(input: {
  ownerId: string;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
}): () => Promise<void> {
  const environment = input.environment ?? process.env;
  const config: LeadWorkerConfig = readLeadWorkerConfig(environment);
  const repository = createLeadRepository(getDb(), { now: () => new Date() });
  const store = createPrivateAttachmentStore(config.s3);
  const transport = createLeadEmailTransport(config.smtp);
  const options: WorkerOptions = {
    repository,
    crm: deliveryEnvelope => sendToCrm(deliveryEnvelope, config.crm),
    email: deliveryEnvelope => sendLeadEmail(deliveryEnvelope, config.smtp, transport),
    store,
    tempRoot: config.tempRoot,
    ownerId: input.ownerId,
    crmTokenHash: subjectHash(config.hashKey, "crm_token", config.crm.token),
    clock: { now: () => new Date() },
    signal: input.signal,
  };
  return async () => {
    await sweepMaterializedAttachments(config.tempRoot, new Date(+options.clock.now() - STARTUP_SWEEP_AGE_MS));
    await runLeadWorker(options);
  };
}
