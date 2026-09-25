import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  seoChanges,
  seoCollectionRuns,
  seoDailyMetrics,
  seoQueries,
  seoRecommendations,
  seoRegions,
  seoSources,
} from "../db/schema";
import type { NormalizedSeoObservation, SeoDevice, SeoSourceId } from "./contracts";

export type SeoDatabase = ReturnType<typeof createDb>;
type Transaction = Parameters<Parameters<SeoDatabase["transaction"]>[0]>[0];
type FrequencyBand = typeof seoQueries.$inferSelect.frequencyBand;
type RecommendationStatus = typeof seoRecommendations.$inferSelect.status;
type RecommendationCommand = Omit<typeof seoRecommendations.$inferInsert, "id" | "status" | "createdAt" | "updatedAt">;

export type SeoMetricFilters = {
  dateFrom: string;
  dateTo: string;
  source?: SeoSourceId;
  regionId?: string;
  device?: SeoDevice;
  frequencyBand?: FrequencyBand;
  pagePath?: string;
};

const activeRecommendationStatuses: RecommendationStatus[] = ["new", "accepted"];
const recommendationTransitions: Record<RecommendationStatus, RecommendationStatus[]> = {
  new: ["accepted", "rejected", "dismissed"],
  accepted: ["implemented", "dismissed"],
  rejected: [],
  implemented: [],
  dismissed: [],
};

function cursorOffset(cursor: string | null): number {
  if (cursor === null) return 0;
  if (!/^(?:0|[1-9]\d*)$/u.test(cursor)) throw new Error("seo_cursor_invalid");
  const value = Number(cursor);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("seo_cursor_invalid");
  return value;
}

function whereFilters(filters: SeoMetricFilters) {
  const conditions = [
    gte(seoDailyMetrics.observationDate, filters.dateFrom),
    lte(seoDailyMetrics.observationDate, filters.dateTo),
  ];
  if (filters.source) conditions.push(eq(seoDailyMetrics.source, filters.source));
  if (filters.regionId) conditions.push(eq(seoDailyMetrics.regionId, filters.regionId));
  if (filters.device) conditions.push(eq(seoDailyMetrics.device, filters.device));
  if (filters.frequencyBand) conditions.push(eq(seoQueries.frequencyBand, filters.frequencyBand));
  if (filters.pagePath) conditions.push(eq(seoDailyMetrics.pagePath, filters.pagePath));
  return and(...conditions);
}

async function regionFor(tx: Transaction, observation: NormalizedSeoObservation) {
  const [region] = await tx.select({ id: seoRegions.id }).from(seoRegions).where(and(
    eq(seoRegions.source, observation.source),
    eq(seoRegions.externalId, observation.regionExternalId),
    eq(seoRegions.active, true),
  )).limit(1);
  if (!region) throw new Error("seo_region_not_available");
  return region;
}

export function createSeoRepository(db: SeoDatabase) {
  return {
    async setSourceEnabled(source: SeoSourceId, enabled: boolean) {
      const [row] = await db.update(seoSources).set({ enabled, updatedAt: new Date() })
        .where(eq(seoSources.id, source)).returning();
      if (!row) throw new Error("seo_source_not_found");
      return row;
    },

    async syncYandexRegions(regions: readonly { id: number; name: string }[]) {
      const byName = new Map(regions.map((region) => [region.name.trim().toLocaleLowerCase("ru-RU"), String(region.id)]));
      return db.transaction(async (tx) => {
        const desired = await tx.select().from(seoRegions).where(eq(seoRegions.source, "yandex_webmaster"));
        await tx.update(seoRegions).set({ externalId: null, updatedAt: new Date() })
          .where(eq(seoRegions.source, "yandex_webmaster"));
        for (const region of desired) {
          const externalId = byName.get(region.displayName.trim().toLocaleLowerCase("ru-RU"));
          if (externalId) {
            await tx.update(seoRegions).set({ externalId, updatedAt: new Date() }).where(eq(seoRegions.id, region.id));
          }
        }
        return tx.select().from(seoRegions).where(eq(seoRegions.source, "yandex_webmaster")).orderBy(asc(seoRegions.sortOrder));
      });
    },

    async withSourceLock<T>(source: SeoSourceId, operation: () => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        const result = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${'seo-collector:' + source})) as acquired`);
        if (result.rows[0]?.acquired !== true) throw new Error("seo_source_locked");
        return operation();
      });
    },

    async startRun(source: SeoSourceId, requestedFrom: string, requestedTo: string) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [run] = await tx.insert(seoCollectionRuns).values({ source, requestedFrom, requestedTo, startedAt: now }).returning();
        await tx.update(seoSources).set({ lastAttemptAt: now, lastErrorCode: null, updatedAt: now })
          .where(eq(seoSources.id, source));
        return run;
      });
    },

    async finishRun(
      id: string,
      status: Exclude<typeof seoCollectionRuns.$inferSelect.status, "running">,
      result: { receivedCount: number; storedCount: number; errorCode?: string; metadata?: Record<string, unknown> },
    ) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [run] = await tx.update(seoCollectionRuns).set({
          status,
          completedAt: now,
          receivedCount: result.receivedCount,
          storedCount: result.storedCount,
          errorCode: result.errorCode ?? null,
          metadata: result.metadata ?? {},
        }).where(eq(seoCollectionRuns.id, id)).returning();
        if (!run) throw new Error("seo_run_not_found");
        await tx.update(seoSources).set({
          ...(status === "success" ? { lastSuccessAt: now } : {}),
          lastErrorCode: result.errorCode ?? null,
          updatedAt: now,
        }).where(eq(seoSources.id, run.source));
        return run;
      });
    },

    async upsertObservations(observations: readonly NormalizedSeoObservation[]): Promise<number> {
      if (observations.length === 0) return 0;
      return db.transaction(async (tx) => {
        let stored = 0;
        for (const observation of observations) {
          const now = new Date();
          const [query] = await tx.insert(seoQueries).values({
            queryText: observation.queryText,
            normalizedQuery: observation.normalizedQuery,
            origin: "api",
          }).onConflictDoUpdate({
            target: seoQueries.normalizedQuery,
            set: { queryText: observation.queryText, updatedAt: now },
          }).returning();
          const region = await regionFor(tx, observation);
          await tx.insert(seoDailyMetrics).values({
            observationDate: observation.observationDate,
            source: observation.source,
            queryId: query.id,
            pagePath: observation.pagePath,
            regionId: region.id,
            device: observation.device,
            impressions: observation.impressions,
            clicks: observation.clicks,
            ctr: observation.ctr.toFixed(8),
            averagePosition: observation.averagePosition.toFixed(4),
            importedAt: now,
          }).onConflictDoUpdate({
            target: [
              seoDailyMetrics.observationDate,
              seoDailyMetrics.source,
              seoDailyMetrics.queryId,
              seoDailyMetrics.pagePath,
              seoDailyMetrics.regionId,
              seoDailyMetrics.device,
            ],
            set: {
              impressions: observation.impressions,
              clicks: observation.clicks,
              ctr: observation.ctr.toFixed(8),
              averagePosition: observation.averagePosition.toFixed(4),
              importedAt: now,
            },
          });
          stored++;
        }
        return stored;
      });
    },

    async listQueries(filters: SeoMetricFilters, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const rows = await db.select({
        id: seoQueries.id,
        queryText: seoQueries.queryText,
        normalizedQuery: seoQueries.normalizedQuery,
        targetPath: seoQueries.targetPath,
        frequencyBand: seoQueries.frequencyBand,
        impressions: sql<number>`sum(${seoDailyMetrics.impressions})::double precision`,
        clicks: sql<number>`sum(${seoDailyMetrics.clicks})::double precision`,
        ctr: sql<number | null>`sum(${seoDailyMetrics.clicks})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
        averagePosition: sql<number | null>`sum(${seoDailyMetrics.impressions} * ${seoDailyMetrics.averagePosition})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
      }).from(seoDailyMetrics)
        .innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId))
        .where(whereFilters(filters))
        .groupBy(seoQueries.id)
        .orderBy(desc(sql`sum(${seoDailyMetrics.impressions})`), asc(seoQueries.id))
        .limit(page.limit + 1)
        .offset(offset);
      const hasNext = rows.length > page.limit;
      return {
        items: rows.slice(0, page.limit),
        nextCursor: hasNext ? String(offset + page.limit) : null,
      };
    },

    async getOverview(filters: SeoMetricFilters) {
      const [overview] = await db.select({
        impressions: sql<number>`coalesce(sum(${seoDailyMetrics.impressions}), 0)::double precision`,
        clicks: sql<number>`coalesce(sum(${seoDailyMetrics.clicks}), 0)::double precision`,
        ctr: sql<number | null>`sum(${seoDailyMetrics.clicks})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
        averagePosition: sql<number | null>`sum(${seoDailyMetrics.impressions} * ${seoDailyMetrics.averagePosition})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId))
        .where(whereFilters(filters));
      return overview;
    },

    async getDashboard(filters: SeoMetricFilters) {
      const condition = whereFilters(filters);
      const overviewRows = await db.select({
        impressions: sql<number>`coalesce(sum(${seoDailyMetrics.impressions}), 0)::double precision`,
        clicks: sql<number>`coalesce(sum(${seoDailyMetrics.clicks}), 0)::double precision`,
        ctr: sql<number | null>`sum(${seoDailyMetrics.clicks})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
        averagePosition: sql<number | null>`sum(${seoDailyMetrics.impressions} * ${seoDailyMetrics.averagePosition})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId)).where(condition);
      const daily = await db.select({
        date: seoDailyMetrics.observationDate,
        impressions: sql<number>`sum(${seoDailyMetrics.impressions})::double precision`,
        clicks: sql<number>`sum(${seoDailyMetrics.clicks})::double precision`,
        ctr: sql<number | null>`sum(${seoDailyMetrics.clicks})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
        averagePosition: sql<number | null>`sum(${seoDailyMetrics.impressions} * ${seoDailyMetrics.averagePosition})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId)).where(condition)
        .groupBy(seoDailyMetrics.observationDate).orderBy(asc(seoDailyMetrics.observationDate));
      const devices = await db.select({
        key: seoDailyMetrics.device,
        impressions: sql<number>`sum(${seoDailyMetrics.impressions})::double precision`,
        clicks: sql<number>`sum(${seoDailyMetrics.clicks})::double precision`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId)).where(condition)
        .groupBy(seoDailyMetrics.device).orderBy(asc(seoDailyMetrics.device));
      const regions = await db.select({
        key: seoRegions.code,
        label: seoRegions.displayName,
        impressions: sql<number>`sum(${seoDailyMetrics.impressions})::double precision`,
        clicks: sql<number>`sum(${seoDailyMetrics.clicks})::double precision`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId))
        .innerJoin(seoRegions, and(eq(seoRegions.id, seoDailyMetrics.regionId), eq(seoRegions.source, seoDailyMetrics.source)))
        .where(condition).groupBy(seoRegions.code, seoRegions.displayName, seoRegions.sortOrder).orderBy(asc(seoRegions.sortOrder));
      const frequencies = await db.select({
        key: seoQueries.frequencyBand,
        impressions: sql<number>`sum(${seoDailyMetrics.impressions})::double precision`,
        clicks: sql<number>`sum(${seoDailyMetrics.clicks})::double precision`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId)).where(condition)
        .groupBy(seoQueries.frequencyBand).orderBy(asc(seoQueries.frequencyBand));
      const bucket = sql<string>`case
        when ${seoDailyMetrics.averagePosition} <= 3 then '1–3'
        when ${seoDailyMetrics.averagePosition} <= 10 then '4–10'
        when ${seoDailyMetrics.averagePosition} <= 30 then '11–30'
        when ${seoDailyMetrics.averagePosition} <= 50 then '31–50'
        else '>50' end`;
      const positionBuckets = await db.select({
        bucket,
        count: sql<number>`count(distinct ${seoDailyMetrics.queryId})::integer`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId)).where(condition)
        .groupBy(bucket);
      const sourceRows = await db.select().from(seoSources).orderBy(asc(seoSources.displayName));
      const sources = await Promise.all(sourceRows.map(async (source) => {
        const [latest] = await db.select({ latestDataDate: sql<string | null>`max(${seoDailyMetrics.observationDate})` })
          .from(seoDailyMetrics).where(eq(seoDailyMetrics.source, source.id));
        return { ...source, latestDataDate: latest?.latestDataDate ?? null };
      }));
      const availableRegions = await db.select().from(seoRegions).where(eq(seoRegions.active, true)).orderBy(asc(seoRegions.sortOrder));
      const deviceLabels = { desktop: "Компьютеры", mobile: "Смартфоны", tablet: "Планшеты", all: "Все устройства" } as const;
      const frequencyLabels = { high: "ВЧ", medium: "СЧ", low: "НЧ", unclassified: "Не классифицировано" } as const;
      const order = new Map([["1–3", 1], ["4–10", 2], ["11–30", 3], ["31–50", 4], [">50", 5]]);
      return {
        overview: overviewRows[0],
        daily,
        positionBuckets: positionBuckets.sort((a, b) => (order.get(a.bucket) ?? 99) - (order.get(b.bucket) ?? 99)),
        devices: devices.map((row) => ({ ...row, label: deviceLabels[row.key] })),
        regions,
        frequencies: frequencies.map((row) => ({ ...row, label: frequencyLabels[row.key] })),
        sources,
        availableRegions,
      };
    },

    async saveQueryTarget(queryId: string, targetPath: string | null) {
      const [query] = await db.update(seoQueries).set({ targetPath, updatedAt: new Date() })
        .where(eq(seoQueries.id, queryId)).returning();
      if (!query) throw new Error("seo_query_not_found");
      return query;
    },

    async saveQueryClassification(queryId: string, targetPath: string | null, frequencyBand: FrequencyBand) {
      const [query] = await db.update(seoQueries).set({ targetPath, frequencyBand, updatedAt: new Date() })
        .where(eq(seoQueries.id, queryId)).returning();
      if (!query) throw new Error("seo_query_not_found");
      return query;
    },

    async recordChange(command: typeof seoChanges.$inferInsert) {
      const [change] = await db.insert(seoChanges).values(command).returning();
      return change;
    },

    async listChanges(filters: { pagePath?: string }, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const where = filters.pagePath ? eq(seoChanges.pagePath, filters.pagePath) : undefined;
      const rows = await db.select().from(seoChanges).where(where).orderBy(desc(seoChanges.appliedAt), desc(seoChanges.id))
        .limit(page.limit + 1).offset(offset);
      return { items: rows.slice(0, page.limit), nextCursor: rows.length > page.limit ? String(offset + page.limit) : null };
    },

    async createRecommendation(command: RecommendationCommand) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${command.fingerprint}))`);
        const [active] = await tx.select().from(seoRecommendations).where(and(
          eq(seoRecommendations.fingerprint, command.fingerprint),
          inArray(seoRecommendations.status, activeRecommendationStatuses),
        )).orderBy(desc(seoRecommendations.createdAt)).limit(1).for("update");
        if (active) {
          const [updated] = await tx.update(seoRecommendations).set({
            rationale: command.rationale,
            evidence: command.evidence,
            confidence: command.confidence,
            updatedAt: new Date(),
          }).where(eq(seoRecommendations.id, active.id)).returning();
          return updated;
        }
        const [created] = await tx.insert(seoRecommendations).values(command).returning();
        return created;
      });
    },

    async updateRecommendationStatus(id: string, expectedStatus: RecommendationStatus, status: RecommendationStatus) {
      return db.transaction(async (tx) => {
        const [current] = await tx.select().from(seoRecommendations).where(eq(seoRecommendations.id, id)).for("update");
        if (!current) throw new Error("seo_recommendation_not_found");
        if (current.status !== expectedStatus) throw new Error("seo_recommendation_status_conflict");
        if (!recommendationTransitions[current.status].includes(status)) {
          throw new Error("seo_recommendation_transition_invalid");
        }
        const [updated] = await tx.update(seoRecommendations).set({ status, updatedAt: new Date() })
          .where(and(eq(seoRecommendations.id, id), eq(seoRecommendations.status, expectedStatus))).returning();
        if (!updated) throw new Error("seo_recommendation_status_conflict");
        return updated;
      });
    },

    async listRecommendations(filters: { status?: RecommendationStatus; pagePath?: string }, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const conditions = [];
      if (filters.status) conditions.push(eq(seoRecommendations.status, filters.status));
      if (filters.pagePath) conditions.push(eq(seoRecommendations.pagePath, filters.pagePath));
      const rows = await db.select().from(seoRecommendations).where(and(...conditions))
        .orderBy(desc(seoRecommendations.createdAt), desc(seoRecommendations.id)).limit(page.limit + 1).offset(offset);
      return { items: rows.slice(0, page.limit), nextCursor: rows.length > page.limit ? String(offset + page.limit) : null };
    },
  };
}

export type SeoRepository = ReturnType<typeof createSeoRepository>;
