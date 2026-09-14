import { checkDatabaseReady, getDb } from "../db/client";
import type { ClaimedJob } from "./contracts";
import { readLeadWorkerConfig, type LeadWorkerConfig } from "./config";
import { sendToCrm, type CrmReceipt, type DeliveryEnvelope } from "./crm";
import { createLeadEmailTransport, sendLeadEmail, type EmailReceipt } from "./email";
import { createPrivateAttachmentStore, MissingPrivateObjectError, type PrivateAttachmentStore } from "./objectStore";
import { createLeadRepository, type LeadRepository } from "./repository";
import {
  classifyDeliveryFailure, CRM_CUTOFF_MS, nextRetryAt, type DeliveryDecision,
} from "./retry";
import { subjectHash } from "./validation";

const LEASE_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

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
): Promise<void> {
  const claim = fence(job, options.ownerId);
  if (decision.kind === "terminal") {
    await options.repository.markTerminal({ ...claim, code: decision.code });
    return;
  }
  if (decision.kind === "manual_action") {
    await options.repository.markManualAction({ ...claim, code: decision.code });
    return;
  }
  try {
    const nextAttemptAt = nextRetryAt({
      channel: job.channel,
      attemptCount: job.attemptCount,
      acceptedAt: job.acceptedAt,
      now: options.clock.now(),
      retryAfterSeconds: decision.retryAfterSeconds,
      random: options.random,
    });
    await options.repository.reschedule({ ...claim, code: `${job.channel}_delivery_retry`, nextAttemptAt });
  } catch (error) {
    const finalDecision = classifyDeliveryFailure(job.channel, error);
    await options.repository.markManualAction({
      ...claim,
      code: finalDecision.kind === "retry" ? "retry_configuration_invalid" : finalDecision.code,
    });
  }
}

async function processClaimedJob(job: ClaimedJob, options: WorkerOptions): Promise<void> {
  const claim = fence(job, options.ownerId);
  const currentTime = options.clock.now();
  if (job.channel === "crm" && +currentTime >= +job.acceptedAt + CRM_CUTOFF_MS) {
    await options.repository.markManualAction({ ...claim, code: "crm_idempotency_window_expired" });
    return;
  }

  if (job.channel === "crm") {
    const token = await options.repository.reserveCrmTokenAttempt(options.crmTokenHash);
    if (token.kind === "rate_limited") {
      try {
        const nextAttemptAt = nextRetryAt({
          channel: "crm", attemptCount: job.attemptCount, acceptedAt: job.acceptedAt,
          now: options.clock.now(), retryAfterSeconds: token.retryAfterSeconds, random: options.random,
        });
        await options.repository.reschedule({ ...claim, code: "crm_rate_limited", nextAttemptAt });
      } catch (error) {
        const decision = classifyDeliveryFailure("crm", error);
        await options.repository.markManualAction({
          ...claim, code: decision.kind === "retry" ? "retry_configuration_invalid" : decision.code,
        });
      }
      return;
    }
  }

  let materialized: Awaited<ReturnType<PrivateAttachmentStore["materialize"]>> | undefined;
  try {
    if (job.attachment) {
      try {
        materialized = await options.store.materialize({ objectKey: job.attachment.objectKey, tempRoot: options.tempRoot });
      } catch (error) {
        await recordDecision(job, options, error instanceof MissingPrivateObjectError
          ? { kind: "manual_action", code: "attachment_missing" }
          : { kind: "retry" });
        return;
      }
    }
    const deliveryEnvelope = envelope(job, materialized?.path ?? null);
    if (job.channel === "crm") {
      let receipt: CrmReceipt;
      try { receipt = await options.crm(deliveryEnvelope); }
      catch (error) { await recordDecision(job, options, classifyDeliveryFailure(job.channel, error)); return; }
      await options.repository.markDelivered({
        ...claim,
        ...(receipt.requestId ? { vendorRequestId: receipt.requestId } : {}),
        responseMetadata: receiptMetadata(receipt, ["requestId", "taskId", "taskCode", "taskStatus", "dueDate", "replayed", "rateLimit", "rateRemaining"]),
      });
    } else {
      let receipt: EmailReceipt;
      try { receipt = await options.email(deliveryEnvelope); }
      catch (error) { await recordDecision(job, options, classifyDeliveryFailure(job.channel, error)); return; }
      await options.repository.markDelivered({ ...claim, responseMetadata: receiptMetadata(receipt, ["messageId"]) });
    }
  } finally {
    if (materialized) {
      try { await materialized.dispose(); }
      catch { /* A private temporary-file cleanup failure must not duplicate a completed vendor delivery. */ }
    }
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
}

export async function runWorkerBatch(options: WorkerOptions): Promise<number> {
  assertWorkerOptions(options);
  const jobs = await options.repository.claimDueJobs(options.ownerId, options.batchSize ?? 10, LEASE_MS);
  for (const job of jobs) await processClaimedJob(job, options);
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
  return () => runLeadWorker(options);
}
