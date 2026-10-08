import { createHash } from "node:crypto";

import { and, arrayOverlaps, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  geoCitations,
  geoCrawlerChecks,
  geoEntities,
  geoExperimentPrompts,
  geoExperiments,
  geoFanoutQueries,
  geoObservationMentions,
  geoObservations,
  geoPrompts,
  geoReferralDailyMetrics,
  geoRuns,
  geoCollectionJobs,
  geoCollectionAttempts,
  geoCollectionLeases,
  geoTopics,
  seoQueries,
  seoChanges,
  seoCollectionRuns,
  seoRecommendations,
} from "../db/schema";
import { normalizeSeoQuery } from "../seo-monitoring/normalization";
import { GEO_PLATFORMS, type
  GeoCitationCategory,
  GeoEntityStatus,
  GeoObservationInput,
  GeoPlatform,
  GeoPromptCatalogEntry,
  GeoPromptCategory,
  GeoPromptStatus,
  GeoRunMode,
} from "./contracts";
import { summarizeGeoObservations } from "./analytics";
import { summarizeGeoControl } from "./control";
import type { NormalizedGeoReferral } from "./referrals";
import { evaluateExperimentMetric, type ExperimentMilestone } from "./experiments";
import {
  createGeoQueueRepository,
  geoQueueLock,
  authorizeGeoObservation,
  finishGeoQueue,
  assertGeoLease,
} from "./queueRepository";

export type GeoDatabase = ReturnType<typeof createDb>;

export type GeoStartRunInput = {
  platform: GeoPlatform;
  surface: string;
  mode: GeoRunMode;
  region: string;
  language: string;
  promptIds: string[];
  metadata: Record<string, unknown>;
};

export type GeoFinishRunInput = {
  status: "success" | "partial" | "failed";
  completedCount: number;
  storedCount: number;
  errorCode: string | null;
  metadata: Record<string, unknown>;
};

export type StoredGeoCitation = {
  url: string;
  hostname: string;
  title?: string | null;
  sourceOrder: number;
  isOwned: boolean;
  category: GeoCitationCategory;
  localPath: string | null;
};

export type StoredGeoObservationInput = Omit<GeoObservationInput, "citations" | "observedAt"> & {
  observedAt?: Date;
  citations: StoredGeoCitation[];
};

export type GeoPromptCandidateInput = {
  promptText: string;
  normalizedText: string;
  topicId: string;
  tags: string[];
  category: GeoPromptCategory;
  priority: number;
  language: string;
  region: string;
  targetPath: string | null;
  seoQueryId?: string | null;
  expectedEntityDomain?: string | null;
  source?: string;
};

export type GeoPromptUpdateInput = Partial<GeoPromptCandidateInput> & {
  id: string;
  status?: GeoPromptStatus;
};

export type GeoEntityWriteInput = {
  id?: string;
  canonicalName: string;
  type: "owned" | "competitor";
  aliases: string[];
  domains: string[];
  status: GeoEntityStatus;
};

export type GeoCrawlerCheckInput = {
  checkDate: string;
  target: string;
  bot: string;
  status: "pass" | "fail" | "unavailable";
  reasonCode?: string | null;
  httpStatus?: number | null;
  checkedAt?: Date;
  metadata: Record<string, unknown>;
};

export type GeoReadFilters = {
  from: string;
  to: string;
  platform?: GeoPlatform;
  surface?: string;
  sessionPersonalized?: boolean;
  mode?: GeoRunMode;
  language?: string;
  region?: string;
  topicId?: string;
  promptSetFingerprint?: string;
  promptIds?: string[];
};

export type GeoPage = { limit: number; cursor: string | null };

export type GeoActor = { adminUserId?: string; mcpTokenId?: string };
export type GeoExperimentCandidateInput = {
  recommendationId: string;
  pagePath: string;
  actionType: typeof geoExperiments.$inferInsert.actionType;
  hypothesis: string;
  platform: GeoPlatform;
  mode: GeoRunMode;
  language: string;
  region: string;
  promptIds: string[];
  promptSetFingerprint: string;
  primaryMetric: typeof geoExperiments.$inferInsert.primaryMetric;
  direction: "increase" | "decrease";
  minimumDelta: number;
  evaluationWindows: number[];
  expectedSignal: string;
};

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function metricFromOverview(overview: ReturnType<typeof summarizeGeoObservations>, metric: string) {
  const named = {
    mention_rate: overview.mentionRate,
    citation_rate: overview.citationRate,
    citation_share: overview.citationShare,
    owned_source_coverage: overview.ownedSourceCoverage,
    share_of_voice: overview.shareOfVoice,
  } as const;
  const selected = named[metric as keyof typeof named];
  return selected ? { value: selected.value, sample: selected.denominator, complete: selected.denominator > 0 }
    : { value: null, sample: 0, complete: false };
}

function inclusiveDays(from: string, to: string) {
  return (
    Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1
  );
}

async function readExperimentMetric(db: GeoDatabase, input: GeoReadFilters & {
  metric: typeof geoExperiments.$inferSelect.primaryMetric;
  pagePath: string;
}) {
  if (input.metric === "ai_referrals") {
    const [total] = await db.select({
      value: sql<number>`coalesce(sum(${geoReferralDailyMetrics.visits}), 0)::int`,
      rows: sql<number>`count(*)::int`,
    }).from(geoReferralDailyMetrics).where(and(
      gte(geoReferralDailyMetrics.observationDate, input.from),
      lte(geoReferralDailyMetrics.observationDate, input.to),
      eq(geoReferralDailyMetrics.platform, input.platform!),
      eq(geoReferralDailyMetrics.landingPath, input.pagePath),
    ));
    const coverage = await db.execute(sql`
      SELECT count(*)::int AS uncovered_days
        FROM generate_series(${input.from}::date, ${input.to}::date, interval '1 day') AS coverage_day(day)
       WHERE NOT EXISTS (
        SELECT 1
          FROM ${seoCollectionRuns} AS metrika_run
         WHERE metrika_run.source = 'yandex_metrika'
           AND metrika_run.status IN ('success', 'partial')
           AND metrika_run.metadata -> 'slices' ->> 'aiReferrals' = 'success'
           AND metrika_run.requested_from <= coverage_day.day::date
           AND metrika_run.requested_to >= coverage_day.day::date
      )`);
    const coverageRows = coverage.rows as Array<{ uncovered_days: number }>;
    return { value: total?.value ?? 0, sample: total?.rows ?? 0, complete: (coverageRows[0]?.uncovered_days ?? 1) === 0 };
  }
  if (input.metric === "crawler_health") {
    const [total] = await db.select({
      passed: sql<number>`count(*) FILTER (WHERE ${geoCrawlerChecks.status} = 'pass')::int`,
      checks: sql<number>`count(*)::int`,
      days: sql<number>`count(DISTINCT ${geoCrawlerChecks.checkDate})::int`,
    }).from(geoCrawlerChecks).where(and(
      gte(geoCrawlerChecks.checkDate, input.from),
      lte(geoCrawlerChecks.checkDate, input.to),
      eq(geoCrawlerChecks.target, input.pagePath),
      eq(geoCrawlerChecks.bot, "indexability"),
    ));
    const checks = total?.checks ?? 0;
    return {
      value: checks ? (total?.passed ?? 0) / checks : null,
      sample: checks,
      complete: (total?.days ?? 0) === inclusiveDays(input.from, input.to),
    };
  }
  return metricFromOverview(await readOverview(db, input), input.metric);
}

function evidenceRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function evidencePeriod(value: unknown) {
  const evidence = evidenceRecord(value);
  const period = evidenceRecord(evidence?.period);
  const from = period?.from;
  const to = period?.to;
  if (typeof from !== "string" || typeof to !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to)
    || inclusiveDays(from, to) < 1 || inclusiveDays(from, to) > 366) {
    throw new Error("geo_experiment_recommendation_invalid");
  }
  return { evidence: evidence!, from, to };
}

async function recommendationHasEvidence(db: GeoDatabase, recommendationEvidence: unknown, input: GeoExperimentCandidateInput) {
  const { evidence, from, to } = evidencePeriod(recommendationEvidence);
  const expectedSource = input.primaryMetric === "ai_referrals" ? "geo_referrals"
    : input.primaryMetric === "crawler_health" ? "geo_crawler" : "geo_observations";
  const dimensions = evidenceRecord(evidence.dimensions);
  const evidencePromptIds = Array.isArray(evidence.promptIds) ? evidence.promptIds.filter((id): id is string => typeof id === "string").sort() : [];
  if (evidence.source !== expectedSource || evidence.metric !== input.primaryMetric || !dimensions
    || dimensions.platform !== input.platform || dimensions.mode !== input.mode
    || dimensions.language !== input.language || dimensions.region !== input.region
    || dimensions.promptSetFingerprint !== input.promptSetFingerprint
    || JSON.stringify(evidencePromptIds) !== JSON.stringify([...input.promptIds].sort())) return false;

  const metric = await readExperimentMetric(db, {
    from, to, platform: input.platform, mode: input.mode, language: input.language, region: input.region,
    promptSetFingerprint: input.promptSetFingerprint, promptIds: input.promptIds,
    metric: input.primaryMetric, pagePath: input.pagePath,
  });
  if (!metric.complete) return false;
  if (input.primaryMetric === "ai_referrals") return (metric.value ?? 0) >= 10;
  if (input.primaryMetric === "crawler_health") return metric.sample >= 28;

  const [weekly] = await db.select({
    weeks: sql<number>`count(DISTINCT date_trunc('week', ${geoRuns.startedAt}))::int`,
  }).from(geoRuns).where(and(
    eq(geoRuns.status, "success"),
    eq(geoRuns.platform, input.platform),
    eq(geoRuns.mode, input.mode),
    eq(geoRuns.language, input.language),
    eq(geoRuns.region, input.region),
    eq(geoRuns.promptSetFingerprint, input.promptSetFingerprint),
    gte(geoRuns.startedAt, new Date(`${from}T00:00:00.000Z`)),
    lte(geoRuns.startedAt, new Date(`${to}T23:59:59.999Z`)),
  ));
  return (weekly?.weeks ?? 0) >= 3;
}

async function readAnalyticsRows(db: GeoDatabase, filters: GeoReadFilters) {
  return db.select({
    runId: geoRuns.id,
    runStatus: geoRuns.status,
    platform: geoRuns.platform,
    surface: geoRuns.surface,
    mode: geoRuns.mode,
    language: geoRuns.language,
    region: geoRuns.region,
    promptSetFingerprint: geoRuns.promptSetFingerprint,
    runPromptIds: geoRuns.promptIds,
    plannedCount: geoRuns.plannedCount,
    completedCount: geoRuns.completedCount,
    storedCount: geoRuns.storedCount,
    runStartedAt: geoRuns.startedAt,
    runCompletedAt: geoRuns.completedAt,
    runSessionPersonalized: geoRuns.sessionPersonalized,
    runComparisonEligible: sql<boolean>`NOT (${geoRuns.metadata} @> '{"comparisonEligible":false}'::jsonb)`,
    promptId: geoObservations.promptId,
    topicId: geoPrompts.topicId,
    category: geoPrompts.category,
    promptText: geoPrompts.promptText,
    promptUpdatedAt: geoPrompts.updatedAt,
    sessionPersonalized: geoObservations.sessionPersonalized,
    repetition: geoObservations.repetition,
    mentioned: geoObservations.mentioned,
    cited: geoObservations.cited,
    ownedCitationCount: sql<number>`(SELECT count(*)::int FROM geo_citations c WHERE c.observation_id = ${geoObservations.id} AND c.is_owned = true)`,
    totalCitationCount: sql<number>`(SELECT count(*)::int FROM geo_citations c WHERE c.observation_id = ${geoObservations.id})`,
    expectedOwnedCitationCount: sql<number>`(SELECT count(*)::int FROM geo_citations c WHERE c.observation_id = ${geoObservations.id} AND c.is_owned = true AND c.local_path = ${geoPrompts.targetPath})`,
    ownedEntityMentionCount: sql<number>`(SELECT count(*)::int FROM geo_observation_mentions m JOIN geo_entities e ON e.id = m.entity_id WHERE m.observation_id = ${geoObservations.id} AND e.type = 'owned' AND e.status = 'active')`,
    confirmedCompetitorMentionCount: sql<number>`(SELECT count(*)::int FROM geo_observation_mentions m JOIN geo_entities e ON e.id = m.entity_id WHERE m.observation_id = ${geoObservations.id} AND e.type = 'competitor' AND e.status = 'active')`,
  }).from(geoObservations)
    .innerJoin(geoRuns, eq(geoRuns.id, geoObservations.runId))
    .innerJoin(geoPrompts, eq(geoPrompts.id, geoObservations.promptId))
    .where(and(...runDimensionConditions(filters)));
}

async function readOverview(db: GeoDatabase, filters: GeoReadFilters) {
  return summarizeGeoObservations(await readAnalyticsRows(db, filters), filters);
}

function runDimensionConditions(filters: GeoReadFilters) {
  const conditions = [
    gte(geoRuns.startedAt, new Date(`${filters.from}T00:00:00.000Z`)),
    lte(geoRuns.startedAt, new Date(`${filters.to}T23:59:59.999Z`)),
  ];
  if (filters.platform) conditions.push(eq(geoRuns.platform, filters.platform));
  if (filters.surface) conditions.push(eq(geoRuns.surface, filters.surface));
  if (filters.mode) conditions.push(eq(geoRuns.mode, filters.mode));
  if (filters.language) conditions.push(eq(geoRuns.language, filters.language));
  if (filters.region) conditions.push(eq(geoRuns.region, filters.region));
  if (filters.promptSetFingerprint) conditions.push(eq(geoRuns.promptSetFingerprint, filters.promptSetFingerprint));
  return conditions;
}

function runConditions(filters: GeoReadFilters) {
  const conditions = runDimensionConditions(filters);
  if (filters.topicId) conditions.push(eq(geoPrompts.topicId, filters.topicId));
  if (filters.promptIds?.length) conditions.push(inArray(geoObservations.promptId, filters.promptIds));
  return and(...conditions);
}

function paged<T>(items: T[], page: GeoPage) {
  return { items, nextCursor: items.length === page.limit ? String(Number(page.cursor ?? "0") + page.limit) : null };
}

function assertOwnedRun(run: typeof geoRuns.$inferSelect | undefined, tokenId: string) {
  if (!run) throw new Error("geo_run_not_found");
  if (run.initiatedByMcpTokenId !== tokenId) throw new Error("geo_run_forbidden");
  if (run.status !== "running") throw new Error("geo_run_not_running");
  return run;
}

export function createGeoRepository(db: GeoDatabase, clock = () => new Date()) {
  return {
    collectionQueue: createGeoQueueRepository(db),
    async syncPromptCatalog(entries: readonly GeoPromptCatalogEntry[]) {
      return db.transaction(async (tx) => {
        const result = { inserted: 0, promoted: 0, preserved: 0 };
        for (const entry of entries) {
          let [topic] = await tx.select().from(geoTopics).where(eq(geoTopics.slug, entry.topic.slug)).limit(1);
          if (!topic) {
            [topic] = await tx.insert(geoTopics).values({
              name: entry.topic.name,
              slug: entry.topic.slug,
              targetPath: entry.topic.targetPath,
              priority: entry.priority,
              status: entry.status,
            }).returning();
          }
          if (!topic) throw new Error("geo_topic_not_found");

          let seoQueryId: string | null = null;
          if (entry.linkedSeoQuery) {
            const [seoQuery] = await tx.select({ id: seoQueries.id }).from(seoQueries)
              .where(eq(seoQueries.normalizedQuery, normalizeSeoQuery(entry.linkedSeoQuery))).limit(1);
            seoQueryId = seoQuery?.id ?? null;
          }
          const [existing] = await tx.select().from(geoPrompts).where(and(
            eq(geoPrompts.normalizedText, entry.normalizedText),
            eq(geoPrompts.language, entry.language),
            eq(geoPrompts.region, entry.region),
          )).limit(1);
          if (!existing) {
            await tx.insert(geoPrompts).values({
              promptText: entry.promptText,
              normalizedText: entry.normalizedText,
              topicId: topic.id,
              tags: entry.tags,
              category: entry.category,
              status: entry.status,
              priority: entry.priority,
              language: entry.language,
              region: entry.region,
              targetPath: entry.targetPath,
              seoQueryId,
              source: "catalog",
            });
            result.inserted++;
          } else if (existing.source === "catalog" && existing.status === "candidate" && entry.status === "active") {
            await tx.update(geoPrompts).set({ status: "active", updatedAt: new Date() })
              .where(eq(geoPrompts.id, existing.id));
            result.promoted++;
          } else {
            result.preserved++;
          }
        }
        return result;
      });
    },

    async createPromptCandidate(input: GeoPromptCandidateInput) {
      const [row] = await db.insert(geoPrompts).values({
        ...input,
        seoQueryId: input.seoQueryId ?? null,
        expectedEntityDomain: input.expectedEntityDomain ?? null,
        source: input.source ?? "mcp",
        status: "candidate",
      }).onConflictDoNothing({
        target: [geoPrompts.normalizedText, geoPrompts.language, geoPrompts.region],
      }).returning();
      if (row) return row;
      const [existing] = await db.select().from(geoPrompts).where(and(
        eq(geoPrompts.normalizedText, input.normalizedText),
        eq(geoPrompts.language, input.language),
        eq(geoPrompts.region, input.region),
      )).limit(1);
      if (!existing) throw new Error("geo_prompt_not_found");
      return existing;
    },

    async updatePrompt(input: GeoPromptUpdateInput) {
      const { id, ...values } = input;
      const [row] = await db.update(geoPrompts).set({ ...values, updatedAt: new Date() })
        .where(eq(geoPrompts.id, id)).returning();
      if (!row) throw new Error("geo_prompt_not_found");
      return row;
    },

    async updateEntity(input: GeoEntityWriteInput) {
      if (input.id) {
        const [row] = await db.update(geoEntities).set({
          canonicalName: input.canonicalName,
          type: input.type,
          aliases: input.aliases,
          domains: input.domains,
          status: input.status,
          updatedAt: new Date(),
        }).where(eq(geoEntities.id, input.id)).returning();
        if (!row) throw new Error("geo_entity_not_found");
        return row;
      }
      const [row] = await db.insert(geoEntities).values(input).onConflictDoUpdate({
        target: geoEntities.canonicalName,
        set: {
          type: input.type,
          aliases: input.aliases,
          domains: input.domains,
          status: input.status,
          updatedAt: new Date(),
        },
      }).returning();
      if (!row) throw new Error("geo_entity_not_found");
      return row;
    },

    async startRun(input: GeoStartRunInput, tokenId: string) {
      if (input.mode === "live_ui")
        return createGeoQueueRepository(db).startManagedRun(
          input,
          tokenId,
          clock(),
        );
      return db.transaction(async (tx) => {
        const promptIds = [...input.promptIds].sort();
        const prompts = await tx.select({
          id: geoPrompts.id,
          status: geoPrompts.status,
          language: geoPrompts.language,
          region: geoPrompts.region,
        }).from(geoPrompts).where(inArray(geoPrompts.id, promptIds));
        if (prompts.length !== promptIds.length || prompts.some((prompt) => prompt.status !== "active"
          || prompt.language !== input.language || prompt.region !== input.region)) {
          throw new Error("geo_run_prompt_set_invalid");
        }
        const promptSetFingerprint = createHash("sha256").update(promptIds.join("\u0000"), "utf8").digest("hex");
        const [row] = await tx.insert(geoRuns).values({
          ...input,
          promptIds,
          plannedCount: promptIds.length * 3,
          promptSetFingerprint,
          initiatedByMcpTokenId: tokenId,
          status: "running",
        }).returning();
        if (!row) throw new Error("geo_run_not_started");
        return row;
      });
    },

    async recordObservation(
      runId: string,
      tokenId: string,
      input: StoredGeoObservationInput,
    ) {
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        const [run] = await tx.select().from(geoRuns).where(eq(geoRuns.id, runId)).for("update").limit(1);
        const ownedRun = assertOwnedRun(run, tokenId);
        await authorizeGeoObservation(tx, ownedRun, tokenId, input, clock());
        if (!ownedRun.promptIds.includes(input.promptId)) throw new Error("geo_run_prompt_set_invalid");
        const [existing] = await tx.select().from(geoObservations).where(and(
          eq(geoObservations.runId, runId),
          eq(geoObservations.promptId, input.promptId),
          eq(geoObservations.repetition, input.repetition),
        )).limit(1);
        if (existing) return existing;

        const {
          mentions,
          citations,
          fanoutQueries,
          attemptId,
          leaseId: _leaseId,
          ...observation
        } = input;
        const mentionedEntities = mentions.length ? await tx.select({
          id: geoEntities.id,
          type: geoEntities.type,
          status: geoEntities.status,
        }).from(geoEntities).where(inArray(geoEntities.id, mentions.map((mention) => mention.entityId))) : [];
        if (mentionedEntities.length !== mentions.length) throw new Error("geo_observation_mentions_invalid");
        const ownedMentioned = mentionedEntities.some((entity) => entity.type === "owned" && entity.status === "active");
        if (observation.mentioned !== ownedMentioned) throw new Error("geo_observation_mention_flag_incoherent");
        const [row] = await tx.insert(geoObservations).values({ ...observation, runId }).returning();
        if (!row) throw new Error("geo_observation_not_stored");
        if (ownedRun.collectionManaged) {
          const [count] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(geoObservations)
            .where(eq(geoObservations.runId, runId));
          const [promptCount] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(geoObservations)
            .where(
              and(
                eq(geoObservations.runId, runId),
                eq(geoObservations.promptId, input.promptId),
              ),
            );
          await tx.update(geoRuns).set({
              sessionPersonalized: input.sessionPersonalized,
              storedCount: count.n,
              completedCount: count.n,
            })
            .where(eq(geoRuns.id, runId));
          await tx
            .update(geoCollectionJobs)
            .set({ completedRepetitions: promptCount.n })
            .where(
              and(
                eq(geoCollectionJobs.runId, runId),
                eq(geoCollectionJobs.promptId, input.promptId),
              ),
            );
          await tx
            .update(geoCollectionAttempts)
            .set({ resolvedAt: clock(), observationId: row.id })
            .where(eq(geoCollectionAttempts.id, attemptId!));
        }
        if (mentions.length) {
          await tx.insert(geoObservationMentions).values(mentions.map((mention) => ({
            observationId: row.id,
            ...mention,
          })));
        }
        if (citations.length) {
          await tx.insert(geoCitations).values(citations.map((citation) => ({
            observationId: row.id,
            ...citation,
          })));
        }
        if (fanoutQueries.length) {
          await tx.insert(geoFanoutQueries).values(fanoutQueries.map((query) => ({
            observationId: row.id,
            ...query,
          })));
        }
        return row;
      });
    },

    async finishRun(runId: string, tokenId: string, input: GeoFinishRunInput) {
      return db.transaction(async (tx) => {
        await geoQueueLock(tx);
        const [run] = await tx.select().from(geoRuns).where(eq(geoRuns.id, runId)).for("update").limit(1);
        const ownedRun = assertOwnedRun(run, tokenId);
        if (ownedRun.collectionManaged) {
          const [lease] = await tx
            .select()
            .from(geoCollectionLeases)
            .where(
              and(
                eq(geoCollectionLeases.runId, runId),
                eq(geoCollectionLeases.tokenId, tokenId),
                sql`${geoCollectionLeases.releasedAt} IS NULL`,
              ),
            )
            .orderBy(desc(geoCollectionLeases.expiresAt))
            .limit(1);
          if (!lease) throw new Error("geo_lease_expired");
          await assertGeoLease(tx, lease.id, tokenId, clock(), runId);
        }
        const counted = await tx.select({ count: sql<number>`count(*)::int` }).from(geoObservations)
          .where(eq(geoObservations.runId, runId));
        const stored = counted[0]?.count ?? 0;
        if (ownedRun.collectionManaged)
          input = { ...input, completedCount: stored, storedCount: stored };
        if (input.storedCount !== stored || input.completedCount < stored || input.completedCount > ownedRun.plannedCount
          || (input.status === "success" && (stored !== ownedRun.plannedCount
            || input.completedCount !== ownedRun.plannedCount || input.storedCount !== ownedRun.plannedCount))) {
          throw new Error("geo_run_counts_mismatch");
        }
        if (input.status === "success") {
          const completePrompts = await tx.select({
            promptId: geoObservations.promptId,
            count: sql<number>`count(*)::int`,
            repetitions: sql<number>`count(DISTINCT ${geoObservations.repetition})::int`,
          }).from(geoObservations).where(eq(geoObservations.runId, runId))
            .groupBy(geoObservations.promptId);
          if (completePrompts.length !== ownedRun.promptIds.length
            || completePrompts.some((prompt) => prompt.count !== 3 || prompt.repetitions !== 3)) {
            throw new Error("geo_run_incomplete");
          }
        }
        const [row] = await tx.update(geoRuns).set({
            ...input,
            completedAt: clock(),
          })
          .where(eq(geoRuns.id, runId))
          .returning();
        if (!row) throw new Error("geo_run_not_found");
        if (ownedRun.collectionManaged)
          await finishGeoQueue(tx, runId, input.status, clock());
        if (input.status === "success") {
          await tx.execute(sql`
            INSERT INTO geo_entities (canonical_name, type, aliases, domains, status)
            SELECT lower(c.hostname), 'competitor'::geo_entity_type,
                   ARRAY[lower(c.hostname)]::text[], ARRAY[lower(c.hostname)]::text[],
                   'candidate'::geo_entity_status
              FROM geo_citations c
              JOIN geo_observations o ON o.id = c.observation_id
              JOIN geo_runs r ON r.id = o.run_id
             WHERE r.status = 'success'
               AND c.is_owned = false
               AND c.category = 'competitor'
             GROUP BY lower(c.hostname)
            HAVING count(DISTINCT r.id) >= 2
            ON CONFLICT (canonical_name) DO NOTHING
          `);
        }
        return row;
      });
    },

    async recordCrawlerChecks(input: readonly GeoCrawlerCheckInput[]) {
      if (!input.length) return 0;
      return db.transaction(async (tx) => {
        for (const check of input) {
          await tx.insert(geoCrawlerChecks).values(check).onConflictDoUpdate({
            target: [geoCrawlerChecks.checkDate, geoCrawlerChecks.target, geoCrawlerChecks.bot],
            set: {
              status: check.status,
              reasonCode: check.reasonCode ?? null,
              httpStatus: check.httpStatus ?? null,
              checkedAt: check.checkedAt ?? new Date(),
              metadata: check.metadata,
            },
          });
        }
        return input.length;
      });
    },

    async upsertGeoReferrals(rows: readonly NormalizedGeoReferral[]) {
      if (!rows.length) return 0;
      return db.transaction(async (tx) => {
        for (const row of rows) {
          await tx.insert(geoReferralDailyMetrics).values(row).onConflictDoUpdate({
            target: [
              geoReferralDailyMetrics.observationDate,
              geoReferralDailyMetrics.platform,
              geoReferralDailyMetrics.landingPath,
            ],
            set: {
              users: row.users,
              newUsers: row.newUsers,
              visits: row.visits,
              pageviews: row.pageviews,
              importedAt: new Date(),
            },
          });
        }
        return rows.length;
      });
    },

    async getOverview(filters: GeoReadFilters) {
      const latestRunFields = { platform: geoRuns.platform, status: geoRuns.status, startedAt: geoRuns.startedAt,
        completedAt: geoRuns.completedAt, errorCode: geoRuns.errorCode };
      const promptScopeRequested = Boolean(filters.topicId || filters.promptIds?.length);
      const promptScopeConditions = [];
      if (filters.topicId) promptScopeConditions.push(eq(geoPrompts.topicId, filters.topicId));
      if (filters.promptIds?.length) promptScopeConditions.push(inArray(geoPrompts.id, filters.promptIds));
      const scopedPrompts = promptScopeRequested ? await db.select({
        id: geoPrompts.id,
        targetPath: geoPrompts.targetPath,
      }).from(geoPrompts).where(and(...promptScopeConditions)) : [];
      const scopedPromptIds = scopedPrompts.map((prompt) => prompt.id);
      const scopedPaths = [...new Set(scopedPrompts.map((prompt) => prompt.targetPath).filter((path): path is string => Boolean(path)))];
      const latestConditions = runDimensionConditions(filters);
      if (promptScopeRequested && scopedPromptIds.length) latestConditions.push(arrayOverlaps(geoRuns.promptIds, scopedPromptIds));
      const latestRuns = promptScopeRequested && !scopedPromptIds.length ? [] : await db.select(latestRunFields)
        .from(geoRuns).where(and(...latestConditions)).orderBy(desc(geoRuns.startedAt));
      const crawlerConditions = [
        gte(geoCrawlerChecks.checkDate, filters.from), lte(geoCrawlerChecks.checkDate, filters.to),
      ];
      const referralConditions = [
        gte(geoReferralDailyMetrics.observationDate, filters.from),
        lte(geoReferralDailyMetrics.observationDate, filters.to),
      ];
      if (promptScopeRequested && scopedPaths.length) {
        crawlerConditions.push(inArray(geoCrawlerChecks.target, scopedPaths));
        referralConditions.push(inArray(geoReferralDailyMetrics.landingPath, scopedPaths));
      }
      if (filters.platform) referralConditions.push(eq(geoReferralDailyMetrics.platform, filters.platform));
      const [analyticsRows, catalog, crawler, referrals] = await Promise.all([
        readAnalyticsRows(db, filters),
        db.select({ id: geoPrompts.id, category: geoPrompts.category, language: geoPrompts.language,
          region: geoPrompts.region, topicId: geoPrompts.topicId }).from(geoPrompts).where(eq(geoPrompts.status, "active")),
        db.select({
          lastCheckedAt: sql<Date | null>`max(${geoCrawlerChecks.checkedAt})`,
          checks: sql<number>`count(*)::int`,
          passed: sql<number>`count(*) FILTER (WHERE ${geoCrawlerChecks.status} = 'pass')::int`,
          failed: sql<number>`count(*) FILTER (WHERE ${geoCrawlerChecks.status} = 'fail')::int`,
        }).from(geoCrawlerChecks).where(promptScopeRequested && !scopedPaths.length ? sql`false` : and(...crawlerConditions)),
        db.select({ lastImportedAt: sql<Date | null>`max(${geoReferralDailyMetrics.importedAt})` })
          .from(geoReferralDailyMetrics)
          .where(promptScopeRequested && !scopedPaths.length ? sql`false` : and(...referralConditions)),
      ]);
      const latestByPlatform = new Map<
        GeoPlatform,
        (typeof latestRuns)[number]
      >();
      for (const run of latestRuns) if (!latestByPlatform.has(run.platform)) latestByPlatform.set(run.platform, run);
      return {
        dimensions: {
          platform: filters.platform ?? null,
          surface: filters.surface ?? null,
          sessionPersonalized: filters.sessionPersonalized ?? null,
          mode: filters.mode ?? null,
          language: filters.language ?? null,
          region: filters.region ?? null,
          topicId: filters.topicId ?? null,
        },
        period: { from: filters.from, to: filters.to },
        ...summarizeGeoObservations(analyticsRows, filters),
        control: summarizeGeoControl({ rows: analyticsRows, prompts: catalog, platforms: GEO_PLATFORMS, filters }),
        freshness: {
          platforms: (filters.platform ? [filters.platform] : GEO_PLATFORMS)
            .map((platform) => ({ platform, run: latestByPlatform.get(platform) ?? null })),
          crawler: crawler[0] ?? { lastCheckedAt: null, checks: 0, passed: 0, failed: 0 },
          referrals: referrals[0] ?? { lastImportedAt: null },
        },
      };
    },

    async listTopics(input: { status?: GeoPromptStatus } & GeoPage) {
      const items = await db.select().from(geoTopics)
        .where(input.status ? eq(geoTopics.status, input.status) : undefined)
        .orderBy(desc(geoTopics.priority), asc(geoTopics.name))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listEntities(input: { status?: GeoEntityStatus; type?: "owned" | "competitor" } & GeoPage) {
      const conditions = [];
      if (input.status) conditions.push(eq(geoEntities.status, input.status));
      if (input.type) conditions.push(eq(geoEntities.type, input.type));
      const items = await db.select().from(geoEntities).where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(geoEntities.type), asc(geoEntities.canonicalName))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listPrompts(input: {
      status?: GeoPromptStatus; category?: GeoPromptCategory; topicId?: string; language?: string; region?: string;
    } & GeoPage) {
      const conditions = [];
      if (input.status) conditions.push(eq(geoPrompts.status, input.status));
      if (input.category) conditions.push(eq(geoPrompts.category, input.category));
      if (input.topicId) conditions.push(eq(geoPrompts.topicId, input.topicId));
      if (input.language) conditions.push(eq(geoPrompts.language, input.language));
      if (input.region) conditions.push(eq(geoPrompts.region, input.region));
      const items = await db.select().from(geoPrompts).where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(geoPrompts.priority), asc(geoPrompts.promptText))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listObservations(input: GeoReadFilters & { promptId?: string } & GeoPage) {
      const conditions = [runConditions(input)];
      if (input.promptId) conditions.push(eq(geoObservations.promptId, input.promptId));
      const items = await db.select({
        id: geoObservations.id,
        runId: geoObservations.runId,
        promptId: geoObservations.promptId,
        repetition: geoObservations.repetition,
        observedAt: geoObservations.observedAt,
        mentioned: geoObservations.mentioned,
        linked: geoObservations.linked,
        cited: geoObservations.cited,
        sourceOrder: geoObservations.sourceOrder,
        responseExcerpt: geoObservations.responseExcerpt,
        snapshotTruncated: geoObservations.snapshotTruncated,
        responseHash: geoObservations.responseHash,
        modelName: geoObservations.modelName,
        sourceCount: geoObservations.sourceCount,
        sessionPersonalized: geoObservations.sessionPersonalized,
        platform: geoRuns.platform,
        mode: geoRuns.mode,
        language: geoRuns.language,
        region: geoRuns.region,
        runStatus: geoRuns.status,
        promptSetFingerprint: geoRuns.promptSetFingerprint,
        topicId: geoPrompts.topicId,
      }).from(geoObservations)
        .innerJoin(geoRuns, eq(geoRuns.id, geoObservations.runId))
        .innerJoin(geoPrompts, eq(geoPrompts.id, geoObservations.promptId))
        .where(and(...conditions)).orderBy(desc(geoObservations.observedAt), desc(geoObservations.id))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async getObservationEvidence(id: string) {
      const [observation] = await db.select().from(geoObservations).where(eq(geoObservations.id, id)).limit(1);
      if (!observation) throw new Error("geo_observation_not_found");
      const [mentions, citations, fanoutQueries] = await Promise.all([
        db.select({
          entityId: geoObservationMentions.entityId,
          canonicalName: geoEntities.canonicalName,
          type: geoEntities.type,
          status: geoEntities.status,
          firstMentionOrder: geoObservationMentions.firstMentionOrder,
          recommended: geoObservationMentions.recommended,
          sentiment: geoObservationMentions.sentiment,
        }).from(geoObservationMentions).innerJoin(geoEntities, eq(geoEntities.id, geoObservationMentions.entityId))
          .where(eq(geoObservationMentions.observationId, id)).orderBy(asc(geoObservationMentions.firstMentionOrder)),
        db.select().from(geoCitations).where(eq(geoCitations.observationId, id)).orderBy(asc(geoCitations.sourceOrder)),
        db.select().from(geoFanoutQueries).where(eq(geoFanoutQueries.observationId, id)).orderBy(asc(geoFanoutQueries.position)),
      ]);
      return { observation, mentions, citations, fanoutQueries };
    },

    async listCitations(input: GeoReadFilters & { owned?: boolean; hostname?: string; promptId?: string } & GeoPage) {
      const conditions = [runConditions(input)];
      if (input.owned !== undefined) conditions.push(eq(geoCitations.isOwned, input.owned));
      if (input.hostname) conditions.push(eq(geoCitations.hostname, input.hostname));
      if (input.promptId) conditions.push(eq(geoObservations.promptId, input.promptId));
      const items = await db.select({
        id: geoCitations.id,
        observationId: geoCitations.observationId,
        promptId: geoObservations.promptId,
        url: geoCitations.url,
        hostname: geoCitations.hostname,
        title: geoCitations.title,
        sourceOrder: geoCitations.sourceOrder,
        isOwned: geoCitations.isOwned,
        category: geoCitations.category,
        localPath: geoCitations.localPath,
        createdAt: geoCitations.createdAt,
        platform: geoRuns.platform,
        mode: geoRuns.mode,
        language: geoRuns.language,
        region: geoRuns.region,
      }).from(geoCitations)
        .innerJoin(geoObservations, eq(geoObservations.id, geoCitations.observationId))
        .innerJoin(geoRuns, eq(geoRuns.id, geoObservations.runId))
        .innerJoin(geoPrompts, eq(geoPrompts.id, geoObservations.promptId))
        .where(and(...conditions)).orderBy(desc(geoCitations.createdAt), asc(geoCitations.sourceOrder))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listFanoutQueries(input: GeoReadFilters & { promptId?: string } & GeoPage) {
      const conditions = [runConditions(input)];
      if (input.promptId) conditions.push(eq(geoObservations.promptId, input.promptId));
      const items = await db.select({
        observationId: geoFanoutQueries.observationId,
        promptId: geoObservations.promptId,
        position: geoFanoutQueries.position,
        queryText: geoFanoutQueries.queryText,
        source: geoFanoutQueries.source,
        platform: geoRuns.platform,
        mode: geoRuns.mode,
        language: geoRuns.language,
        region: geoRuns.region,
      }).from(geoFanoutQueries)
        .innerJoin(geoObservations, eq(geoObservations.id, geoFanoutQueries.observationId))
        .innerJoin(geoRuns, eq(geoRuns.id, geoObservations.runId))
        .innerJoin(geoPrompts, eq(geoPrompts.id, geoObservations.promptId))
        .where(and(...conditions)).orderBy(desc(geoObservations.observedAt), asc(geoFanoutQueries.position))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listReferrals(input: { from: string; to: string; platform?: GeoPlatform } & GeoPage) {
      const conditions = [
        gte(geoReferralDailyMetrics.observationDate, input.from),
        lte(geoReferralDailyMetrics.observationDate, input.to),
      ];
      if (input.platform) conditions.push(eq(geoReferralDailyMetrics.platform, input.platform));
      const items = await db.select().from(geoReferralDailyMetrics).where(and(...conditions))
        .orderBy(desc(geoReferralDailyMetrics.observationDate), desc(geoReferralDailyMetrics.visits))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listCrawlerChecks(input: { from: string; to: string; status?: "pass" | "fail" | "unavailable";
      bot?: string; target?: string } & GeoPage) {
      const conditions = [
        gte(geoCrawlerChecks.checkDate, input.from),
        lte(geoCrawlerChecks.checkDate, input.to),
      ];
      if (input.status) conditions.push(eq(geoCrawlerChecks.status, input.status));
      if (input.bot) conditions.push(eq(geoCrawlerChecks.bot, input.bot));
      if (input.target) conditions.push(eq(geoCrawlerChecks.target, input.target));
      const items = await db.select().from(geoCrawlerChecks).where(and(...conditions))
        .orderBy(desc(geoCrawlerChecks.checkDate), asc(geoCrawlerChecks.target), asc(geoCrawlerChecks.bot))
        .limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async listExperiments(input: { status?: typeof geoExperiments.$inferSelect.status; pagePath?: string } & GeoPage) {
      const conditions = [];
      if (input.status) conditions.push(eq(geoExperiments.status, input.status));
      if (input.pagePath) conditions.push(eq(geoExperiments.pagePath, input.pagePath));
      const items = await db.select().from(geoExperiments).where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(geoExperiments.createdAt)).limit(input.limit).offset(Number(input.cursor ?? "0"));
      return paged(items, input);
    },

    async createExperimentCandidate(
      input: GeoExperimentCandidateInput,
      actor: GeoActor,
    ) {
      return db.transaction(async (tx) => {
        const [recommendation] = await tx.select().from(seoRecommendations)
          .where(eq(seoRecommendations.id, input.recommendationId)).limit(1);
        if (
          !recommendation || !recommendation.issueType.startsWith("geo_")
          || recommendation.pagePath !== input.pagePath
          || ["rejected", "dismissed"].includes(recommendation.status)
          || (actor.mcpTokenId && recommendation.createdByMcpTokenId !== actor.mcpTokenId) ||
          !(await recommendationHasEvidence(tx as unknown as GeoDatabase, recommendation.evidence, input))
        ) {
          throw new Error("geo_experiment_recommendation_invalid");
        }
        const prompts = await tx.select({ id: geoPrompts.id, promptText: geoPrompts.promptText })
          .from(geoPrompts).where(and(inArray(geoPrompts.id, input.promptIds), eq(geoPrompts.status, "active")));
        if (prompts.length !== input.promptIds.length) throw new Error("geo_experiment_prompt_set_invalid");
        const { promptIds, minimumDelta, ...values } = input;
        const [experiment] = await tx.insert(geoExperiments).values({
          ...values,
          minimumDelta: minimumDelta.toFixed(6),
          status: "proposed",
          createdByMcpTokenId: actor.mcpTokenId ?? null,
        }).returning();
        if (!experiment) throw new Error("geo_experiment_not_created");
        await tx.insert(geoExperimentPrompts).values(prompts.map((prompt) => ({
          experimentId: experiment.id,
          promptId: prompt.id,
          promptTextSnapshot: prompt.promptText,
        })));
        return experiment;
      });
    },

    async approveExperiment(input: { id: string }, actor: GeoActor) {
      const [row] = await db.update(geoExperiments).set({
        status: "approved",
        approvedByAdminUserId: actor.adminUserId ?? null,
        updatedAt: new Date(),
      }).where(and(eq(geoExperiments.id, input.id), eq(geoExperiments.status, "proposed"))).returning();
      if (!row) throw new Error("geo_experiment_state_invalid");
      return row;
    },

    async linkExperimentChange(input: { id: string; seoChangeId: string }, _actor: GeoActor) {
      return db.transaction(async (tx) => {
        const [experiment] = await tx.select().from(geoExperiments)
          .where(eq(geoExperiments.id, input.id)).for("update").limit(1);
        if (!experiment || experiment.status !== "approved") throw new Error("geo_experiment_state_invalid");
        const [change] = await tx.select().from(seoChanges).where(eq(seoChanges.id, input.seoChangeId)).limit(1);
        if (!change || change.pagePath !== experiment.pagePath) throw new Error("geo_experiment_change_invalid");
        const prompts = await tx.select({ id: geoExperimentPrompts.promptId }).from(geoExperimentPrompts)
          .where(eq(geoExperimentPrompts.experimentId, experiment.id));
        const baselineTo = shiftDate(change.appliedAt, -1);
        const baselineFrom = shiftDate(change.appliedAt, -28);
        const metric = await readExperimentMetric(tx as unknown as GeoDatabase, {
          from: utcDate(baselineFrom), to: utcDate(baselineTo), platform: experiment.platform,
          mode: experiment.mode, language: experiment.language, region: experiment.region,
          promptSetFingerprint: experiment.promptSetFingerprint, promptIds: prompts.map((prompt) => prompt.id),
          metric: experiment.primaryMetric,
          pagePath: experiment.pagePath,
        });
        const baseline = {
          ...metric,
          unit: experiment.primaryMetric === "ai_referrals" ? "visits" : "ratio",
          period: { from: utcDate(baselineFrom), to: utcDate(baselineTo) },
          dimensions: { platform: experiment.platform, mode: experiment.mode, language: experiment.language,
            region: experiment.region, promptSetFingerprint: experiment.promptSetFingerprint },
        };
        const [row] = await tx.update(geoExperiments).set({
          status: "active",
          seoChangeId: change.id,
          implementedAt: change.appliedAt,
          baseline,
          updatedAt: new Date(),
        }).where(eq(geoExperiments.id, experiment.id)).returning();
        if (!row) throw new Error("geo_experiment_not_found");
        return row;
      });
    },

    async evaluateExperiment(input: { id: string; milestone: ExperimentMilestone; evaluatedAt: Date }, _actor: GeoActor) {
      return db.transaction(async (tx) => {
        const [experiment] = await tx.select().from(geoExperiments)
          .where(eq(geoExperiments.id, input.id)).for("update").limit(1);
        if (!experiment || !experiment.implementedAt || experiment.status !== "active") {
          throw new Error("geo_experiment_state_invalid");
        }
        const previousResults = evidenceRecord(experiment.evaluationResults) ?? {};
        const key = String(input.milestone);
        if (key in previousResults || (input.milestone === 14 && !("7" in previousResults))
          || (input.milestone === 28 && (!("7" in previousResults) || !("14" in previousResults)))) {
          throw new Error("geo_experiment_milestone_order_invalid");
        }
        const from = shiftDate(experiment.implementedAt, 1);
        const to = shiftDate(experiment.implementedAt, input.milestone);
        const availableAt = shiftDate(experiment.implementedAt, input.milestone + 1);
        if (input.evaluatedAt < availableAt) throw new Error("geo_experiment_period_incomplete");
        const prompts = await tx.select({ id: geoExperimentPrompts.promptId }).from(geoExperimentPrompts)
          .where(eq(geoExperimentPrompts.experimentId, experiment.id));
        const resultMetric = await readExperimentMetric(tx as unknown as GeoDatabase, {
          from: utcDate(from), to: utcDate(to), platform: experiment.platform, mode: experiment.mode,
          language: experiment.language, region: experiment.region,
          promptSetFingerprint: experiment.promptSetFingerprint, promptIds: prompts.map((prompt) => prompt.id),
          metric: experiment.primaryMetric,
          pagePath: experiment.pagePath,
        });
        const baseline = experiment.baseline as { value?: number | null; sample?: number; complete?: boolean };
        const changes = await tx.select({ id: seoChanges.id }).from(seoChanges).where(and(
          eq(seoChanges.pagePath, experiment.pagePath),
          gte(seoChanges.appliedAt, experiment.implementedAt),
          lte(seoChanges.appliedAt, to),
          experiment.seoChangeId ? ne(seoChanges.id, experiment.seoChangeId) : undefined,
        ));
        const evaluation = evaluateExperimentMetric({
          milestone: input.milestone,
          baseline: typeof baseline.value === "number" ? baseline.value : null,
          result: resultMetric.value,
          direction: experiment.direction,
          minimumDelta: Number(experiment.minimumDelta),
          baselineSample: baseline.sample ?? 0,
          resultSample: resultMetric.sample,
          complete: baseline.complete === true && resultMetric.complete,
          confoundingChanges: changes.map((change) => change.id),
        });
        const evaluationResults = { ...previousResults, [key]: {
          ...evaluation,
          evaluatedAt: input.evaluatedAt.toISOString(),
          period: { from: utcDate(from), to: utcDate(to) },
          dimensions: { platform: experiment.platform, mode: experiment.mode, language: experiment.language,
            region: experiment.region, promptSetFingerprint: experiment.promptSetFingerprint },
        } };
        const [row] = await tx.update(geoExperiments).set({
          evaluationResults,
          verdict: evaluation.verdict,
          ...(input.milestone === 28 ? { status: "completed" as const } : {}),
          updatedAt: new Date(),
        }).where(eq(geoExperiments.id, experiment.id)).returning();
        if (!row) throw new Error("geo_experiment_not_found");
        return { experiment: row, evaluation };
      });
    },
  };
}

export type GeoRepository = ReturnType<typeof createGeoRepository>;
