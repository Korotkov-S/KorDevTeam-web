import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { contentEntries, seoChanges, seoChangeEvaluations, seoCollectionRuns, seoDailyMetrics, seoIndexObservations, seoQueries, seoRegions } from "../db/schema";
import { entryPath } from "../seo/sitemaps";
import { evaluateSeoEffect, seoEffectWindows, type EffectSource, type EffectResult } from "./effects";
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
        const historyOrder = [asc(seoChangeEvaluations.evaluatedAt), asc(seoChangeEvaluations.createdAt), asc(seoChangeEvaluations.id)];
        const runFields = { id: seoCollectionRuns.id, status: seoCollectionRuns.status, requestedFrom: seoCollectionRuns.requestedFrom,
          requestedTo: seoCollectionRuns.requestedTo, startedAt: seoCollectionRuns.startedAt, completedAt: seoCollectionRuns.completedAt };
        // The evaluator historically compares Date/ISO millisecond values, not native microseconds.
        const eligibleRun = or(isNull(seoCollectionRuns.completedAt), lt(seoCollectionRuns.completedAt, new Date(+now + 1)));
        // Freshness is global to the source, even when its newest attempt requests another period.
        async function latestRun(source: EffectSource) {
          return (await tx.select(runFields).from(seoCollectionRuns).where(and(eq(seoCollectionRuns.source, source), eligibleRun))
            .orderBy(desc(sql`date_trunc('milliseconds', ${seoCollectionRuns.startedAt})`), desc(seoCollectionRuns.id)).limit(1))[0];
        }
        const latestRuns = new Map<EffectSource, Awaited<ReturnType<typeof latestRun>>>();
        for (const source of ["yandex_webmaster", "google_search_console"] as const) latestRuns.set(source, await latestRun(source));
        let inserted = 0, unchanged = 0;
        let cursor: string | undefined;
        while (true) {
          // Resolve the last key in PostgreSQL: mapping timestamptz through Date loses microseconds.
          const changes = await tx.select().from(seoChanges).where(cursor ? sql`(${seoChanges.appliedAt}, ${seoChanges.id}) >
            (select cursor_change.applied_at, cursor_change.id from seo_changes as cursor_change where cursor_change.id = ${cursor})` : undefined)
            .orderBy(asc(seoChanges.appliedAt), asc(seoChanges.id)).limit(25);
          if (!changes.length) break;
          for (const change of changes) {
            const [published] = change.contentEntryId ? await tx.select().from(contentEntries)
              .where(and(eq(contentEntries.id, change.contentEntryId), eq(contentEntries.status, "published"))).limit(1) : [];
            const entry = published && entryPath(published) === change.pagePath ? published : undefined;
            const queries = await tx.select({ id: seoQueries.id }).from(seoQueries).where(and(eq(seoQueries.status, "active"),
              eq(seoQueries.tracked, true), eq(seoQueries.targetPath, change.pagePath))).orderBy(asc(seoQueries.id));
            const currentCohort = queries.map(q => q.id);
            const subsequentChanges = (await tx.select({ appliedAt: seoChanges.appliedAt }).from(seoChanges).where(and(
              eq(seoChanges.pagePath, change.pagePath), ne(seoChanges.type, "other"), gte(seoChanges.appliedAt, new Date(+change.appliedAt + 1))))
              .orderBy(asc(seoChanges.appliedAt), asc(seoChanges.id))).map(c => c.appliedAt.toISOString());
            for (const source of ["yandex_webmaster", "google_search_console"] as EffectSource[]) {
              const historyScope = and(eq(seoChangeEvaluations.changeId, change.id), eq(seoChangeEvaluations.source, source));
              const [first] = await tx.select({ result: seoChangeEvaluations.result }).from(seoChangeEvaluations)
                .where(historyScope).orderBy(...historyOrder).limit(1);
              const cohort = first?.result.cohort ?? currentCohort;
              const window = seoEffectWindows(change.appliedAt.toISOString(), source, 28);
              const metrics = cohort.length ? await tx.select({ metric: seoDailyMetrics, region: seoRegions.code }).from(seoDailyMetrics)
                .innerJoin(seoRegions, eq(seoDailyMetrics.regionId, seoRegions.id)).where(and(eq(seoDailyMetrics.source, source),
                  eq(seoRegions.code, "ru"), eq(seoDailyMetrics.pagePath, change.pagePath), inArray(seoDailyMetrics.queryId, cohort),
                  gte(seoDailyMetrics.observationDate, window.before.from), lte(seoDailyMetrics.observationDate, window.after.to))) : [];
              const relevantRuns = await tx.select(runFields).from(seoCollectionRuns).where(and(eq(seoCollectionRuns.source, source), eligibleRun,
                lte(seoCollectionRuns.requestedFrom, window.after.to), gte(seoCollectionRuns.requestedTo, window.before.from)));
              const latest = latestRuns.get(source);
              if (latest && !relevantRuns.some(r => r.id === latest.id)) relevantRuns.push(latest);
              const runs = relevantRuns.map(r => ({ ...r, startedAt: r.startedAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null }));
              const [index] = entry ? await tx.select().from(seoIndexObservations).where(and(eq(seoIndexObservations.contentEntryId, entry.id),
                eq(seoIndexObservations.source, source === "yandex_webmaster" ? "yandex" : "google")))
                .orderBy(desc(seoIndexObservations.checkedAt)).limit(1) : [];
              for (const checkpoint of [7, 14, 28] as const) {
                const [previous] = await tx.select({ result: seoChangeEvaluations.result }).from(seoChangeEvaluations).where(and(historyScope,
                  eq(seoChangeEvaluations.checkpoint, checkpoint), sql`${seoChangeEvaluations.result}->'baseline'->>'complete' = 'true'`))
                  .orderBy(...historyOrder).limit(1);
                const baseline = previous?.result.baseline;
                const result = evaluateSeoEffect({ source, checkpoint, now: now.toISOString(),
                  change: { id: change.id, pagePath: change.pagePath, type: change.type, appliedAt: change.appliedAt.toISOString(), contentVersion: change.contentVersion },
                  publication: entry ? { pagePath: entryPath(entry)!, version: entry.version, indexable: entry.indexable } : null,
                  cohort, currentCohort, baseline, runs,
                  index: index ? { status: index.status, checkedAt: index.checkedAt.toISOString(), publishedVersion: index.publishedVersion, pagePath: index.pagePath,
                    technical: { httpStatus: index.evidence.httpStatus ?? null, canonical: index.evidence.canonical ?? null,
                      noindex: index.evidence.noindex ?? null, robotsAllowed: index.evidence.robotsAllowed ?? null, errorCode: index.evidence.technicalErrorCode ?? null },
                    lastCrawlAt: typeof index.evidence.lastCrawlAt === "string" ? index.evidence.lastCrawlAt : null } : null,
                  metrics: metrics.map(({ metric: r, region }) => ({ queryId: r.queryId, date: r.observationDate,
                    regionCode: region, device: r.device, impressions: r.impressions, clicks: r.clicks, averagePosition: Number(r.averagePosition) })),
                  subsequentChanges,
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
          cursor = changes[changes.length - 1].id;
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
