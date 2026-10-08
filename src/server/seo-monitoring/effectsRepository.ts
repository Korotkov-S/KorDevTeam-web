import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { contentEntries, seoChanges, seoChangeEvaluations, seoCollectionRuns, seoDailyMetrics, seoIndexObservations, seoQueries, seoRegions } from "../db/schema";
import { entryPath } from "../seo/sitemaps";
import { evaluateSeoEffect, type EffectSource, type EffectResult } from "./effects";
import type { SeoDatabase } from "./repository";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export type EffectListInput = { pagePath?: string; changeId?: string; history?: boolean; limit: number; cursor: string | null };
export function createSeoEffectsRepository(db: SeoDatabase) {
  return {
    async evaluateAll(now = new Date()) {
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(706009)`);
        for (const source of ["google_search_console", "yandex_webmaster"]) {
          const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${'seo-collector:' + source})) as acquired`);
          if (lock.rows[0]?.acquired !== true) throw Error("seo_source_locked");
        }
        const changes = await tx.select().from(seoChanges).orderBy(asc(seoChanges.appliedAt), asc(seoChanges.id));
        const publications = await tx.select().from(contentEntries).where(eq(contentEntries.status, "published"));
        const queries = await tx.select().from(seoQueries).where(and(eq(seoQueries.status, "active"), eq(seoQueries.tracked, true))).orderBy(asc(seoQueries.id));
        const history = await tx.select().from(seoChangeEvaluations).orderBy(asc(seoChangeEvaluations.evaluatedAt), asc(seoChangeEvaluations.createdAt), asc(seoChangeEvaluations.id));
        const allRuns = await tx.select().from(seoCollectionRuns);
        const indices = await tx.selectDistinctOn([seoIndexObservations.contentEntryId, seoIndexObservations.source]).from(seoIndexObservations)
          .orderBy(asc(seoIndexObservations.contentEntryId), asc(seoIndexObservations.source), desc(seoIndexObservations.checkedAt));
        let inserted = 0, unchanged = 0;
        for (const source of ["yandex_webmaster", "google_search_console"] as EffectSource[]) {
          const metrics = await tx.select({ metric: seoDailyMetrics, region: seoRegions.code }).from(seoDailyMetrics)
            .innerJoin(seoRegions, eq(seoDailyMetrics.regionId, seoRegions.id)).where(and(eq(seoDailyMetrics.source, source), eq(seoRegions.code, "ru")));
          const runs = allRuns.filter(r => r.source === source).map(r => ({ id: r.id, status: r.status, requestedFrom: r.requestedFrom, requestedTo: r.requestedTo,
            startedAt: r.startedAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null }));
          for (const change of changes) {
            const previous = history.filter(h => h.changeId === change.id && h.source === source);
            const currentCohort = queries.filter(q => q.targetPath === change.pagePath).map(q => q.id);
            const cohort = previous[0]?.result.cohort ?? currentCohort;
            const entry = publications.find(e => entryPath(e) === change.pagePath);
            const index = entry && indices.find(i => i.contentEntryId === entry.id && i.source === (source === "yandex_webmaster" ? "yandex" : "google"));
            for (const checkpoint of [7, 14, 28] as const) {
              const baseline = previous.find(h => h.checkpoint === checkpoint && h.result.baseline.complete)?.result.baseline;
              const result = evaluateSeoEffect({ source, checkpoint, now: now.toISOString(),
                change: { id: change.id, pagePath: change.pagePath, type: change.type, appliedAt: change.appliedAt.toISOString(), contentVersion: change.contentVersion },
                publication: entry ? { pagePath: entryPath(entry)!, version: entry.version, indexable: entry.indexable } : null,
                cohort, currentCohort, baseline, runs,
                index: index ? { status: index.status, checkedAt: index.checkedAt.toISOString(), publishedVersion: index.publishedVersion, pagePath: index.pagePath,
                  lastCrawlAt: typeof index.evidence.lastCrawlAt === "string" ? index.evidence.lastCrawlAt : null } : null,
                metrics: metrics.filter(r => r.metric.pagePath === change.pagePath).map(({ metric: r, region }) => ({ queryId: r.queryId, date: r.observationDate,
                  regionCode: region, device: r.device, impressions: r.impressions, clicks: r.clicks, averagePosition: Number(r.averagePosition) })),
                subsequentChanges: changes.filter(c => c.pagePath === change.pagePath && +c.appliedAt > +change.appliedAt).map(c => c.appliedAt.toISOString()),
              });
              // Capture times document the first persisted attempt, not a reason to duplicate identical evidence.
              const digestInput = { ...result, baseline: { ...result.baseline, capturedAt: null } };
              const evidenceHash = createHash("sha256").update(stable(digestInput)).digest("hex");
              const saved = await tx.insert(seoChangeEvaluations).values({ changeId: change.id, source, checkpoint, evaluatedAt: now, evidenceHash, result })
                .onConflictDoNothing().returning({ id: seoChangeEvaluations.id });
              if (saved.length) inserted++; else unchanged++;
            }
          }
        }
        return { inserted, unchanged };
      });
    },
    async list(input: EffectListInput) {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw Error("seo_limit_invalid");
      if (input.cursor !== null && (!/^\d+$/.test(input.cursor) || !Number.isSafeInteger(Number(input.cursor)))) throw Error("seo_cursor_invalid");
      if (input.history && !input.changeId) throw Error("seo_effect_history_change_required");
      const conditions = [input.pagePath ? eq(seoChanges.pagePath, input.pagePath) : undefined,
        input.changeId ? eq(seoChangeEvaluations.changeId, input.changeId) : undefined];
      const fields = { id: seoChangeEvaluations.id, changeId: seoChangeEvaluations.changeId, source: seoChangeEvaluations.source,
        checkpoint: seoChangeEvaluations.checkpoint, evaluatedAt: seoChangeEvaluations.evaluatedAt, result: seoChangeEvaluations.result,
        pagePath: seoChanges.pagePath, summary: seoChanges.summary, appliedAt: seoChanges.appliedAt };
      const ordering = [desc(seoChangeEvaluations.evaluatedAt), desc(seoChangeEvaluations.createdAt), desc(seoChangeEvaluations.id)];
      const query = input.history ? db.select(fields).from(seoChangeEvaluations)
        : db.selectDistinctOn([seoChangeEvaluations.changeId, seoChangeEvaluations.source, seoChangeEvaluations.checkpoint], fields).from(seoChangeEvaluations);
      const rows = await query.innerJoin(seoChanges, eq(seoChangeEvaluations.changeId, seoChanges.id)).where(and(...conditions))
        .orderBy(...(input.history ? ordering : [asc(seoChangeEvaluations.changeId), asc(seoChangeEvaluations.source), asc(seoChangeEvaluations.checkpoint), ...ordering]))
        .limit(input.limit + 1).offset(Number(input.cursor ?? 0));
      return { items: rows.slice(0, input.limit), nextCursor: rows.length > input.limit ? String(Number(input.cursor ?? 0) + input.limit) : null };
    },
  };
}
export type ChangeEffectRow = { id: string; changeId: string; source: string; checkpoint: number; evaluatedAt: Date | string;
  result: EffectResult; pagePath: string; summary: string; appliedAt: Date | string };
