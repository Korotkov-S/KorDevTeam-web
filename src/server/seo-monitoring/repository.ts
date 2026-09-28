import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  seoChanges,
  seoCollectionRuns,
  seoDailyMetrics,
  seoQueries,
  seoRankChecks,
  seoRankRuns,
  seoRecommendations,
  seoRegions,
  seoSources,
  seoTrafficMetrics,
} from "../db/schema";
import type { NormalizedRankCheck, NormalizedSeoObservation, NormalizedTrafficObservation, SeoDevice, SeoQueryKind, SeoQueryStatus, SeoSourceId } from "./contracts";
import type { SemanticCoreEntry } from "./semanticCore";

export type SeoDatabase = ReturnType<typeof createDb>;
type Transaction = Parameters<Parameters<SeoDatabase["transaction"]>[0]>[0];
type FrequencyBand = typeof seoQueries.$inferSelect.frequencyBand;
type RecommendationStatus = typeof seoRecommendations.$inferSelect.status;
type RecommendationCommand = Omit<typeof seoRecommendations.$inferInsert, "id" | "status" | "createdAt" | "updatedAt">;

type TrafficRow = {
  observationDate: string;
  slice: "overall" | "device" | "region" | "page";
  dimensionKey: string;
  dimensionLabel: string;
  pagePath: string | null;
  users: number;
  newUsers: number;
  visits: number;
  pageviews: number;
  bounceRate: number;
  pageDepth: number;
  avgVisitDurationSeconds: number;
};

type TrafficAggregate = {
  users: number;
  newUsers: number;
  visits: number;
  pageviews: number;
  bounceRate: number | null;
  pageDepth: number | null;
  avgVisitDurationSeconds: number | null;
};

export type SeoMetricFilters = {
  dateFrom: string;
  dateTo: string;
  source?: SeoSourceId;
  regionId?: string;
  device?: SeoDevice;
  frequencyBand?: FrequencyBand;
  pagePath?: string;
};

type RankControlQuery = {
  id: string;
  queryText: string;
  targetPath: string | null;
  wordstatFrequency: number | null;
  frequencyBand: FrequencyBand;
};

type RankControlRegion = {
  id: string;
  code: string;
  displayName: string;
  sortOrder: number;
};

type RankControlCheck = {
  queryId: string;
  regionId: string;
  device: Extract<SeoDevice, "desktop" | "mobile">;
  checkDate: string;
  status: "found" | "not_found";
  position: number | null;
  resultUrl: string | null;
  resultLimit: number;
};

export type RankMovement = "improved" | "declined" | "same";

export type RankControlCell = RankControlCheck & {
  deltaDay: number | null;
  deltaWeek: number | null;
  movementDay: RankMovement | null;
  movementWeek: RankMovement | null;
};

const RANK_CONTROL_DEVICES = ["desktop", "mobile"] as const;
const DAY_MS = 86_400_000;

function aggregateTrafficMetrics(rows: readonly TrafficRow[]): TrafficAggregate {
  const result = rows.reduce((totals, row) => ({
    users: totals.users + row.users,
    newUsers: totals.newUsers + row.newUsers,
    visits: totals.visits + row.visits,
    pageviews: totals.pageviews + row.pageviews,
    bounceWeight: totals.bounceWeight + row.bounceRate * row.visits,
    depthWeight: totals.depthWeight + row.pageDepth * row.visits,
    durationWeight: totals.durationWeight + row.avgVisitDurationSeconds * row.visits,
  }), { users: 0, newUsers: 0, visits: 0, pageviews: 0, bounceWeight: 0, depthWeight: 0, durationWeight: 0 });
  return {
    users: result.users,
    newUsers: result.newUsers,
    visits: result.visits,
    pageviews: result.pageviews,
    bounceRate: result.visits ? result.bounceWeight / result.visits : null,
    pageDepth: result.visits ? result.depthWeight / result.visits : null,
    avgVisitDurationSeconds: result.visits ? result.durationWeight / result.visits : null,
  };
}

function groupedTraffic(rows: readonly TrafficRow[], key: (row: TrafficRow) => string) {
  const groups = new Map<string, TrafficRow[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups.entries()].map(([, values]) => ({
    dimensionKey: values[0].dimensionKey,
    dimensionLabel: values[0].dimensionLabel,
    pagePath: values[0].pagePath,
    ...aggregateTrafficMetrics(values),
  })).sort((left, right) => right.visits - left.visits || left.dimensionLabel.localeCompare(right.dimensionLabel, "ru"));
}

export function aggregateTrafficRows(rows: readonly TrafficRow[]) {
  const overall = rows.filter((row) => row.slice === "overall");
  const byDate = new Map<string, TrafficRow[]>();
  for (const row of overall) byDate.set(row.observationDate, [...(byDate.get(row.observationDate) ?? []), row]);
  const daily = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({
    date,
    ...aggregateTrafficMetrics(values),
  }));
  return {
    overview: aggregateTrafficMetrics(overall),
    daily,
    devices: groupedTraffic(rows.filter((row) => row.slice === "device"), (row) => row.dimensionKey),
    regions: groupedTraffic(rows.filter((row) => row.slice === "region"), (row) => row.dimensionKey),
    pages: groupedTraffic(rows.filter((row) => row.slice === "page"), (row) => row.dimensionKey),
  };
}

function shiftDate(value: string, days: number): string {
  return new Date(+new Date(`${value}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function rankMovement(current: RankControlCheck, previous: RankControlCheck | undefined): RankMovement | null {
  if (!previous) return null;
  const currentScore = current.status === "found" ? current.position! : current.resultLimit + 1;
  const previousScore = previous.status === "found" ? previous.position! : previous.resultLimit + 1;
  return currentScore < previousScore ? "improved" : currentScore > previousScore ? "declined" : "same";
}

function numericDelta(current: RankControlCheck, previous: RankControlCheck | undefined): number | null {
  return current.status === "found" && previous?.status === "found"
    ? current.position! - previous.position!
    : null;
}

export function buildRankControl(
  dateTo: string,
  queries: RankControlQuery[],
  regions: RankControlRegion[],
  checks: RankControlCheck[],
) {
  const referenceRegion = regions.find((region) => region.code === "ru") ?? regions[0] ?? null;
  const bySlice = new Map<string, RankControlCheck[]>();
  for (const check of checks) {
    const key = `${check.queryId}:${check.regionId}:${check.device}`;
    const entries = bySlice.get(key) ?? [];
    entries.push(check);
    bySlice.set(key, entries);
  }
  for (const entries of bySlice.values()) entries.sort((a, b) => b.checkDate.localeCompare(a.checkDate));

  const rows = queries.map((query) => {
    const cells: Record<string, Record<string, RankControlCell | null>> = {};
    for (const region of regions) {
      cells[region.code] = {};
      for (const device of RANK_CONTROL_DEVICES) {
        const entries = bySlice.get(`${query.id}:${region.id}:${device}`) ?? [];
        const current = entries.find((entry) => entry.checkDate <= dateTo && entry.checkDate >= shiftDate(dateTo, -7));
        if (!current) {
          cells[region.code][device] = null;
          continue;
        }
        const previousDay = entries.find((entry) => entry.checkDate === shiftDate(current.checkDate, -1));
        const previousWeek = entries.find((entry) => entry.checkDate === shiftDate(current.checkDate, -7));
        cells[region.code][device] = {
          ...current,
          deltaDay: numericDelta(current, previousDay),
          deltaWeek: numericDelta(current, previousWeek),
          movementDay: rankMovement(current, previousDay),
          movementWeek: rankMovement(current, previousWeek),
        };
      }
    }
    return { ...query, queryId: query.id, checks: cells };
  });

  const referenceCells = rows.map((row) => referenceRegion ? row.checks[referenceRegion.code]?.desktop ?? null : null);
  const foundPositions = referenceCells.flatMap((cell) => cell?.status === "found" ? [cell.position!] : []);
  return {
    summary: {
      tracked: rows.length,
      top3: foundPositions.filter((position) => position <= 3).length,
      top10: foundPositions.filter((position) => position <= 10).length,
      top30: foundPositions.filter((position) => position <= 30).length,
      outsideTop100: referenceCells.filter((cell) => cell?.status === "not_found").length,
      noData: referenceCells.filter((cell) => cell === null).length,
      improvedDay: referenceCells.filter((cell) => cell?.movementDay === "improved").length,
      declinedDay: referenceCells.filter((cell) => cell?.movementDay === "declined").length,
      improvedWeek: referenceCells.filter((cell) => cell?.movementWeek === "improved").length,
      declinedWeek: referenceCells.filter((cell) => cell?.movementWeek === "declined").length,
      referenceRegionName: referenceRegion?.displayName ?? "Россия",
      referenceDevice: "desktop" as const,
    },
    regions,
    rows,
  };
}

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
    async syncSemanticCore(entries: readonly SemanticCoreEntry[]) {
      return db.transaction(async (tx) => {
        const result = { inserted: 0, promoted: 0, preserved: 0 };
        for (const entry of entries) {
          const [existing] = await tx.select().from(seoQueries)
            .where(eq(seoQueries.normalizedQuery, entry.normalizedQuery)).limit(1);
          if (!existing) {
            await tx.insert(seoQueries).values({
              ...entry,
              origin: "import",
              status: "active",
              tracked: true,
            });
            result.inserted++;
            continue;
          }
          if (existing.origin === "api" && existing.status === "candidate") {
            await tx.update(seoQueries).set({
              queryText: entry.queryText,
              targetPath: entry.targetPath,
              origin: "import",
              wordstatFrequency: entry.wordstatFrequency,
              frequencyBand: entry.frequencyBand,
              status: "active",
              kind: entry.kind,
              priority: entry.priority,
              tracked: true,
              updatedAt: new Date(),
            }).where(eq(seoQueries.id, existing.id));
            result.promoted++;
            continue;
          }
          result.preserved++;
        }
        return result;
      });
    },

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

    async withRankLock<T>(operation: () => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        const result = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${'seo-rank-collector:yandex'})) as acquired`);
        if (result.rows[0]?.acquired !== true) throw new Error("seo_rank_locked");
        return operation();
      });
    },

    async listTrackedQueries() {
      return db.select({ id: seoQueries.id, queryText: seoQueries.queryText }).from(seoQueries)
        .where(eq(seoQueries.tracked, true)).orderBy(
          desc(seoQueries.priority),
          sql`case ${seoQueries.kind} when 'commercial' then 0 when 'informational' then 1 else 2 end`,
          asc(seoQueries.createdAt),
          asc(seoQueries.id),
        );
    },

    async listRankRegions() {
      return db.select({ id: seoRegions.id, externalId: seoRegions.externalId, displayName: seoRegions.displayName })
        .from(seoRegions).where(and(
          eq(seoRegions.source, "yandex_webmaster"),
          eq(seoRegions.active, true),
          isNotNull(seoRegions.externalId),
        )).orderBy(asc(seoRegions.sortOrder)) as Promise<Array<{ id: string; externalId: string; displayName: string }>>;
    },

    async hasRankRunInWindow(dateFrom: string, dateTo: string) {
      const rows = await db.select({ id: seoRankRuns.id }).from(seoRankRuns).where(and(
        gte(seoRankRuns.checkDate, dateFrom),
        lte(seoRankRuns.checkDate, dateTo),
        gt(seoRankRuns.plannedCount, 0),
      )).limit(1);
      return rows.length > 0;
    },

    async startRankRun(checkDate: string, plannedCount: number) {
      const [run] = await db.insert(seoRankRuns).values({ checkDate, plannedCount, startedAt: new Date() }).returning();
      return run;
    },

    async finishRankRun(
      id: string,
      status: Exclude<typeof seoRankRuns.$inferSelect.status, "running">,
      result: { completedCount: number; storedCount: number; errorCode?: string; metadata?: Record<string, unknown> },
    ) {
      const [run] = await db.update(seoRankRuns).set({
        status,
        completedAt: new Date(),
        completedCount: result.completedCount,
        storedCount: result.storedCount,
        errorCode: result.errorCode ?? null,
        metadata: result.metadata ?? {},
      }).where(eq(seoRankRuns.id, id)).returning();
      if (!run) throw new Error("seo_rank_run_not_found");
      return run;
    },

    async upsertRankChecks(checks: readonly NormalizedRankCheck[]): Promise<number> {
      if (checks.length === 0) return 0;
      return db.transaction(async (tx) => {
        for (const check of checks) {
          await tx.insert(seoRankChecks).values(check).onConflictDoUpdate({
            target: [seoRankChecks.checkDate, seoRankChecks.queryId, seoRankChecks.regionId, seoRankChecks.device],
            set: {
              checkedAt: check.checkedAt,
              status: check.status,
              position: check.position,
              resultUrl: check.resultUrl,
              resultLimit: check.resultLimit,
              importedAt: new Date(),
            },
          });
        }
        return checks.length;
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
          const [changedQuery] = await tx.insert(seoQueries).values({
            queryText: observation.queryText,
            normalizedQuery: observation.normalizedQuery,
            origin: "api",
          }).onConflictDoUpdate({
            target: seoQueries.normalizedQuery,
            set: { queryText: observation.queryText, updatedAt: now },
            setWhere: and(eq(seoQueries.origin, "api"), eq(seoQueries.status, "candidate")),
          }).returning();
          const query = changedQuery ?? (await tx.select().from(seoQueries)
            .where(eq(seoQueries.normalizedQuery, observation.normalizedQuery)).limit(1))[0];
          if (!query) throw new Error("seo_query_not_found");
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

    async upsertTrafficObservations(observations: readonly NormalizedTrafficObservation[]): Promise<number> {
      if (observations.length === 0) return 0;
      return db.transaction(async (tx) => {
        for (const observation of observations) {
          const now = new Date();
          await tx.insert(seoTrafficMetrics).values({
            observationDate: observation.observationDate,
            source: observation.source,
            slice: observation.slice,
            dimensionKey: observation.dimensionKey,
            dimensionLabel: observation.dimensionLabel,
            pagePath: observation.pagePath,
            users: observation.users,
            newUsers: observation.newUsers,
            visits: observation.visits,
            pageviews: observation.pageviews,
            bounceRate: observation.bounceRate.toFixed(8),
            pageDepth: observation.pageDepth.toFixed(4),
            avgVisitDurationSeconds: observation.avgVisitDurationSeconds.toFixed(3),
            importedAt: now,
          }).onConflictDoUpdate({
            target: [
              seoTrafficMetrics.observationDate,
              seoTrafficMetrics.source,
              seoTrafficMetrics.slice,
              seoTrafficMetrics.dimensionKey,
            ],
            set: {
              dimensionLabel: observation.dimensionLabel,
              pagePath: observation.pagePath,
              users: observation.users,
              newUsers: observation.newUsers,
              visits: observation.visits,
              pageviews: observation.pageviews,
              bounceRate: observation.bounceRate.toFixed(8),
              pageDepth: observation.pageDepth.toFixed(4),
              avgVisitDurationSeconds: observation.avgVisitDurationSeconds.toFixed(3),
              importedAt: now,
            },
          });
        }
        return observations.length;
      });
    },

    async listRankChecks(filters: SeoMetricFilters, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const conditions = [
        gte(seoRankChecks.checkDate, filters.dateFrom),
        lte(seoRankChecks.checkDate, filters.dateTo),
      ];
      if (filters.regionId) conditions.push(eq(seoRankChecks.regionId, filters.regionId));
      if (filters.device) conditions.push(eq(seoRankChecks.device, filters.device));
      if (filters.frequencyBand) conditions.push(eq(seoQueries.frequencyBand, filters.frequencyBand));
      if (filters.pagePath) conditions.push(eq(seoQueries.targetPath, filters.pagePath));
      const rows = await db.select({
        id: seoRankChecks.id,
        queryId: seoQueries.id,
        queryText: seoQueries.queryText,
        targetPath: seoQueries.targetPath,
        frequencyBand: seoQueries.frequencyBand,
        regionId: seoRegions.id,
        regionName: seoRegions.displayName,
        regionCode: seoRegions.code,
        regionSortOrder: seoRegions.sortOrder,
        device: seoRankChecks.device,
        status: seoRankChecks.status,
        position: seoRankChecks.position,
        resultUrl: seoRankChecks.resultUrl,
        resultLimit: seoRankChecks.resultLimit,
        checkDate: seoRankChecks.checkDate,
        checkedAt: seoRankChecks.checkedAt,
      }).from(seoRankChecks)
        .innerJoin(seoQueries, eq(seoQueries.id, seoRankChecks.queryId))
        .innerJoin(seoRegions, eq(seoRegions.id, seoRankChecks.regionId))
        .where(and(...conditions))
        .orderBy(asc(seoQueries.queryText), asc(seoRegions.sortOrder), asc(seoRankChecks.device),
          desc(seoRankChecks.checkDate), desc(seoRankChecks.checkedAt));
      const grouped = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = `${row.queryId}:${row.regionId}:${row.device}`;
        const entries = grouped.get(key) ?? [];
        if (entries.length < 2) entries.push(row);
        grouped.set(key, entries);
      }
      const items = [...grouped.values()].map(([current, previous]) => ({
        ...current,
        previousPosition: previous?.position ?? null,
        delta: current.position === null || previous?.position === null || previous?.position === undefined
          ? null : current.position - previous.position,
      }));
      return {
        items: items.slice(offset, offset + page.limit),
        nextCursor: items.length > offset + page.limit ? String(offset + page.limit) : null,
      };
    },

    async getRankControl(dateTo: string) {
      const queries = await db.select({
        id: seoQueries.id,
        queryText: seoQueries.queryText,
        targetPath: seoQueries.targetPath,
        wordstatFrequency: seoQueries.wordstatFrequency,
        frequencyBand: seoQueries.frequencyBand,
      }).from(seoQueries).where(eq(seoQueries.status, "active")).orderBy(
        desc(seoQueries.priority),
        asc(seoQueries.queryText),
        asc(seoQueries.id),
      );
      const regions = await db.select({
        id: seoRegions.id,
        code: seoRegions.code,
        displayName: seoRegions.displayName,
        sortOrder: seoRegions.sortOrder,
      }).from(seoRegions).where(and(
        eq(seoRegions.source, "yandex_webmaster"),
        eq(seoRegions.active, true),
      )).orderBy(asc(seoRegions.sortOrder));
      if (queries.length === 0 || regions.length === 0) return buildRankControl(dateTo, queries, regions, []);
      const checks = await db.select({
        queryId: seoRankChecks.queryId,
        regionId: seoRankChecks.regionId,
        device: seoRankChecks.device,
        checkDate: seoRankChecks.checkDate,
        status: seoRankChecks.status,
        position: seoRankChecks.position,
        resultUrl: seoRankChecks.resultUrl,
        resultLimit: seoRankChecks.resultLimit,
      }).from(seoRankChecks).where(and(
        inArray(seoRankChecks.queryId, queries.map((query) => query.id)),
        inArray(seoRankChecks.regionId, regions.map((region) => region.id)),
        gte(seoRankChecks.checkDate, shiftDate(dateTo, -14)),
        lte(seoRankChecks.checkDate, dateTo),
      ));
      return buildRankControl(dateTo, queries, regions, checks as RankControlCheck[]);
    },

    async listSemanticCore(filters: { status?: SeoQueryStatus; kind?: SeoQueryKind }, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const conditions = [];
      if (filters.status) conditions.push(eq(seoQueries.status, filters.status));
      if (filters.kind) conditions.push(eq(seoQueries.kind, filters.kind));
      const rows = await db.select().from(seoQueries).where(and(...conditions))
        .orderBy(
          sql`case ${seoQueries.status} when 'active' then 0 when 'candidate' then 1 else 2 end`,
          desc(seoQueries.priority),
          asc(seoQueries.queryText),
          asc(seoQueries.id),
        )
        .limit(page.limit + 1)
        .offset(offset);
      return {
        items: rows.slice(0, page.limit),
        nextCursor: rows.length > page.limit ? String(offset + page.limit) : null,
      };
    },

    async createCandidate(command: {
      queryText: string;
      normalizedQuery: string;
      targetPath: string | null;
      wordstatFrequency: number | null;
      frequencyBand: FrequencyBand;
      kind: SeoQueryKind;
      priority: number;
    }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'seo-query:' + command.normalizedQuery}))`);
        const [existing] = await tx.select({ id: seoQueries.id }).from(seoQueries)
          .where(eq(seoQueries.normalizedQuery, command.normalizedQuery)).limit(1);
        if (existing) throw new Error("seo_query_exists");
        const [created] = await tx.insert(seoQueries).values({
          ...command,
          origin: "manual",
          status: "candidate",
          tracked: false,
        }).returning();
        return created;
      });
    },

    async updateSemanticQuery(id: string, expectedUpdatedAt: Date, command: {
      targetPath: string | null;
      wordstatFrequency: number | null;
      frequencyBand: FrequencyBand;
      kind: SeoQueryKind;
      priority: number;
      status: SeoQueryStatus;
    }) {
      const [updated] = await db.update(seoQueries).set({
        ...command,
        tracked: command.status === "active",
        updatedAt: new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1)),
      }).where(and(
        eq(seoQueries.id, id),
        sql`date_trunc('milliseconds', ${seoQueries.updatedAt}) = ${expectedUpdatedAt}`,
      )).returning();
      if (updated) return updated;
      const [existing] = await db.select({ id: seoQueries.id }).from(seoQueries).where(eq(seoQueries.id, id)).limit(1);
      if (!existing) throw new Error("seo_query_not_found");
      throw new Error("seo_query_conflict");
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

    async getTrafficReport(filters: { dateFrom: string; dateTo: string }) {
      const rows = await db.select({
        observationDate: seoTrafficMetrics.observationDate,
        slice: seoTrafficMetrics.slice,
        dimensionKey: seoTrafficMetrics.dimensionKey,
        dimensionLabel: seoTrafficMetrics.dimensionLabel,
        pagePath: seoTrafficMetrics.pagePath,
        users: seoTrafficMetrics.users,
        newUsers: seoTrafficMetrics.newUsers,
        visits: seoTrafficMetrics.visits,
        pageviews: seoTrafficMetrics.pageviews,
        bounceRate: sql<number>`${seoTrafficMetrics.bounceRate}::double precision`,
        pageDepth: sql<number>`${seoTrafficMetrics.pageDepth}::double precision`,
        avgVisitDurationSeconds: sql<number>`${seoTrafficMetrics.avgVisitDurationSeconds}::double precision`,
      }).from(seoTrafficMetrics).where(and(
        gte(seoTrafficMetrics.observationDate, filters.dateFrom),
        lte(seoTrafficMetrics.observationDate, filters.dateTo),
      )).orderBy(asc(seoTrafficMetrics.observationDate), asc(seoTrafficMetrics.slice), asc(seoTrafficMetrics.dimensionKey));
      return aggregateTrafficRows(rows);
    },

    async listPagePerformance(filters: SeoMetricFilters, page: { limit: number; cursor: string | null }) {
      const searchRows = await db.select({
        pagePath: seoDailyMetrics.pagePath,
        impressions: sql<number>`sum(${seoDailyMetrics.impressions})::double precision`,
        clicks: sql<number>`sum(${seoDailyMetrics.clicks})::double precision`,
        ctr: sql<number | null>`sum(${seoDailyMetrics.clicks})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
        averagePosition: sql<number | null>`sum(${seoDailyMetrics.impressions} * ${seoDailyMetrics.averagePosition})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`,
        observedQueries: sql<number>`count(distinct ${seoDailyMetrics.queryId})::integer`,
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId))
        .where(whereFilters(filters)).groupBy(seoDailyMetrics.pagePath);
      const trafficRows = await db.select({
        observationDate: seoTrafficMetrics.observationDate,
        slice: seoTrafficMetrics.slice,
        dimensionKey: seoTrafficMetrics.dimensionKey,
        dimensionLabel: seoTrafficMetrics.dimensionLabel,
        pagePath: seoTrafficMetrics.pagePath,
        users: seoTrafficMetrics.users,
        newUsers: seoTrafficMetrics.newUsers,
        visits: seoTrafficMetrics.visits,
        pageviews: seoTrafficMetrics.pageviews,
        bounceRate: sql<number>`${seoTrafficMetrics.bounceRate}::double precision`,
        pageDepth: sql<number>`${seoTrafficMetrics.pageDepth}::double precision`,
        avgVisitDurationSeconds: sql<number>`${seoTrafficMetrics.avgVisitDurationSeconds}::double precision`,
      }).from(seoTrafficMetrics).where(and(
        eq(seoTrafficMetrics.slice, "page"),
        gte(seoTrafficMetrics.observationDate, filters.dateFrom),
        lte(seoTrafficMetrics.observationDate, filters.dateTo),
        ...(filters.pagePath ? [eq(seoTrafficMetrics.pagePath, filters.pagePath)] : []),
      ));
      const assignedRows = await db.select({
        pagePath: seoQueries.targetPath,
        assignedQueries: sql<number>`count(*)::integer`,
      }).from(seoQueries).where(and(
        eq(seoQueries.status, "active"),
        isNotNull(seoQueries.targetPath),
        ...(filters.pagePath ? [eq(seoQueries.targetPath, filters.pagePath)] : []),
      )).groupBy(seoQueries.targetPath);
      const paths = new Map<string, {
        pagePath: string; impressions: number; clicks: number; ctr: number | null; averagePosition: number | null;
        observedQueries: number; assignedQueries: number; users: number; newUsers: number; visits: number; pageviews: number;
        bounceRate: number | null; pageDepth: number | null; avgVisitDurationSeconds: number | null;
      }>();
      const empty = (pagePath: string) => ({ pagePath, impressions: 0, clicks: 0, ctr: null, averagePosition: null,
        observedQueries: 0, assignedQueries: 0, users: 0, newUsers: 0, visits: 0, pageviews: 0,
        bounceRate: null, pageDepth: null, avgVisitDurationSeconds: null });
      for (const row of searchRows) paths.set(row.pagePath, { ...empty(row.pagePath), ...row });
      for (const row of aggregateTrafficRows(trafficRows).pages) {
        if (!row.pagePath) continue;
        paths.set(row.pagePath, {
          ...(paths.get(row.pagePath) ?? empty(row.pagePath)),
          pagePath: row.pagePath,
          users: row.users,
          newUsers: row.newUsers,
          visits: row.visits,
          pageviews: row.pageviews,
          bounceRate: row.bounceRate,
          pageDepth: row.pageDepth,
          avgVisitDurationSeconds: row.avgVisitDurationSeconds,
        });
      }
      for (const row of assignedRows) {
        if (!row.pagePath) continue;
        paths.set(row.pagePath, { ...(paths.get(row.pagePath) ?? empty(row.pagePath)), assignedQueries: row.assignedQueries });
      }
      const rows = [...paths.values()].sort((left, right) => right.impressions - left.impressions || right.visits - left.visits || left.pagePath.localeCompare(right.pagePath));
      const offset = cursorOffset(page.cursor);
      return { items: rows.slice(offset, offset + page.limit), nextCursor: rows.length > offset + page.limit ? String(offset + page.limit) : null };
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
      const queryPositions = db.select({
        queryId: seoDailyMetrics.queryId,
        averagePosition: sql<number>`sum(${seoDailyMetrics.impressions} * ${seoDailyMetrics.averagePosition})::double precision / nullif(sum(${seoDailyMetrics.impressions}), 0)`.as("average_position"),
      }).from(seoDailyMetrics).innerJoin(seoQueries, eq(seoQueries.id, seoDailyMetrics.queryId)).where(condition)
        .groupBy(seoDailyMetrics.queryId).as("seo_query_positions");
      const bucket = sql<string>`case
        when ${queryPositions.averagePosition} <= 3 then '1–3'
        when ${queryPositions.averagePosition} <= 10 then '4–10'
        when ${queryPositions.averagePosition} <= 30 then '11–30'
        when ${queryPositions.averagePosition} <= 50 then '31–50'
        else '>50' end`;
      const positionBuckets = await db.select({
        bucket,
        count: sql<number>`count(*)::integer`,
      }).from(queryPositions).where(sql`${queryPositions.averagePosition} is not null`).groupBy(bucket);
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

    async listChanges(filters: { pagePath?: string; dateFrom?: string; dateTo?: string }, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const conditions = [];
      if (filters.pagePath) conditions.push(eq(seoChanges.pagePath, filters.pagePath));
      if (filters.dateFrom) conditions.push(gte(seoChanges.appliedAt, new Date(`${filters.dateFrom}T00:00:00.000Z`)));
      if (filters.dateTo) conditions.push(lte(seoChanges.appliedAt, new Date(`${filters.dateTo}T23:59:59.999Z`)));
      const rows = await db.select().from(seoChanges).where(and(...conditions)).orderBy(desc(seoChanges.appliedAt), desc(seoChanges.id))
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

    async listRecommendations(filters: { status?: RecommendationStatus; pagePath?: string; dateFrom?: string; dateTo?: string }, page: { limit: number; cursor: string | null }) {
      const offset = cursorOffset(page.cursor);
      const conditions = [];
      if (filters.status) conditions.push(eq(seoRecommendations.status, filters.status));
      if (filters.pagePath) conditions.push(eq(seoRecommendations.pagePath, filters.pagePath));
      if (filters.dateFrom) conditions.push(gte(seoRecommendations.createdAt, new Date(`${filters.dateFrom}T00:00:00.000Z`)));
      if (filters.dateTo) conditions.push(lte(seoRecommendations.createdAt, new Date(`${filters.dateTo}T23:59:59.999Z`)));
      const rows = await db.select().from(seoRecommendations).where(and(...conditions))
        .orderBy(desc(seoRecommendations.createdAt), desc(seoRecommendations.id)).limit(page.limit + 1).offset(offset);
      return { items: rows.slice(0, page.limit), nextCursor: rows.length > page.limit ? String(offset + page.limit) : null };
    },
  };
}

export type SeoRepository = ReturnType<typeof createSeoRepository>;
