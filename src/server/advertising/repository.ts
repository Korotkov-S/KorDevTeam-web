import {
  and,
  desc,
  eq,
  gte,
  lt,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  adCommandReceipts,
  adExperimentEvents,
  adExperimentVariants,
  adExperiments,
  adHypotheses,
  adLeadAttributions,
  adLearnings,
  adMarketSignals,
  adMetricSnapshots,
  adResearchSources,
} from "../db/schema";
import type {
  AdActor,
  AdExperimentStatus,
  AdsPage,
  AdsPageInput,
  ApprovalCommand,
  ExperimentCommand,
  ExperimentEventCommand,
  ExperimentVerdictCommand,
  HypothesisCommand,
  JsonRecord,
  LeadAttributionCommand,
  LearningCommand,
  ManualNoteCommand,
  MarketSignalCommand,
  MetricSnapshotCommand,
  ResearchSourceCommand,
  VariantBindingCommand,
} from "./contracts";

export type AdvertisingDatabase = ReturnType<typeof createDb>;
type Cursor = { createdAt: Date; id: string };

export type ResearchSourceFilters = {
  channel?: typeof adResearchSources.$inferSelect.channel;
  sourceType?: typeof adResearchSources.$inferSelect.sourceType;
  evidenceGrade?: typeof adResearchSources.$inferSelect.evidenceGrade;
};
export type MarketSignalFilters = {
  sourceId?: string;
  evidenceGrade?: typeof adMarketSignals.$inferSelect.evidenceGrade;
};
export type HypothesisFilters = {
  status?: typeof adHypotheses.$inferSelect.status;
  service?: string;
};
export type ExperimentFilters = {
  status?: typeof adExperiments.$inferSelect.status;
  hypothesisId?: string;
};
export type LearningFilters = {
  confidence?: typeof adLearnings.$inferSelect.confidence;
  hypothesisId?: string;
  experimentId?: string;
};
export type EventFilters = { experimentId?: string; action?: string };
export type EconomicsFilters = { experimentId?: string; from?: string; to?: string };

export type CommandClaim =
  | { state: "claimed" }
  | { state: "processing" }
  | { state: "replay"; result: JsonRecord }
  | { state: "failed"; errorCode: string }
  | { state: "conflict" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function pageInput(page: AdsPageInput): { limit: number; cursor: Cursor | null } {
  const limit = page.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("ads_page_invalid");
  if (!page.cursor) return { limit, cursor: null };
  try {
    const parsed = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || !UUID.test(parsed.id)) throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) throw new Error();
    return { limit, cursor: { createdAt, id: parsed.id } };
  } catch {
    throw new Error("ads_cursor_invalid");
  }
}

function cursorCondition(
  createdAt: AnyColumn<{ data: Date }>,
  id: AnyColumn<{ data: string }>,
  cursor: Cursor | null,
): SQL | undefined {
  return cursor
    ? or(lt(createdAt, cursor.createdAt), and(eq(createdAt, cursor.createdAt), lt(id, cursor.id)))
    : undefined;
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

function pageOf<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): AdsPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null };
}

function conditions(parts: Array<SQL | undefined>): SQL | undefined {
  const present = parts.filter((part): part is SQL => Boolean(part));
  return present.length ? and(...present) : undefined;
}

function date(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function number(value: string | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function databaseCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return databaseCode(error.cause);
  return undefined;
}

function experimentSummarySelection() {
  return {
    id: adExperiments.id,
    hypothesisId: adExperiments.hypothesisId,
    hypothesisVersion: adExperiments.hypothesisVersion,
    passportFingerprint: adExperiments.passportFingerprint,
    status: adExperiments.status,
    approvalTaskId: adExperiments.approvalTaskId,
    approvalText: adExperiments.approvalText,
    approvedAt: adExperiments.approvedAt,
    approvedByActorKind: adExperiments.approvedByActorKind,
    approvedByActorId: adExperiments.approvedByActorId,
    dailyBudget: adExperiments.dailyBudget,
    totalBudget: adExperiments.totalBudget,
    schedule: adExperiments.schedule,
    kpi: adExperiments.kpi,
    decisionRules: adExperiments.decisionRules,
    spentAmount: adExperiments.spentAmount,
    verdict: adExperiments.verdict,
    verdictEvidence: adExperiments.verdictEvidence,
    startsAt: adExperiments.startsAt,
    endsAt: adExperiments.endsAt,
    version: adExperiments.version,
    createdAt: adExperiments.createdAt,
    updatedAt: adExperiments.updatedAt,
  };
}

export function createAdvertisingRepository(db: AdvertisingDatabase) {
  return {
    async getOverview() {
      const [counts] = await db.select({
        activeExperiments: sql<number>`count(*) filter (where ${adExperiments.status} in ('creating','moderation','scheduled','running','stopping'))::int`,
        awaitingApproval: sql<number>`count(*) filter (where ${adExperiments.status} = 'awaiting_approval')::int`,
      }).from(adExperiments);
      const [knowledge] = await db.select({ count: sql<number>`count(*)::int` }).from(adHypotheses);
      const [learnings] = await db.select({ count: sql<number>`count(*)::int` }).from(adLearnings);
      const economics = await this.getEconomics({});
      const [latest] = await db.select({ createdAt: adMetricSnapshots.createdAt })
        .from(adMetricSnapshots).orderBy(desc(adMetricSnapshots.createdAt)).limit(1);
      return {
        activeExperiments: counts?.activeExperiments ?? 0,
        awaitingApproval: counts?.awaitingApproval ?? 0,
        hypotheses: knowledge?.count ?? 0,
        learnings: learnings?.count ?? 0,
        ...economics,
        lastMetricAt: latest?.createdAt ?? null,
      };
    },

    async listResearchSources(filters: ResearchSourceFilters = {}, page: AdsPageInput = {}) {
      const parsed = pageInput(page);
      const rows = await db.select({
        id: adResearchSources.id,
        url: adResearchSources.url,
        publisher: adResearchSources.publisher,
        sourceType: adResearchSources.sourceType,
        channel: adResearchSources.channel,
        publishedAt: adResearchSources.publishedAt,
        discoveredAt: adResearchSources.discoveredAt,
        evidenceGrade: adResearchSources.evidenceGrade,
        fingerprint: adResearchSources.fingerprint,
        createdAt: adResearchSources.createdAt,
        updatedAt: adResearchSources.updatedAt,
      }).from(adResearchSources).where(conditions([
        filters.channel ? eq(adResearchSources.channel, filters.channel) : undefined,
        filters.sourceType ? eq(adResearchSources.sourceType, filters.sourceType) : undefined,
        filters.evidenceGrade ? eq(adResearchSources.evidenceGrade, filters.evidenceGrade) : undefined,
        cursorCondition(adResearchSources.createdAt, adResearchSources.id, parsed.cursor),
      ])).orderBy(desc(adResearchSources.createdAt), desc(adResearchSources.id)).limit(parsed.limit + 1);
      return pageOf(rows, parsed.limit);
    },

    async listMarketSignals(filters: MarketSignalFilters = {}, page: AdsPageInput = {}) {
      const parsed = pageInput(page);
      const rows = await db.select().from(adMarketSignals).where(conditions([
        filters.sourceId ? eq(adMarketSignals.sourceId, filters.sourceId) : undefined,
        filters.evidenceGrade ? eq(adMarketSignals.evidenceGrade, filters.evidenceGrade) : undefined,
        cursorCondition(adMarketSignals.createdAt, adMarketSignals.id, parsed.cursor),
      ])).orderBy(desc(adMarketSignals.createdAt), desc(adMarketSignals.id)).limit(parsed.limit + 1);
      return pageOf(rows, parsed.limit);
    },

    async listHypotheses(filters: HypothesisFilters = {}, page: AdsPageInput = {}) {
      const parsed = pageInput(page);
      const rows = await db.select().from(adHypotheses).where(conditions([
        filters.status ? eq(adHypotheses.status, filters.status) : undefined,
        filters.service ? eq(adHypotheses.service, filters.service) : undefined,
        cursorCondition(adHypotheses.createdAt, adHypotheses.id, parsed.cursor),
      ])).orderBy(desc(adHypotheses.createdAt), desc(adHypotheses.id)).limit(parsed.limit + 1);
      return pageOf(rows, parsed.limit);
    },

    async getHypothesis(id: string) {
      const [row] = await db.select().from(adHypotheses).where(eq(adHypotheses.id, id)).limit(1);
      return row ?? null;
    },

    async listExperiments(filters: ExperimentFilters = {}, page: AdsPageInput = {}) {
      const parsed = pageInput(page);
      const rows = await db.select(experimentSummarySelection()).from(adExperiments).where(conditions([
        filters.status ? eq(adExperiments.status, filters.status) : undefined,
        filters.hypothesisId ? eq(adExperiments.hypothesisId, filters.hypothesisId) : undefined,
        cursorCondition(adExperiments.createdAt, adExperiments.id, parsed.cursor),
      ])).orderBy(desc(adExperiments.createdAt), desc(adExperiments.id)).limit(parsed.limit + 1);
      return pageOf(rows, parsed.limit);
    },

    async getExperiment(id: string) {
      const [experiment] = await db.select(experimentSummarySelection()).from(adExperiments)
        .where(eq(adExperiments.id, id)).limit(1);
      if (!experiment) return null;
      const [variants, metrics, leads, events] = await Promise.all([
        db.select().from(adExperimentVariants).where(eq(adExperimentVariants.experimentId, id))
          .orderBy(desc(adExperimentVariants.createdAt), desc(adExperimentVariants.id)),
        db.select({
          id: adMetricSnapshots.id,
          experimentId: adMetricSnapshots.experimentId,
          variantId: adMetricSnapshots.variantId,
          source: adMetricSnapshots.source,
          externalObjectId: adMetricSnapshots.externalObjectId,
          granularity: adMetricSnapshots.granularity,
          periodStart: adMetricSnapshots.periodStart,
          periodEnd: adMetricSnapshots.periodEnd,
          spend: adMetricSnapshots.spend,
          impressions: adMetricSnapshots.impressions,
          reach: adMetricSnapshots.reach,
          clicks: adMetricSnapshots.clicks,
          formOpens: adMetricSnapshots.formOpens,
          leads: adMetricSnapshots.leads,
          createdAt: adMetricSnapshots.createdAt,
        }).from(adMetricSnapshots).where(eq(adMetricSnapshots.experimentId, id))
          .orderBy(desc(adMetricSnapshots.periodStart), desc(adMetricSnapshots.id)),
        db.select().from(adLeadAttributions).where(eq(adLeadAttributions.experimentId, id))
          .orderBy(desc(adLeadAttributions.createdAt), desc(adLeadAttributions.id)),
        this.listEvents({ experimentId: id }, { limit: 100 }).then(page => page.items),
      ]);
      return { ...experiment, variants, metrics, leads, events };
    },

    async listLearnings(filters: LearningFilters = {}, page: AdsPageInput = {}) {
      const parsed = pageInput(page);
      const rows = await db.select().from(adLearnings).where(conditions([
        filters.confidence ? eq(adLearnings.confidence, filters.confidence) : undefined,
        filters.hypothesisId ? eq(adLearnings.hypothesisId, filters.hypothesisId) : undefined,
        filters.experimentId ? eq(adLearnings.experimentId, filters.experimentId) : undefined,
        cursorCondition(adLearnings.createdAt, adLearnings.id, parsed.cursor),
      ])).orderBy(desc(adLearnings.createdAt), desc(adLearnings.id)).limit(parsed.limit + 1);
      return pageOf(rows, parsed.limit);
    },

    async listEvents(filters: EventFilters = {}, page: AdsPageInput = {}) {
      const parsed = pageInput(page);
      const rows = await db.select({
        id: adExperimentEvents.id,
        experimentId: adExperimentEvents.experimentId,
        variantId: adExperimentEvents.variantId,
        actorKind: adExperimentEvents.actorKind,
        actorId: adExperimentEvents.actorId,
        action: adExperimentEvents.action,
        reason: adExperimentEvents.reason,
        previousState: adExperimentEvents.previousState,
        newState: adExperimentEvents.newState,
        requestId: adExperimentEvents.requestId,
        errorCode: adExperimentEvents.errorCode,
        createdAt: adExperimentEvents.createdAt,
      }).from(adExperimentEvents).where(conditions([
        filters.experimentId ? eq(adExperimentEvents.experimentId, filters.experimentId) : undefined,
        filters.action ? eq(adExperimentEvents.action, filters.action) : undefined,
        cursorCondition(adExperimentEvents.createdAt, adExperimentEvents.id, parsed.cursor),
      ])).orderBy(desc(adExperimentEvents.createdAt), desc(adExperimentEvents.id)).limit(parsed.limit + 1);
      return pageOf(rows, parsed.limit);
    },

    async getEconomics(filters: EconomicsFilters = {}) {
      const metricWhere = conditions([
        filters.experimentId ? eq(adMetricSnapshots.experimentId, filters.experimentId) : undefined,
        filters.from ? gte(adMetricSnapshots.periodStart, new Date(filters.from)) : undefined,
        filters.to ? lte(adMetricSnapshots.periodEnd, new Date(filters.to)) : undefined,
      ]);
      const leadWhere = conditions([
        filters.experimentId ? eq(adLeadAttributions.experimentId, filters.experimentId) : undefined,
        filters.from ? gte(adLeadAttributions.submittedAt, new Date(filters.from)) : undefined,
        filters.to ? lte(adLeadAttributions.submittedAt, new Date(filters.to)) : undefined,
      ]);
      const [metrics] = await db.select({
        spend: sql<string>`coalesce(sum(${adMetricSnapshots.spend}), 0)::numeric`,
        impressions: sql<number>`coalesce(sum(${adMetricSnapshots.impressions}), 0)::int`,
        clicks: sql<number>`coalesce(sum(${adMetricSnapshots.clicks}), 0)::int`,
        leads: sql<number>`coalesce(sum(${adMetricSnapshots.leads}), 0)::int`,
      }).from(adMetricSnapshots).where(metricWhere);
      const [commercial] = await db.select({
        qualified: sql<number>`count(*) filter (where ${adLeadAttributions.classification} in ('qualified','won'))::int`,
        won: sql<number>`count(*) filter (where ${adLeadAttributions.classification} = 'won')::int`,
        revenue: sql<string>`coalesce(sum(${adLeadAttributions.amount}) filter (where ${adLeadAttributions.classification} = 'won'), 0)::numeric`,
        potentialRevenue: sql<string>`coalesce(sum(${adLeadAttributions.potentialAmount}) filter (where ${adLeadAttributions.classification} <> 'won'), 0)::numeric`,
      }).from(adLeadAttributions).where(leadWhere);
      return {
        spend: number(metrics?.spend),
        impressions: metrics?.impressions ?? 0,
        clicks: metrics?.clicks ?? 0,
        leads: metrics?.leads ?? 0,
        qualified: commercial?.qualified ?? 0,
        won: commercial?.won ?? 0,
        revenue: number(commercial?.revenue),
        potentialRevenue: number(commercial?.potentialRevenue),
      };
    },

    async claimCommand(commandName: string, idempotencyKey: string, requestHash: string): Promise<CommandClaim> {
      const inserted = await db.insert(adCommandReceipts).values({ idempotencyKey, commandName, requestHash })
        .onConflictDoNothing({ target: adCommandReceipts.idempotencyKey }).returning({ id: adCommandReceipts.id });
      if (inserted.length) return { state: "claimed" };
      const [existing] = await db.select().from(adCommandReceipts)
        .where(eq(adCommandReceipts.idempotencyKey, idempotencyKey)).limit(1);
      if (!existing || existing.commandName !== commandName || existing.requestHash !== requestHash) return { state: "conflict" };
      if (existing.status === "completed") return { state: "replay", result: existing.safeResult };
      if (existing.status === "failed") return { state: "failed", errorCode: existing.errorCode ?? "ads_command_failed" };
      return { state: "processing" };
    },

    async completeCommand(idempotencyKey: string, result: JsonRecord) {
      const [receipt] = await db.update(adCommandReceipts).set({
        status: "completed",
        safeResult: result,
        errorCode: null,
        completedAt: new Date(),
      }).where(and(eq(adCommandReceipts.idempotencyKey, idempotencyKey), eq(adCommandReceipts.status, "processing")))
        .returning();
      if (!receipt) throw new Error("ads_command_conflict");
      return receipt;
    },

    async failCommand(idempotencyKey: string, errorCode: string) {
      const [receipt] = await db.update(adCommandReceipts).set({
        status: "failed",
        safeResult: {},
        errorCode,
        completedAt: new Date(),
      }).where(and(eq(adCommandReceipts.idempotencyKey, idempotencyKey), eq(adCommandReceipts.status, "processing")))
        .returning();
      if (!receipt) throw new Error("ads_command_conflict");
      return receipt;
    },

    async createResearchSource(input: ResearchSourceCommand & { fingerprint: string }) {
      const inserted = await db.insert(adResearchSources).values({
        ...input,
        publishedAt: date(input.publishedAt),
        discoveredAt: input.discoveredAt ? new Date(input.discoveredAt) : undefined,
      }).onConflictDoNothing({ target: adResearchSources.fingerprint }).returning();
      if (inserted[0]) return inserted[0];
      const [existing] = await db.select().from(adResearchSources)
        .where(eq(adResearchSources.fingerprint, input.fingerprint)).limit(1);
      if (!existing) throw new Error("ads_research_source_conflict");
      return existing;
    },

    async createMarketSignal(input: MarketSignalCommand & { fingerprint: string }) {
      const inserted = await db.insert(adMarketSignals).values(input)
        .onConflictDoNothing({ target: adMarketSignals.fingerprint }).returning();
      if (inserted[0]) return inserted[0];
      const [existing] = await db.select().from(adMarketSignals)
        .where(eq(adMarketSignals.fingerprint, input.fingerprint)).limit(1);
      if (!existing) throw new Error("ads_market_signal_conflict");
      return existing;
    },

    async createHypothesis(input: HypothesisCommand) {
      const [created] = await db.insert(adHypotheses).values({
        ...input,
        dailyBudget: String(input.dailyBudget),
        totalBudget: String(input.totalBudget),
      }).returning();
      return created!;
    },

    async updateHypothesis(
      id: string,
      expectedVersion: number,
      input: Partial<Omit<typeof adHypotheses.$inferInsert, "id" | "version" | "createdAt" | "updatedAt">>,
    ) {
      const [updated] = await db.update(adHypotheses).set({
        ...input,
        updatedAt: new Date(),
        version: sql`${adHypotheses.version} + 1`,
      }).where(and(eq(adHypotheses.id, id), eq(adHypotheses.version, expectedVersion))).returning();
      if (!updated) throw new Error("ads_hypothesis_conflict");
      return updated;
    },

    async createExperiment(input: ExperimentCommand & { passportFingerprint: string }) {
      const [created] = await db.insert(adExperiments).values({
        ...input,
        dailyBudget: String(input.dailyBudget),
        totalBudget: String(input.totalBudget),
        startsAt: date(input.startsAt),
        endsAt: date(input.endsAt),
      }).returning();
      return created!;
    },

    async saveApproval(input: ApprovalCommand, approvedBy: AdActor) {
      const [updated] = await db.update(adExperiments).set({
        approvalTaskId: input.approvalTaskId,
        approvalText: input.approvalText,
        approvedAt: new Date(input.approvedAt),
        approvedByActorKind: approvedBy.kind,
        approvedByActorId: approvedBy.id,
        status: "approved",
        updatedAt: new Date(),
        version: sql`${adExperiments.version} + 1`,
      }).where(and(
        eq(adExperiments.id, input.experimentId),
        eq(adExperiments.version, input.expectedVersion),
        eq(adExperiments.passportFingerprint, input.passportFingerprint),
      )).returning();
      if (!updated) throw new Error("ads_experiment_conflict");
      return updated;
    },

    async transitionExperiment(id: string, expectedVersion: number, status: AdExperimentStatus) {
      const [updated] = await db.update(adExperiments).set({
        status,
        updatedAt: new Date(),
        version: sql`${adExperiments.version} + 1`,
      }).where(and(eq(adExperiments.id, id), eq(adExperiments.version, expectedVersion))).returning();
      if (!updated) throw new Error("ads_experiment_conflict");
      return updated;
    },

    async upsertVariantBinding(input: VariantBindingCommand) {
      const values = { ...input, status: input.status ?? "draft" as const };
      const [variant] = await db.insert(adExperimentVariants).values(values).onConflictDoUpdate({
        target: [adExperimentVariants.experimentId, adExperimentVariants.role],
        set: {
          name: input.name,
          textVersion: input.textVersion,
          creativeVersion: input.creativeVersion,
          audienceFingerprint: input.audienceFingerprint,
          conversionPath: input.conversionPath,
          vkCampaignId: input.vkCampaignId,
          vkGroupId: input.vkGroupId,
          vkBannerId: input.vkBannerId,
          vkFormId: input.vkFormId,
          status: input.status ?? "draft",
          updatedAt: new Date(),
          version: sql`${adExperimentVariants.version} + 1`,
        },
      }).returning();
      return variant!;
    },

    async insertMetricSnapshot(input: MetricSnapshotCommand) {
      try {
        const [snapshot] = await db.insert(adMetricSnapshots).values({
          ...input,
          spend: String(input.spend),
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
        }).returning();
        return snapshot!;
      } catch (error) {
        if (databaseCode(error) === "23505") throw new Error("ads_metric_snapshot_conflict");
        throw error;
      }
    },

    async upsertLeadAttribution(input: LeadAttributionCommand) {
      const values = {
        ...input,
        amount: input.amount === null || input.amount === undefined ? null : String(input.amount),
        potentialAmount: input.potentialAmount === null || input.potentialAmount === undefined ? null : String(input.potentialAmount),
        submittedAt: new Date(input.submittedAt),
        contactedAt: date(input.contactedAt),
        qualifiedAt: date(input.qualifiedAt),
        closedAt: date(input.closedAt),
      };
      const [lead] = await db.insert(adLeadAttributions).values(values).onConflictDoUpdate({
        target: adLeadAttributions.leadUuid,
        set: { ...values, updatedAt: new Date() },
      }).returning();
      return lead!;
    },

    async appendEvent(input: ExperimentEventCommand, eventActor: AdActor) {
      const [event] = await db.insert(adExperimentEvents).values({
        ...input,
        actorKind: eventActor.kind,
        actorId: eventActor.id,
      }).returning();
      return event!;
    },

    async finishExperiment(input: ExperimentVerdictCommand, status: AdExperimentStatus = "analyzed") {
      const [updated] = await db.update(adExperiments).set({
        status,
        verdict: input.verdict ?? null,
        verdictEvidence: input.evidence,
        endsAt: new Date(),
        updatedAt: new Date(),
        version: sql`${adExperiments.version} + 1`,
      }).where(and(eq(adExperiments.id, input.experimentId), eq(adExperiments.version, input.expectedVersion))).returning();
      if (!updated) throw new Error("ads_experiment_conflict");
      return updated;
    },

    async createLearning(input: LearningCommand, supersedes?: { id: string; expectedVersion: number }) {
      return db.transaction(async tx => {
        const [learning] = await tx.insert(adLearnings).values({
          ...input,
          reviewAt: date(input.reviewAt),
        }).returning();
        if (supersedes) {
          const [previous] = await tx.update(adLearnings).set({
            supersededById: learning!.id,
            updatedAt: new Date(),
            version: sql`${adLearnings.version} + 1`,
          }).where(and(
            eq(adLearnings.id, supersedes.id),
            eq(adLearnings.version, supersedes.expectedVersion),
            sql`${adLearnings.supersededById} is null`,
          )).returning({ id: adLearnings.id });
          if (!previous) throw new Error("ads_learning_conflict");
        }
        return learning!;
      });
    },

    appendManualNote(input: ManualNoteCommand, noteActor: AdActor) {
      return this.appendEvent({
        experimentId: input.experimentId,
        action: "manual_note",
        reason: input.note,
        payload: {},
      }, noteActor);
    },
  };
}

export type AdvertisingRepository = ReturnType<typeof createAdvertisingRepository>;
