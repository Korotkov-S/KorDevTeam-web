import { and, asc, desc, eq, isNotNull, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import type { createDb } from "../db/client";
import { seoCompetitorReports, seoQueries, seoRankChecks, seoRegions } from "../db/schema";
import { publicTargetUrl, type CompetitorAiAnalysis, type CompetitorReport, type CompetitorSnapshot, type RankSerp } from "./competitorAnalysis";
import archive from "./competitorArchive.json";

const archivedSnapshots = archive as CompetitorSnapshot[];
const rankFields = {
  id: seoRankChecks.id,
  queryId: seoRankChecks.queryId,
  checkDate: seoRankChecks.checkDate,
  checkedAt: seoRankChecks.checkedAt,
  device: seoRankChecks.device,
  status: seoRankChecks.status,
  position: seoRankChecks.position,
  resultLimit: seoRankChecks.resultLimit,
  regionName: seoRegions.displayName,
  externalRegion: seoRegions.externalId,
  serp: seoRankChecks.serp,
};

type RankRow = {
  id: string;
  queryId: string;
  checkDate: string;
  checkedAt: Date;
  device: string;
  status: "found" | "not_found";
  position: number | null;
  resultLimit: number;
  regionName: string;
  externalRegion: string | null;
  serp: RankSerp | null;
};

function snapshotFromRow(row: RankRow): CompetitorSnapshot | null {
  const { serp, externalRegion, ...rest } = row;
  if (!serp || (rest.device !== "desktop" && rest.device !== "mobile") || !externalRegion || !/^\d+$/u.test(externalRegion)) return null;
  return { ...rest, ...serp, device: rest.device, region: Number(externalRegion), checkedAt: row.checkedAt.toISOString(), source: "weekly" };
}

export type CompetitorFilters = { queryId: string; device?: "desktop" | "mobile"; region?: number; date?: string };

type SnapshotCursor = { checkedAt: string; id: string };

export function createCompetitorRepository(db: ReturnType<typeof createDb>) {
  const rankRows = (predicate: SQL | undefined) => db.select(rankFields).from(seoRankChecks)
    .innerJoin(seoRegions, eq(seoRegions.id, seoRankChecks.regionId)).where(predicate);
  async function listSnapshotsPage(filters: Partial<CompetitorFilters>, limit: number, cursor?: SnapshotCursor) {
    const cursorTime = cursor ? new Date(cursor.checkedAt).toISOString() : undefined;
    const after = cursor && cursorTime
      ? or(lt(seoRankChecks.checkedAt, new Date(cursorTime)),
        and(eq(seoRankChecks.checkedAt, new Date(cursorTime)), sql`${seoRankChecks.id}::text > ${cursor.id}`))
      : undefined;
    const rows = await rankRows(and(
      sql`${seoRankChecks.serp}->>'targetPath' LIKE '/services/%'`,
      filters.queryId ? eq(seoRankChecks.queryId, filters.queryId) : undefined,
      filters.device ? eq(seoRankChecks.device, filters.device) : undefined,
      filters.region !== undefined ? eq(seoRegions.externalId, String(filters.region)) : undefined,
      filters.date ? eq(seoRankChecks.checkDate, filters.date) : undefined,
      after,
    )).orderBy(desc(seoRankChecks.checkedAt), asc(seoRankChecks.id)).limit(limit + 1);
    const historical = archivedSnapshots.filter(snapshot =>
      (!filters.queryId || snapshot.queryId === filters.queryId) &&
      (!filters.date || snapshot.checkDate === filters.date) &&
      (!filters.device || snapshot.device === filters.device) &&
      (filters.region === undefined || snapshot.region === filters.region) &&
      (!cursor || !cursorTime || Date.parse(snapshot.checkedAt) < Date.parse(cursorTime) ||
        (Date.parse(snapshot.checkedAt) === Date.parse(cursorTime) && snapshot.id > cursor.id)));
    const sorted = [...rows.flatMap(row => snapshotFromRow(row) ?? []), ...historical].sort((a, b) =>
      Date.parse(b.checkedAt) - Date.parse(a.checkedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const items = sorted.slice(0, limit);
    const last = items.at(-1);
    return { items, nextCursor: sorted.length > limit && last ? { checkedAt: last.checkedAt, id: last.id } : null };
  }

  return {
    listSnapshotsPage,

    async listQueries() {
      const rows = await db.select({ id: seoQueries.id, queryText: seoQueries.queryText })
        .from(seoQueries).where(and(eq(seoQueries.status, "active"), like(seoQueries.targetPath, "/services/%")))
        .orderBy(asc(seoQueries.queryText));
      const queries = new Map(rows.map(row => [row.id, row]));
      for (const row of archivedSnapshots) if (!queries.has(row.queryId)) queries.set(row.queryId, { id: row.queryId, queryText: row.queryText });
      return [...queries.values()];
    },

    async hasQuery(id: string) {
      const [row] = await db.select({ id: seoQueries.id }).from(seoQueries).where(eq(seoQueries.id, id)).limit(1);
      return Boolean(row);
    },

    async listRegions() {
      const rows = await db.select({ id: seoRegions.externalId, name: seoRegions.displayName })
        .from(seoRegions).where(and(eq(seoRegions.source, "yandex_webmaster"), isNotNull(seoRegions.externalId)))
        .orderBy(asc(seoRegions.sortOrder));
      const regions = rows.flatMap(row => row.id && /^\d+$/u.test(row.id) ? [{ id: Number(row.id), name: row.name }] : []);
      if (!regions.some(row => row.id === 213)) regions.push({ id: 213, name: "Москва" });
      return regions;
    },

    async listSnapshots(filters: CompetitorFilters) {
      return (await listSnapshotsPage(filters, 100)).items;
    },

    async getSnapshot(id: string): Promise<CompetitorSnapshot | null> {
      const historical = archivedSnapshots.find(s => s.id === id);
      if (historical) return historical;
      if (id.startsWith("archive-")) return null;
      const [row] = await rankRows(and(eq(seoRankChecks.id, id), isNotNull(seoRankChecks.serp))).limit(1);
      return row && publicTargetUrl(row.serp?.targetPath ?? null) ? snapshotFromRow(row) : null;
    },

    async listReports(snapshotId: string) {
      return db.select({ id: seoCompetitorReports.id, createdAt: seoCompetitorReports.createdAt })
        .from(seoCompetitorReports).where(eq(seoCompetitorReports.snapshotId, snapshotId))
        .orderBy(desc(seoCompetitorReports.createdAt)).limit(20);
    },

    async getReport(id: string) {
      const [row] = await db.select().from(seoCompetitorReports).where(eq(seoCompetitorReports.id, id)).limit(1);
      return row ?? null;
    },

    async listReportsPage(snapshotId: string | undefined, limit: number, offset: number) {
      const rows = await db.select({
        id: seoCompetitorReports.id, snapshotId: seoCompetitorReports.snapshotId,
        createdAt: seoCompetitorReports.createdAt, hasAnalysis: sql<boolean>`${seoCompetitorReports.analysis} IS NOT NULL`,
      }).from(seoCompetitorReports)
        .where(snapshotId ? eq(seoCompetitorReports.snapshotId, snapshotId) : undefined)
        .orderBy(desc(seoCompetitorReports.createdAt), desc(seoCompetitorReports.id))
        .limit(limit + 1).offset(offset);
      return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? offset + limit : null };
    },

    async saveReport(report: CompetitorReport, id?: string) {
      const [row] = await db.insert(seoCompetitorReports).values({ id, snapshotId: report.snapshot.id, report })
        .onConflictDoNothing({ target: seoCompetitorReports.id })
        .returning({ id: seoCompetitorReports.id });
      return row?.id ?? null;
    },

    async saveAnalysis(id: string, analysis: CompetitorAiAnalysis) {
      const rows = await db.update(seoCompetitorReports).set({ analysis })
        .where(and(eq(seoCompetitorReports.id, id), isNull(seoCompetitorReports.analysis)))
        .returning({ id: seoCompetitorReports.id });
      return rows.length === 1;
    },
  };
}

export type CompetitorRepository = ReturnType<typeof createCompetitorRepository>;
