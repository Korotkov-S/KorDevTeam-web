import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { contentEntries, contentRevisions, seoIndexObservations, seoQueries } from "../db/schema";
import { entryPath } from "../seo/sitemaps";
import type { SeoDatabase } from "./repository";
import { parseIndexingAudit } from "./pageControl";

export function createPageControlRepository(db: SeoDatabase) {
  return {
    async importAudit(report: unknown) {
      const rows = parseIndexingAudit(report);
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(706008)`);
        const entries = await tx.select().from(contentEntries).where(inArray(contentEntries.id, rows.map(r => r.contentEntryId)));
        let inserted = 0; let unchanged = 0;
        for (const row of rows) {
          const entry = entries.find(e => e.id === row.contentEntryId);
          const revision = entry && row.publishedVersion < entry.version
            ? (await tx.select().from(contentRevisions).where(and(eq(contentRevisions.entryId, entry.id), eq(contentRevisions.version, row.publishedVersion))))[0]
            : null;
          const snapshot = revision?.snapshot;
          const publication = row.publishedVersion === entry?.version ? entry : snapshot?.entry ?? snapshot;
          const verified = publication && typeof publication === "object" && !Array.isArray(publication)
            ? publication as { id?: string; kind?: string; slug?: string; version?: number; status?: string } : null;
          if (!entry || !verified || verified.id !== row.contentEntryId || verified.version !== row.publishedVersion
            || verified.status !== "published" || verified.kind !== row.kind || typeof verified.slug !== "string"
            || entryPath({ kind: row.kind, slug: verified.slug }) !== row.pagePath) {
            throw new Error("seo_index_publication_mismatch");
          }
          const condition = and(eq(seoIndexObservations.contentEntryId, row.contentEntryId), eq(seoIndexObservations.source, row.source),
            eq(seoIndexObservations.checkedAt, new Date(row.checkedAt)));
          const [existing] = await tx.select().from(seoIndexObservations).where(condition);
          if (existing) {
            const { id: _id, createdAt: _at, ...stored } = existing;
            if (JSON.stringify({ ...stored, checkedAt: stored.checkedAt.toISOString() }) !== JSON.stringify(row)) {
              // JSONB reorders object keys: compare actual JSON values inside PostgreSQL.
              const [same] = await tx.select({ id: seoIndexObservations.id }).from(seoIndexObservations).where(and(condition,
                eq(seoIndexObservations.pagePath, row.pagePath), eq(seoIndexObservations.url, row.url),
                eq(seoIndexObservations.kind, row.kind), eq(seoIndexObservations.publishedVersion, row.publishedVersion),
                eq(seoIndexObservations.status, row.status), sql`${seoIndexObservations.errorCode} IS NOT DISTINCT FROM ${row.errorCode}`,
                sql`${seoIndexObservations.evidence} = ${JSON.stringify(row.evidence)}::jsonb`));
              if (!same) throw new Error("seo_index_observation_conflict");
            }
            unchanged++;
          } else {
            await tx.insert(seoIndexObservations).values({ ...row, checkedAt: new Date(row.checkedAt) }); inserted++;
          }
        }
        return { inserted, unchanged };
      });
    },
    async listPages(input: { pagePath?: string; limit: number; cursor: string | null }, now = new Date()) {
      const offset = input.cursor === null ? 0 : Number(input.cursor);
      if (!Number.isSafeInteger(offset) || offset < 0 || (input.cursor !== null && !/^\d+$/.test(input.cursor))) throw new Error("seo_cursor_invalid");
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("seo_limit_invalid");
      const entries = await db.select().from(contentEntries).where(and(eq(contentEntries.status, "published"),
        inArray(contentEntries.kind, ["article", "case", "service"]))).orderBy(asc(contentEntries.kind), asc(contentEntries.slug));
      const [keywords, attempts, successes] = await Promise.all([
        db.select().from(seoQueries).where(and(eq(seoQueries.status, "active"), eq(seoQueries.tracked, true))),
        db.selectDistinctOn([seoIndexObservations.contentEntryId, seoIndexObservations.source]).from(seoIndexObservations)
          .orderBy(asc(seoIndexObservations.contentEntryId), asc(seoIndexObservations.source), desc(seoIndexObservations.checkedAt)),
        db.selectDistinctOn([seoIndexObservations.contentEntryId, seoIndexObservations.source]).from(seoIndexObservations)
          .where(ne(seoIndexObservations.status, "failed"))
          .orderBy(asc(seoIndexObservations.contentEntryId), asc(seoIndexObservations.source), desc(seoIndexObservations.checkedAt)),
      ]);
      const items = entries.map(entry => {
        const path = entryPath(entry)!;
        const state = (source: "yandex" | "google") => {
          const lastAttempt = attempts.find(r => r.contentEntryId === entry.id && r.source === source) ?? null;
          const lastSuccess = successes.find(r => r.contentEntryId === entry.id && r.source === source) ?? null;
          return { lastAttempt, lastSuccess, stale: !lastSuccess || lastSuccess.publishedVersion !== entry.version
            || lastSuccess.pagePath !== path || +now - +lastSuccess.checkedAt > 36 * 3600000 };
        };
        return { id: entry.id, title: entry.title, kind: entry.kind, pagePath: path, version: entry.version,
          updatedAt: entry.updatedAt, indexable: entry.indexable, keywords: keywords.filter(q => q.targetPath === path),
          yandex: state("yandex"), google: state("google") };
      }).filter(entry => !input.pagePath || entry.pagePath === input.pagePath);
      const summary = (source: "yandex" | "google") => {
        const eligible = items.filter(p => p.indexable);
        const completed = eligible.filter(p => !p[source].stale && p[source].lastAttempt?.status !== "failed");
        const freshEvidence = eligible.filter(p => !p[source].stale);
        return { planned: eligible.length, completed: completed.length,
          confirmedIndexed: freshEvidence.filter(p => p[source].lastSuccess?.status === "indexed").length,
          excluded: freshEvidence.filter(p => p[source].lastSuccess?.status === "excluded").length,
          canonicalConflicts: freshEvidence.filter(p => p[source].lastSuccess?.status === "canonical_conflict").length,
          unconfirmed: freshEvidence.filter(p => ["unconfirmed", "not_indexed"].includes(p[source].lastSuccess!.status)).length,
          failed: eligible.filter(p => p[source].lastAttempt?.status === "failed").length,
          uncheckedOrStale: eligible.filter(p => p[source].stale).length };
      };
      return { items: items.slice(offset, offset + input.limit), total: items.length,
        nextCursor: items.length > offset + input.limit ? String(offset + input.limit) : null,
        summary: { yandex: summary("yandex"), google: summary("google"), intentionallyExcluded: items.filter(p => !p.indexable).length,
          withoutKeywords: items.filter(p => p.indexable && !p.keywords.length).length } };
    },
  };
}

export type PageControlReport = Awaited<ReturnType<ReturnType<typeof createPageControlRepository>["listPages"]>>;
