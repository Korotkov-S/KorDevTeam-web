import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import { leadAttachments, leadDeliveryJobs, leadRateLimits, leads } from "../db/schema";
import type { AcceptedResponse, AllowedMediaType, ClaimedJob, LeadContext, NormalizedLeadFields, StoredLead } from "./contracts";
import { fingerprintsEqual } from "./validation";

type Database = ReturnType<typeof createDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type LeadClock = { now(): Date };
export type RateDecision = { kind: "allowed" } | { kind: "rate_limited"; retryAfterSeconds: number };
export type AcceptDecision =
  | { kind: "accepted"; response: AcceptedResponse }
  | { kind: "replayed"; response: AcceptedResponse }
  | { kind: "conflict" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

export type AcceptCommand = {
  submissionKey: string;
  requestFingerprint: string;
  fields: NormalizedLeadFields;
  context: LeadContext;
  phoneHash: string;
  ipHash: string;
  consentVersion: string;
  attachment: null | {
    objectKey: string;
    originalName: string;
    mediaType: AllowedMediaType;
    byteSize: number;
    sha256: string;
    scanMetadata: Record<string, string>;
    scannedAt: Date;
  };
};

// attemptCount fences a previous claim even when a process reuses its owner ID.
export type LeaseFence = { jobId: string; ownerId: string; attemptCount: number };
export type DeliveredCommand = LeaseFence & { vendorRequestId?: string; responseMetadata?: Record<string, string> };
export type FailedCommand = LeaseFence & { code: string };
export type RescheduleCommand = FailedCommand & { nextAttemptAt: Date };
export type ExpiredLead = { id: string; objectKey: string | null };

export interface LeadRepository {
  findBySubmissionKey(submissionKey: string): Promise<StoredLead | null>;
  consumeIpAttempt(ipHash: string, globalHash: string): Promise<RateDecision>;
  accept(command: AcceptCommand): Promise<AcceptDecision>;
  claimDueJobs(ownerId: string, limit: number, leaseMs: number): Promise<ClaimedJob[]>;
  markDelivered(command: DeliveredCommand): Promise<boolean>;
  reschedule(command: RescheduleCommand): Promise<boolean>;
  markTerminal(command: FailedCommand): Promise<boolean>;
  markManualAction(command: FailedCommand): Promise<boolean>;
  renewLease(command: LeaseFence, leaseMs: number): Promise<boolean>;
  beginProviderAttempt(command: LeaseFence): Promise<number | null>;
  reserveCrmTokenAttempt(tokenHash: string): Promise<RateDecision>;
  syncCrmTokenBudget(tokenHash: string, rateLimit: number, rateRemaining: number): Promise<void>;
  findExpiredLeads(limit: number): Promise<ExpiredLead[]>;
  deleteExpiredRateLimits(limit: number): Promise<number>;
  attachmentKeyExists(key: string): Promise<boolean>;
  /** Caller must successfully delete the private object before deleting its row. */
  deleteLeadAfterObject(id: string): Promise<boolean>;
}

const storedLeadColumns = {
  id: leads.id, submissionKey: leads.submissionKey, requestFingerprint: leads.requestFingerprint,
  consentVersion: leads.consentVersion, successResponse: leads.successResponse,
};
const ratePolicies = {
  ip: { limit: 5, windowMs: 30 * 60_000 },
  phone: { limit: 3, windowMs: 60 * 60_000 },
  crm_token: { limit: 20, windowMs: 60_000 },
} as const;
const globalIntakePolicy = { limit: 1_000, windowMs: 60 * 60_000 } as const;

async function consumeBucket(
  db: Database | Transaction,
  kind: keyof typeof ratePolicies,
  subjectHash: string,
  now: Date,
  policy: { limit: number; windowMs: number } = ratePolicies[kind],
): Promise<RateDecision> {
  const { limit, windowMs } = policy;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const windowEnd = new Date(windowStart.getTime() + windowMs);
  const result = await db.execute(sql`
    insert into lead_rate_limits (kind, subject_hash, window_started_at, count, expires_at)
    values (${kind}, ${subjectHash}, ${windowStart.toISOString()}, 1, ${windowEnd.toISOString()})
    on conflict (kind, subject_hash, window_started_at)
    do update set count = lead_rate_limits.count + 1
    where lead_rate_limits.count < ${limit}
    returning count
  `);
  if (result.rows.length) return { kind: "allowed" };
  const [bucket] = await db.select({ expiresAt: leadRateLimits.expiresAt }).from(leadRateLimits).where(and(
    eq(leadRateLimits.kind, kind), eq(leadRateLimits.subjectHash, subjectHash), eq(leadRateLimits.windowStartedAt, windowStart),
  ));
  return { kind: "rate_limited", retryAfterSeconds: Math.max(1, Math.min(windowMs / 1000, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000))) };
}

function assertBatchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("lead_batch_limit_invalid");
}

function assertLeaseDuration(leaseMs: number): void {
  if (!Number.isInteger(leaseMs) || leaseMs < 1 || leaseMs > 120_000) throw new Error("lead_lease_duration_invalid");
}

function assertCrmRateLimit(tokenHash: string, rateLimit: number, rateRemaining: number): void {
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || !Number.isSafeInteger(rateLimit) || rateLimit < 1 ||
      !Number.isSafeInteger(rateRemaining) || rateRemaining < 0 || rateRemaining > rateLimit) {
    throw new Error("lead_crm_rate_limit_invalid");
  }
}

const receiptKeys = ["requestId", "taskId", "taskCode", "taskStatus", "dueDate", "replayed", "rateLimit", "rateRemaining", "messageId"];

// Adapters provide validated scalar receipts, never vendor bodies or headers.
function metadataFields(input: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && Buffer.byteLength(value) <= 255 && !/[\u0000-\u001f\u007f]/.test(value) && !/\bBearer\s/i.test(value)) {
      result[key] = value;
      // JSON escaping counts toward the cap. PostgreSQL also inserts spaces
      // after colons/commas; two extra bytes per field conservatively cover them.
      const serializedBytes = Buffer.byteLength(JSON.stringify(result)) + 2 * Object.keys(result).length;
      if (serializedBytes > 4096) delete result[key];
    }
  }
  return result;
}

function errorCode(code: string): string {
  return /^[a-z][a-z0-9_]{0,119}$/.test(code) ? code : "delivery_error";
}

export function createLeadRepository(db: Database, clock: LeadClock): LeadRepository {
  async function updateClaim(command: LeaseFence, values: Partial<typeof leadDeliveryJobs.$inferInsert>): Promise<boolean> {
    const now = clock.now();
    const rows = await db.update(leadDeliveryJobs).set({
      ...values, leaseOwner: null, leaseExpiresAt: null, updatedAt: now,
    }).where(and(
      eq(leadDeliveryJobs.id, command.jobId), eq(leadDeliveryJobs.leaseOwner, command.ownerId),
      eq(leadDeliveryJobs.attemptCount, command.attemptCount), eq(leadDeliveryJobs.status, "processing"),
      gt(leadDeliveryJobs.leaseExpiresAt, now),
    )).returning({ id: leadDeliveryJobs.id });
    return rows.length === 1;
  }

  return {
    async findBySubmissionKey(submissionKey) {
      const [lead] = await db.select(storedLeadColumns).from(leads).where(eq(leads.submissionKey, submissionKey)).limit(1);
      return lead ?? null;
    },
    consumeIpAttempt(ipHash, globalHash) {
      return db.transaction(async tx => {
        const now = clock.now();
        const global = await consumeBucket(tx, "ip", globalHash, now, globalIntakePolicy);
        return global.kind === "rate_limited" ? global : consumeBucket(tx, "ip", ipHash, now);
      });
    },
    reserveCrmTokenAttempt(tokenHash) { return consumeBucket(db, "crm_token", tokenHash, clock.now()); },
    async syncCrmTokenBudget(tokenHash, rateLimit, rateRemaining) {
      assertCrmRateLimit(tokenHash, rateLimit, rateRemaining);
      const now = clock.now(), windowMs = ratePolicies.crm_token.windowMs;
      const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
      const windowEnd = new Date(windowStart.getTime() + windowMs);
      const consumedFloor = ratePolicies.crm_token.limit - Math.min(ratePolicies.crm_token.limit, rateRemaining);
      await db.execute(sql`
        insert into lead_rate_limits (kind, subject_hash, window_started_at, count, expires_at)
        values ('crm_token', ${tokenHash}, ${windowStart.toISOString()}, ${consumedFloor}, ${windowEnd.toISOString()})
        on conflict (kind, subject_hash, window_started_at)
        do update set count = greatest(lead_rate_limits.count, excluded.count), expires_at = excluded.expires_at
      `);
    },

    async accept(command) {
      return db.transaction(async (tx): Promise<AcceptDecision> => {
        // Normalize UUID case for the advisory lock just as PostgreSQL's uuid column does.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${command.submissionKey.toLowerCase()}, 0))`);
        const [existing] = await tx.select(storedLeadColumns).from(leads).where(eq(leads.submissionKey, command.submissionKey));
        if (existing) {
          return fingerprintsEqual(existing.requestFingerprint, command.requestFingerprint)
            ? { kind: "replayed", response: existing.successResponse }
            : { kind: "conflict" };
        }
        const acceptedAt = clock.now();
        const rate = await consumeBucket(tx, "phone", command.phoneHash, acceptedAt);
        if (rate.kind === "rate_limited") return rate;
        const id = randomUUID();
        const response: AcceptedResponse = { leadId: id, status: "accepted" };
        const expiresAt = new Date(acceptedAt.getTime() + 30 * 86_400_000);
        await tx.insert(leads).values({
          id, submissionKey: command.submissionKey, requestFingerprint: command.requestFingerprint,
          name: command.fields.name, phone: command.fields.phone, description: command.fields.description,
          pagePath: command.context.pagePath, referrer: command.context.referrer, utm: command.context.utm,
          phoneHash: command.phoneHash, ipHash: command.ipHash, consentVersion: command.consentVersion,
          consentAt: acceptedAt, acceptedAt, expiresAt, successResponse: response,
        });
        if (command.attachment) {
          const attachment = command.attachment;
          await tx.insert(leadAttachments).values({
            leadId: id, objectKey: attachment.objectKey, originalName: attachment.originalName,
            mediaType: attachment.mediaType, byteSize: attachment.byteSize, checksum: attachment.sha256,
            scanMetadata: metadataFields(attachment.scanMetadata, ["engine", "result"]), scannedAt: attachment.scannedAt, createdAt: acceptedAt, expiresAt,
          });
        }
        await tx.insert(leadDeliveryJobs).values(["crm", "email"].map((channel) => ({
          leadId: id, channel: channel as "crm" | "email", nextAttemptAt: acceptedAt, createdAt: acceptedAt, updatedAt: acceptedAt,
        })));
        return { kind: "accepted", response };
      });
    },

    async claimDueJobs(ownerId, limit, leaseMs) {
      assertBatchLimit(limit);
      if (!ownerId || ownerId.length > 255) throw new Error("lead_lease_owner_invalid");
      assertLeaseDuration(leaseMs);
      return db.transaction(async (tx) => {
        const now = clock.now();
        const due = await tx.select({ id: leadDeliveryJobs.id }).from(leadDeliveryJobs).where(or(
          and(inArray(leadDeliveryJobs.status, ["pending", "retry"]), lte(leadDeliveryJobs.nextAttemptAt, now)),
          and(eq(leadDeliveryJobs.status, "processing"), lte(leadDeliveryJobs.leaseExpiresAt, now)),
        )).orderBy(asc(leadDeliveryJobs.nextAttemptAt), asc(leadDeliveryJobs.id)).limit(limit).for("update", { skipLocked: true });
        if (!due.length) return [];
        const leaseExpiresAt = new Date(now.getTime() + leaseMs);
        const jobs = await tx.update(leadDeliveryJobs).set({
          status: "processing", leaseOwner: ownerId, leaseExpiresAt,
          attemptCount: sql`${leadDeliveryJobs.attemptCount} + 1`, updatedAt: now,
        }).where(inArray(leadDeliveryJobs.id, due.map((job) => job.id))).returning();
        const records = await tx.select({ lead: leads, attachment: leadAttachments }).from(leads)
          .leftJoin(leadAttachments, eq(leadAttachments.leadId, leads.id))
          .where(inArray(leads.id, jobs.map((job) => job.leadId)));
        const byLead = new Map(records.map((record) => [record.lead.id, record]));
        return jobs.map((job): ClaimedJob => {
          const { lead, attachment } = byLead.get(job.leadId)!;
          return {
            id: job.id, leadId: job.leadId, channel: job.channel, attemptCount: job.attemptCount,
            providerAttemptCount: job.providerAttemptCount,
            acceptedAt: lead.acceptedAt, leaseExpiresAt,
            lead: {
              name: lead.name, phone: lead.phone, phoneDigits: lead.phone.replace(/[^0-9]/g, ""),
              description: lead.description, consent: true, honeypot: "", pagePath: lead.pagePath, referrer: lead.referrer,
            },
            attachment: attachment ? {
              objectKey: attachment.objectKey, originalName: attachment.originalName,
              mediaType: attachment.mediaType as AllowedMediaType, sha256: attachment.checksum,
            } : null,
          };
        });
      });
    },

    async renewLease(command, leaseMs) {
      assertLeaseDuration(leaseMs);
      const now = clock.now();
      const rows = await db.update(leadDeliveryJobs).set({
        leaseExpiresAt: new Date(+now + leaseMs), updatedAt: now,
      }).where(and(
        eq(leadDeliveryJobs.id, command.jobId), eq(leadDeliveryJobs.leaseOwner, command.ownerId),
        eq(leadDeliveryJobs.attemptCount, command.attemptCount), eq(leadDeliveryJobs.status, "processing"),
        gt(leadDeliveryJobs.leaseExpiresAt, now),
      )).returning({ id: leadDeliveryJobs.id });
      return rows.length === 1;
    },

    async beginProviderAttempt(command) {
      const now = clock.now();
      const rows = await db.update(leadDeliveryJobs).set({
        providerAttemptCount: sql`${leadDeliveryJobs.providerAttemptCount} + 1`, updatedAt: now,
      }).where(and(
        eq(leadDeliveryJobs.id, command.jobId), eq(leadDeliveryJobs.leaseOwner, command.ownerId),
        eq(leadDeliveryJobs.attemptCount, command.attemptCount), eq(leadDeliveryJobs.status, "processing"),
        gt(leadDeliveryJobs.leaseExpiresAt, now),
      )).returning({ providerAttemptCount: leadDeliveryJobs.providerAttemptCount });
      return rows[0]?.providerAttemptCount ?? null;
    },

    markDelivered(command) {
      return updateClaim(command, {
        status: "delivered", deliveredAt: clock.now(), lastErrorCode: null,
        vendorRequestId: command.vendorRequestId && /^[A-Za-z0-9<][A-Za-z0-9._:@<>+\-]{0,254}$/.test(command.vendorRequestId) ? command.vendorRequestId : null,
        responseMetadata: metadataFields(command.responseMetadata ?? {}, receiptKeys),
      });
    },
    reschedule(command) { return updateClaim(command, { status: "retry", nextAttemptAt: command.nextAttemptAt, lastErrorCode: errorCode(command.code) }); },
    markTerminal(command) { return updateClaim(command, { status: "terminal", lastErrorCode: errorCode(command.code) }); },
    markManualAction(command) { return updateClaim(command, { status: "manual_action", lastErrorCode: errorCode(command.code) }); },

    async findExpiredLeads(limit) {
      assertBatchLimit(limit);
      return db.select({ id: leads.id, objectKey: leadAttachments.objectKey }).from(leads)
        .leftJoin(leadAttachments, eq(leadAttachments.leadId, leads.id)).where(lte(leads.expiresAt, clock.now()))
        .orderBy(asc(leads.expiresAt), asc(leads.id)).limit(limit);
    },
    async deleteExpiredRateLimits(limit) {
      assertBatchLimit(limit);
      const now = clock.now();
      const result = await db.execute(sql`
        with expired as (
          select ctid
          from lead_rate_limits
          where expires_at <= ${now.toISOString()}
          order by expires_at, kind, subject_hash, window_started_at
          limit ${limit}
          for update skip locked
        )
        delete from lead_rate_limits as bucket
        using expired
        where bucket.ctid = expired.ctid
        returning 1
      `);
      return result.rows.length;
    },
    async attachmentKeyExists(key) {
      return (await db.select({ id: leadAttachments.id }).from(leadAttachments).where(eq(leadAttachments.objectKey, key)).limit(1)).length > 0;
    },
    async deleteLeadAfterObject(id) {
      return (await db.delete(leads).where(and(eq(leads.id, id), lte(leads.expiresAt, clock.now()))).returning({ id: leads.id })).length === 1;
    },
  };
}
