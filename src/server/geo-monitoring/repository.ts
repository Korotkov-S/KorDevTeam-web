import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  geoCitations,
  geoCrawlerChecks,
  geoEntities,
  geoFanoutQueries,
  geoObservationMentions,
  geoObservations,
  geoPrompts,
  geoReferralDailyMetrics,
  geoRuns,
  geoTopics,
  seoQueries,
} from "../db/schema";
import { normalizeSeoQuery } from "../seo-monitoring/normalization";
import type {
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

export type GeoDatabase = ReturnType<typeof createDb>;

export type GeoStartRunInput = {
  platform: GeoPlatform;
  surface: string;
  mode: GeoRunMode;
  region: string;
  language: string;
  plannedCount: number;
  promptSetFingerprint: string;
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
  mode?: GeoRunMode;
  language?: string;
  region?: string;
  topicId?: string;
};

export type GeoPage = { limit: number; cursor: string | null };

function runConditions(filters: GeoReadFilters) {
  const conditions = [
    gte(geoRuns.startedAt, new Date(`${filters.from}T00:00:00.000Z`)),
    lte(geoRuns.startedAt, new Date(`${filters.to}T23:59:59.999Z`)),
  ];
  if (filters.platform) conditions.push(eq(geoRuns.platform, filters.platform));
  if (filters.mode) conditions.push(eq(geoRuns.mode, filters.mode));
  if (filters.language) conditions.push(eq(geoRuns.language, filters.language));
  if (filters.region) conditions.push(eq(geoRuns.region, filters.region));
  if (filters.topicId) conditions.push(eq(geoPrompts.topicId, filters.topicId));
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

export function createGeoRepository(db: GeoDatabase) {
  return {
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
      const [row] = await db.insert(geoRuns).values({
        ...input,
        initiatedByMcpTokenId: tokenId,
        status: "running",
      }).returning();
      if (!row) throw new Error("geo_run_not_started");
      return row;
    },

    async recordObservation(runId: string, tokenId: string, input: StoredGeoObservationInput) {
      return db.transaction(async (tx) => {
        const [run] = await tx.select().from(geoRuns).where(eq(geoRuns.id, runId)).for("update").limit(1);
        assertOwnedRun(run, tokenId);
        const [existing] = await tx.select().from(geoObservations).where(and(
          eq(geoObservations.runId, runId),
          eq(geoObservations.promptId, input.promptId),
          eq(geoObservations.repetition, input.repetition),
        )).limit(1);
        if (existing) return existing;

        const { mentions, citations, fanoutQueries, ...observation } = input;
        const [row] = await tx.insert(geoObservations).values({ ...observation, runId }).returning();
        if (!row) throw new Error("geo_observation_not_stored");
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
        const [run] = await tx.select().from(geoRuns).where(eq(geoRuns.id, runId)).for("update").limit(1);
        const ownedRun = assertOwnedRun(run, tokenId);
        const counted = await tx.select({ count: sql<number>`count(*)::int` }).from(geoObservations)
          .where(eq(geoObservations.runId, runId));
        const stored = counted[0]?.count ?? 0;
        if (input.storedCount !== stored || input.completedCount < stored || input.completedCount > ownedRun.plannedCount) {
          throw new Error("geo_run_counts_mismatch");
        }
        const [row] = await tx.update(geoRuns).set({
          ...input,
          completedAt: new Date(),
        }).where(eq(geoRuns.id, runId)).returning();
        if (!row) throw new Error("geo_run_not_found");
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

    async getOverview(filters: GeoReadFilters) {
      const rows = await db.select({
        runId: geoRuns.id,
        runStatus: geoRuns.status,
        platform: geoRuns.platform,
        mode: geoRuns.mode,
        language: geoRuns.language,
        region: geoRuns.region,
        promptSetFingerprint: geoRuns.promptSetFingerprint,
        promptId: geoObservations.promptId,
        topicId: geoPrompts.topicId,
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
        .where(runConditions(filters));
      return {
        dimensions: {
          platform: filters.platform ?? null,
          mode: filters.mode ?? null,
          language: filters.language ?? null,
          region: filters.region ?? null,
          topicId: filters.topicId ?? null,
        },
        period: { from: filters.from, to: filters.to },
        ...summarizeGeoObservations(rows),
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
  };
}

export type GeoRepository = ReturnType<typeof createGeoRepository>;
