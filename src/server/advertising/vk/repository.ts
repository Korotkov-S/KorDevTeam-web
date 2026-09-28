import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as databaseSchema from "../../db/schema";
import {
  adExperiments,
  adExperimentVariants,
  adVkAccounts,
  adVkAdGroups,
  adVkAds,
  adVkCampaigns,
  adVkCreativeVersions,
  adVkDailyMetrics,
  adVkExperimentLinks,
  adVkSyncRuns,
} from "../../db/schema";
import type {
  VkAdsAccountRecord,
  VkAdsAdGroupRecord,
  VkAdsAdRecord,
  VkAdsCampaignRecord,
  VkAdsCheckpoint,
  VkAdsCreativeVersionRecord,
  VkAdsDailyMetricRecord,
  VkAdsObjectKind,
  VkAdsSyncMode,
  VkAdsSyncStatus,
} from "./contracts";
import { redactVkAdsLogRecord, VkAdsError } from "./errors";

type Db = NodePgDatabase<typeof databaseSchema>;
type Counters = Record<string, number>;
type PageWrite<T> = { runId: string; items: T[]; checkpoint: VkAdsCheckpoint | null; counters: Counters };
type CursorKey = { lastSeenAt: Date; id: string };

function unavailable(): never {
  throw new VkAdsError("ads_vk_unavailable");
}

function safeText(value: string): string {
  const redacted = redactVkAdsLogRecord(value);
  return typeof redacted === "string" ? redacted : "[redacted]";
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

export function vkAdsFingerprint(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

function date(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return unavailable();
  return parsed;
}

function inactive(status: string, explicit: string | null, lastSeenAt: string): Date | null {
  if (["blocked", "deleted"].includes(status.toLowerCase())) return date(explicit ?? lastSeenAt);
  return date(explicit);
}

function counterDelta(value: Counters): Counters {
  const safe: Counters = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!/^[a-z][A-Za-z0-9]{0,79}$/u.test(key) || !Number.isSafeInteger(amount) || amount < 0) return unavailable();
    safe[key] = amount;
  }
  return safe;
}

async function advanceRun(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  runId: string,
  input: { stage?: string; checkpoint: VkAdsCheckpoint | null; counters: Counters },
): Promise<void> {
  const [run] = await tx.select().from(adVkSyncRuns).where(eq(adVkSyncRuns.id, runId)).for("update");
  if (!run || run.status !== "running") return unavailable();
  const delta = counterDelta(input.counters);
  const counters = { ...run.counters };
  for (const [key, amount] of Object.entries(delta)) counters[key] = (counters[key] ?? 0) + amount;
  await tx.update(adVkSyncRuns).set({
    stage: input.stage ?? run.stage,
    checkpoint: input.checkpoint,
    counters,
  }).where(eq(adVkSyncRuns.id, runId));
}

async function accountId(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], externalId: string): Promise<string> {
  const [row] = await tx.select({ id: adVkAccounts.id }).from(adVkAccounts).where(eq(adVkAccounts.externalId, externalId));
  if (!row) return unavailable();
  return row.id;
}

async function campaignId(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], account: string, externalId: string): Promise<string> {
  const [row] = await tx.select({ id: adVkCampaigns.id }).from(adVkCampaigns)
    .where(and(eq(adVkCampaigns.accountId, account), eq(adVkCampaigns.externalId, externalId)));
  if (!row) return unavailable();
  return row.id;
}

async function groupId(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  account: string,
  campaign: string,
  externalId: string,
): Promise<string> {
  const [row] = await tx.select({ id: adVkAdGroups.id }).from(adVkAdGroups)
    .where(and(
      eq(adVkAdGroups.accountId, account),
      eq(adVkAdGroups.campaignId, campaign),
      eq(adVkAdGroups.externalId, externalId),
    ));
  if (!row) return unavailable();
  return row.id;
}

function providerCount(value: string): bigint {
  if (!/^\d{1,20}$/u.test(value)) return unavailable();
  return BigInt(value);
}

function conversions(value: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(value);
  if (entries.length > 100) return unavailable();
  const normalized: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (!key || key.length > 160 || !["string", "number", "boolean"].includes(typeof entry) && entry !== null) return unavailable();
    normalized[key] = String(entry);
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 16_384) return unavailable();
  return normalized;
}

export function createVkAdsRepository(db: Db) {
  return {
    async startRun(input: { mode: VkAdsSyncMode; stage: string; checkpoint: VkAdsCheckpoint | null }) {
      const [run] = await db.insert(adVkSyncRuns).values({
        mode: input.mode,
        stage: input.stage,
        checkpoint: input.checkpoint,
        counters: {},
      }).returning();
      return { id: run.id, correlationId: run.correlationId, startedAt: run.startedAt.toISOString() };
    },

    async findResumableBackfill() {
      const [run] = await db.select().from(adVkSyncRuns).where(and(
        eq(adVkSyncRuns.mode, "backfill"),
        inArray(adVkSyncRuns.status, ["running", "partial"]),
      )).orderBy(desc(adVkSyncRuns.startedAt), desc(adVkSyncRuns.id)).limit(1);
      return run ? {
        id: run.id,
        status: run.status,
        stage: run.stage,
        checkpoint: run.checkpoint,
        counters: run.counters,
        correlationId: run.correlationId,
      } : null;
    },

    async storeAccount(record: VkAdsAccountRecord): Promise<void> {
      const displayName = record.displayName ? safeText(record.displayName) : null;
      const recordFingerprint = vkAdsFingerprint({
        externalId: record.externalId,
        accountType: record.accountType,
        displayName,
        currency: record.currency,
        timezone: record.timezone,
        sourceUpdatedAt: record.sourceUpdatedAt,
      });
      await db.insert(adVkAccounts).values({
        externalId: record.externalId,
        accountType: record.accountType,
        displayName,
        currency: record.currency,
        timezone: record.timezone,
        sourceUpdatedAt: date(record.sourceUpdatedAt),
        firstSeenAt: date(record.firstSeenAt)!,
        lastSeenAt: date(record.lastSeenAt)!,
        inactiveAt: date(record.inactiveAt),
        fingerprint: recordFingerprint,
      }).onConflictDoUpdate({ target: adVkAccounts.externalId, set: {
        accountType: record.accountType,
        displayName,
        currency: record.currency,
        timezone: record.timezone,
        sourceUpdatedAt: date(record.sourceUpdatedAt),
        lastSeenAt: date(record.lastSeenAt)!,
        inactiveAt: date(record.inactiveAt),
        fingerprint: recordFingerprint,
      } });
    },

    async storeCampaignPage(input: PageWrite<VkAdsCampaignRecord>): Promise<void> {
      await db.transaction(async (tx) => {
        for (const record of input.items) {
          const parentId = await accountId(tx, record.accountExternalId);
          const name = safeText(record.name);
          const values = {
            accountId: parentId,
            externalId: record.externalId,
            name,
            status: record.status,
            objective: record.objective,
            campaignType: record.campaignType,
            budget: record.budget,
            schedule: record.schedule,
            sourceCreatedAt: date(record.sourceCreatedAt),
            sourceUpdatedAt: date(record.sourceUpdatedAt),
            firstSeenAt: date(record.firstSeenAt)!,
            lastSeenAt: date(record.lastSeenAt)!,
            inactiveAt: inactive(record.status, record.inactiveAt, record.lastSeenAt),
            fingerprint: vkAdsFingerprint({
              externalId: record.externalId,
              accountExternalId: record.accountExternalId,
              name,
              status: record.status,
              objective: record.objective,
              campaignType: record.campaignType,
              budget: record.budget,
              schedule: record.schedule,
              sourceCreatedAt: record.sourceCreatedAt,
              sourceUpdatedAt: record.sourceUpdatedAt,
            }),
          };
          await tx.insert(adVkCampaigns).values(values).onConflictDoUpdate({
            target: [adVkCampaigns.accountId, adVkCampaigns.externalId],
            set: { ...values, firstSeenAt: sql`${adVkCampaigns.firstSeenAt}` },
          });
        }
        await advanceRun(tx, input.runId, input);
      });
    },

    async storeAdGroupPage(input: PageWrite<VkAdsAdGroupRecord>): Promise<void> {
      await db.transaction(async (tx) => {
        for (const record of input.items) {
          const parentAccountId = await accountId(tx, record.accountExternalId);
          const parentCampaignId = await campaignId(tx, parentAccountId, record.campaignExternalId);
          const name = safeText(record.name);
          const targetingLabels = record.targetingLabels.map(safeText);
          const values = {
            accountId: parentAccountId,
            campaignId: parentCampaignId,
            externalId: record.externalId,
            name,
            status: record.status,
            packageSummary: record.packageSummary,
            optimizationSummary: record.optimizationSummary,
            bidStrategySummary: record.bidStrategySummary,
            targetingLabels,
            sourceCreatedAt: date(record.sourceCreatedAt),
            sourceUpdatedAt: date(record.sourceUpdatedAt),
            firstSeenAt: date(record.firstSeenAt)!,
            lastSeenAt: date(record.lastSeenAt)!,
            inactiveAt: inactive(record.status, record.inactiveAt, record.lastSeenAt),
            fingerprint: vkAdsFingerprint({
              externalId: record.externalId,
              accountExternalId: record.accountExternalId,
              campaignExternalId: record.campaignExternalId,
              name,
              status: record.status,
              packageSummary: record.packageSummary,
              optimizationSummary: record.optimizationSummary,
              bidStrategySummary: record.bidStrategySummary,
              targetingLabels,
              sourceCreatedAt: record.sourceCreatedAt,
              sourceUpdatedAt: record.sourceUpdatedAt,
            }),
          };
          await tx.insert(adVkAdGroups).values(values).onConflictDoUpdate({
            target: [adVkAdGroups.accountId, adVkAdGroups.externalId],
            set: { ...values, firstSeenAt: sql`${adVkAdGroups.firstSeenAt}` },
          });
        }
        await advanceRun(tx, input.runId, input);
      });
    },

    async storeAdPage(input: PageWrite<VkAdsAdRecord>): Promise<void> {
      await db.transaction(async (tx) => {
        for (const record of input.items) {
          const parentAccountId = await accountId(tx, record.accountExternalId);
          const parentCampaignId = await campaignId(tx, parentAccountId, record.campaignExternalId);
          const parentGroupId = await groupId(tx, parentAccountId, parentCampaignId, record.adGroupExternalId);
          const name = safeText(record.name);
          const values = {
            accountId: parentAccountId,
            campaignId: parentCampaignId,
            adGroupId: parentGroupId,
            externalId: record.externalId,
            name,
            status: record.status,
            moderationStatus: record.moderationStatus,
            moderationReasonCode: record.moderationReasonCode,
            landingOrigin: record.landingOrigin,
            landingPath: record.landingPath,
            sourceCreatedAt: date(record.sourceCreatedAt),
            sourceUpdatedAt: date(record.sourceUpdatedAt),
            firstSeenAt: date(record.firstSeenAt)!,
            lastSeenAt: date(record.lastSeenAt)!,
            inactiveAt: inactive(record.status, record.inactiveAt, record.lastSeenAt),
            fingerprint: vkAdsFingerprint({
              externalId: record.externalId,
              accountExternalId: record.accountExternalId,
              campaignExternalId: record.campaignExternalId,
              adGroupExternalId: record.adGroupExternalId,
              name,
              status: record.status,
              moderationStatus: record.moderationStatus,
              moderationReasonCode: record.moderationReasonCode,
              landingOrigin: record.landingOrigin,
              landingPath: record.landingPath,
              sourceCreatedAt: record.sourceCreatedAt,
              sourceUpdatedAt: record.sourceUpdatedAt,
            }),
          };
          await tx.insert(adVkAds).values(values).onConflictDoUpdate({
            target: [adVkAds.accountId, adVkAds.externalId],
            set: { ...values, firstSeenAt: sql`${adVkAds.firstSeenAt}` },
          });
        }
        await advanceRun(tx, input.runId, input);
      });
    },

    async findStoredImageBySha256(sha256: string): Promise<string | null> {
      const [row] = await db.select({ key: adVkCreativeVersions.imageObjectKey }).from(adVkCreativeVersions)
        .where(eq(adVkCreativeVersions.imageSha256, sha256)).orderBy(adVkCreativeVersions.createdAt).limit(1);
      return row?.key ?? null;
    },

    async storeCreativeVersion(record: VkAdsCreativeVersionRecord): Promise<"created" | "unchanged"> {
      return db.transaction(async (tx) => {
        const ads = await tx.select({ id: adVkAds.id }).from(adVkAds).where(eq(adVkAds.externalId, record.adExternalId)).limit(2);
        if (ads.length !== 1) return unavailable();
        const textBlocks = record.textBlocks.map(safeText);
        const cta = record.cta ? safeText(record.cta) : null;
        const recordFingerprint = vkAdsFingerprint({
          adExternalId: record.adExternalId,
          mediaKind: record.mediaKind,
          format: record.format,
          textBlocks,
          cta,
          width: record.width,
          height: record.height,
          durationSeconds: record.durationSeconds,
          contentIds: record.contentIds,
          imageSha256: record.imageSha256,
          videoSourceUrl: record.videoSourceUrl,
        });
        const [existing] = await tx.select().from(adVkCreativeVersions).where(and(
          eq(adVkCreativeVersions.adId, ads[0].id),
          eq(adVkCreativeVersions.fingerprint, recordFingerprint),
        ));
        if (existing) return "unchanged";
        const activeFrom = date(record.activeFrom)!;
        const [current] = await tx.select({ activeFrom: adVkCreativeVersions.activeFrom }).from(adVkCreativeVersions).where(and(
          eq(adVkCreativeVersions.adId, ads[0].id),
          isNull(adVkCreativeVersions.activeTo),
        )).limit(1);
        if (current && activeFrom <= current.activeFrom) return unavailable();
        await tx.update(adVkCreativeVersions).set({ activeTo: activeFrom }).where(and(
          eq(adVkCreativeVersions.adId, ads[0].id),
          isNull(adVkCreativeVersions.activeTo),
          lt(adVkCreativeVersions.activeFrom, activeFrom),
        ));
        await tx.insert(adVkCreativeVersions).values({
          adId: ads[0].id,
          fingerprint: recordFingerprint,
          mediaKind: record.mediaKind,
          textBlocks,
          cta,
          format: record.format,
          width: record.width,
          height: record.height,
          durationSeconds: record.durationSeconds,
          contentIds: record.contentIds,
          imageSha256: record.imageSha256,
          imageObjectKey: record.imageObjectKey,
          videoSourceUrl: record.videoSourceUrl,
          activeFrom,
          activeTo: date(record.activeTo),
        });
        return "created";
      });
    },

    async storeMetricWindow(input: PageWrite<VkAdsDailyMetricRecord>): Promise<void> {
      await db.transaction(async (tx) => {
        for (const record of input.items) {
          const recordFingerprint = vkAdsFingerprint({
            objectKind: record.objectKind,
            externalId: record.externalId,
            metricDate: record.metricDate,
            timezone: record.timezone,
            spend: record.spend,
            impressions: record.impressions,
            reach: record.reach,
            clicks: record.clicks,
            conversions: record.conversions,
            sourceRevision: record.sourceRevision,
          });
          const values = {
            objectKind: record.objectKind,
            externalId: record.externalId,
            metricDate: record.metricDate,
            timezone: record.timezone,
            spend: record.spend,
            impressions: providerCount(record.impressions),
            reach: providerCount(record.reach),
            clicks: providerCount(record.clicks),
            conversions: conversions(record.conversions),
            sourceRevision: record.sourceRevision,
            fingerprint: recordFingerprint,
            collectedAt: date(record.collectedAt)!,
          };
          await tx.insert(adVkDailyMetrics).values(values).onConflictDoUpdate({
            target: [adVkDailyMetrics.objectKind, adVkDailyMetrics.externalId, adVkDailyMetrics.metricDate],
            set: values,
          });
        }
        await advanceRun(tx, input.runId, input);
      });
    },

    async updateRunCheckpoint(runId: string, input: { stage: string; checkpoint: VkAdsCheckpoint | null; counters: Counters }): Promise<void> {
      await db.transaction((tx) => advanceRun(tx, runId, input));
    },

    async finishRun(runId: string, input: {
      status: Exclude<VkAdsSyncStatus, "running">;
      errorCode: string | null;
      coveredDateFrom: string | null;
      coveredDateTo: string | null;
    }): Promise<void> {
      if ((input.status === "succeeded" && input.errorCode !== null) ||
          (input.status !== "succeeded" && input.errorCode === null)) return unavailable();
      const [updated] = await db.update(adVkSyncRuns).set({
        status: input.status,
        errorCode: input.errorCode,
        coveredDateFrom: input.coveredDateFrom,
        coveredDateTo: input.coveredDateTo,
        finishedAt: new Date(),
      }).where(and(eq(adVkSyncRuns.id, runId), eq(adVkSyncRuns.status, "running"))).returning({ id: adVkSyncRuns.id });
      if (!updated) return unavailable();
    },

    async linkExperimentObject(input: {
      experimentId: string;
      variantId: string;
      objectKind: VkAdsObjectKind;
      externalId: string;
      actorKind: "agent" | "admin" | "mcp" | "system" | "vendor";
      actorId: string;
    }): Promise<void> {
      await db.transaction(async (tx) => {
        const [experiment] = await tx.select({ id: adExperiments.id }).from(adExperiments).where(eq(adExperiments.id, input.experimentId));
        const [variant] = await tx.select({ id: adExperimentVariants.id, experimentId: adExperimentVariants.experimentId })
          .from(adExperimentVariants).where(eq(adExperimentVariants.id, input.variantId));
        const table = input.objectKind === "campaign" ? adVkCampaigns : input.objectKind === "ad_group" ? adVkAdGroups : adVkAds;
        const [object] = await tx.select({ id: table.id }).from(table).where(eq(table.externalId, input.externalId)).limit(1);
        if (!experiment || !variant || variant.experimentId !== experiment.id || !object) return unavailable();
        await tx.insert(adVkExperimentLinks).values(input).onConflictDoNothing();
      });
    },

    async getSyncStatusRow() {
      const [run] = await db.select().from(adVkSyncRuns).orderBy(desc(adVkSyncRuns.startedAt), desc(adVkSyncRuns.id)).limit(1);
      return run ? {
        id: run.id,
        mode: run.mode,
        status: run.status,
        stage: run.stage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        coveredDateFrom: run.coveredDateFrom,
        coveredDateTo: run.coveredDateTo,
        counters: run.counters,
        errorCode: run.errorCode,
        correlationId: run.correlationId,
      } : null;
    },

    async listCampaignRows(input: { limit: number; status?: string; after?: CursorKey }) {
      return db.select({
        id: adVkCampaigns.id,
        accountExternalId: adVkAccounts.externalId,
        externalId: adVkCampaigns.externalId,
        name: adVkCampaigns.name,
        status: adVkCampaigns.status,
        objective: adVkCampaigns.objective,
        campaignType: adVkCampaigns.campaignType,
        budget: adVkCampaigns.budget,
        schedule: adVkCampaigns.schedule,
        sourceCreatedAt: adVkCampaigns.sourceCreatedAt,
        sourceUpdatedAt: adVkCampaigns.sourceUpdatedAt,
        firstSeenAt: adVkCampaigns.firstSeenAt,
        lastSeenAt: adVkCampaigns.lastSeenAt,
        inactiveAt: adVkCampaigns.inactiveAt,
        fingerprint: adVkCampaigns.fingerprint,
      }).from(adVkCampaigns).innerJoin(adVkAccounts, eq(adVkCampaigns.accountId, adVkAccounts.id)).where(and(
        input.status ? eq(adVkCampaigns.status, input.status) : undefined,
        input.after ? or(
          lt(adVkCampaigns.lastSeenAt, input.after.lastSeenAt),
          and(eq(adVkCampaigns.lastSeenAt, input.after.lastSeenAt), lt(adVkCampaigns.id, input.after.id)),
        ) : undefined,
      )).orderBy(desc(adVkCampaigns.lastSeenAt), desc(adVkCampaigns.id)).limit(input.limit);
    },

    async listAdGroupRows(input: { limit: number; status?: string; campaignExternalId?: string; after?: CursorKey }) {
      return db.select({
        id: adVkAdGroups.id,
        externalId: adVkAdGroups.externalId,
        campaignExternalId: adVkCampaigns.externalId,
        name: adVkAdGroups.name,
        status: adVkAdGroups.status,
        packageSummary: adVkAdGroups.packageSummary,
        optimizationSummary: adVkAdGroups.optimizationSummary,
        bidStrategySummary: adVkAdGroups.bidStrategySummary,
        sourceCreatedAt: adVkAdGroups.sourceCreatedAt,
        sourceUpdatedAt: adVkAdGroups.sourceUpdatedAt,
        firstSeenAt: adVkAdGroups.firstSeenAt,
        lastSeenAt: adVkAdGroups.lastSeenAt,
        inactiveAt: adVkAdGroups.inactiveAt,
        fingerprint: adVkAdGroups.fingerprint,
      }).from(adVkAdGroups).innerJoin(adVkCampaigns, eq(adVkAdGroups.campaignId, adVkCampaigns.id)).where(and(
        input.status ? eq(adVkAdGroups.status, input.status) : undefined,
        input.campaignExternalId ? eq(adVkCampaigns.externalId, input.campaignExternalId) : undefined,
        input.after ? or(
          lt(adVkAdGroups.lastSeenAt, input.after.lastSeenAt),
          and(eq(adVkAdGroups.lastSeenAt, input.after.lastSeenAt), lt(adVkAdGroups.id, input.after.id)),
        ) : undefined,
      )).orderBy(desc(adVkAdGroups.lastSeenAt), desc(adVkAdGroups.id)).limit(input.limit);
    },

    async listAdRows(input: { limit: number; status?: string; campaignExternalId?: string; adGroupExternalId?: string; after?: CursorKey }) {
      return db.select({
        id: adVkAds.id,
        externalId: adVkAds.externalId,
        campaignExternalId: adVkCampaigns.externalId,
        adGroupExternalId: adVkAdGroups.externalId,
        name: adVkAds.name,
        status: adVkAds.status,
        moderationStatus: adVkAds.moderationStatus,
        moderationReasonCode: adVkAds.moderationReasonCode,
        landingOrigin: adVkAds.landingOrigin,
        landingPath: adVkAds.landingPath,
        sourceCreatedAt: adVkAds.sourceCreatedAt,
        sourceUpdatedAt: adVkAds.sourceUpdatedAt,
        firstSeenAt: adVkAds.firstSeenAt,
        lastSeenAt: adVkAds.lastSeenAt,
        inactiveAt: adVkAds.inactiveAt,
        fingerprint: adVkAds.fingerprint,
      }).from(adVkAds)
        .innerJoin(adVkCampaigns, eq(adVkAds.campaignId, adVkCampaigns.id))
        .innerJoin(adVkAdGroups, eq(adVkAds.adGroupId, adVkAdGroups.id))
        .where(and(
          input.status ? eq(adVkAds.status, input.status) : undefined,
          input.campaignExternalId ? eq(adVkCampaigns.externalId, input.campaignExternalId) : undefined,
          input.adGroupExternalId ? eq(adVkAdGroups.externalId, input.adGroupExternalId) : undefined,
          input.after ? or(
            lt(adVkAds.lastSeenAt, input.after.lastSeenAt),
            and(eq(adVkAds.lastSeenAt, input.after.lastSeenAt), lt(adVkAds.id, input.after.id)),
          ) : undefined,
        )).orderBy(desc(adVkAds.lastSeenAt), desc(adVkAds.id)).limit(input.limit);
    },

    async getAdRow(externalId: string) {
      const rows = await db.select().from(adVkAds).where(eq(adVkAds.externalId, externalId)).limit(2);
      if (rows.length !== 1) return null;
      const row = rows[0];
      const [creative] = await db.select().from(adVkCreativeVersions).where(and(
        eq(adVkCreativeVersions.adId, row.id), isNull(adVkCreativeVersions.activeTo),
      )).limit(1);
      return { ...row, creative: creative ?? null };
    },

    async getStatisticsRows(input: { objectKind: VkAdsObjectKind; externalIds: string[]; dateFrom: string; dateTo: string }) {
      return db.select().from(adVkDailyMetrics).where(and(
        eq(adVkDailyMetrics.objectKind, input.objectKind),
        inArray(adVkDailyMetrics.externalId, input.externalIds),
        sql`${adVkDailyMetrics.metricDate} >= ${input.dateFrom}`,
        sql`${adVkDailyMetrics.metricDate} <= ${input.dateTo}`,
      )).orderBy(adVkDailyMetrics.metricDate, adVkDailyMetrics.externalId);
    },

    async getCreativeImageRef(id: string) {
      const [row] = await db.select({ objectKey: adVkCreativeVersions.imageObjectKey }).from(adVkCreativeVersions)
        .where(eq(adVkCreativeVersions.id, id));
      return row?.objectKey ? { objectKey: row.objectKey } : null;
    },
  };
}

export type VkAdsRepository = ReturnType<typeof createVkAdsRepository>;
