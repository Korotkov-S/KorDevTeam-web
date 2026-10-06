import { and, asc, desc, eq, gte, lte, sql, getTableColumns } from "drizzle-orm";
import type { createDb } from "../db/client";
import {
  seoRankJobs,
  seoRankSubmissions,
  seoRankRuns,
  seoRankChecks,
  seoQueries,
  seoRegions,
} from "../db/schema";
import {
  moscowDate,
  rankWeek,
  summarizeRankPlan,
  type RankPlan,
} from "./rankQueue";
import type { YandexRankResult } from "./providers/yandexSearch";
import { createSeoRepository } from "./repository";

export function createRankQueueRepository(db: ReturnType<typeof createDb>) {
  const loadJobs = (runId: string) =>
    db
      .select()
      .from(seoRankJobs)
      .where(eq(seoRankJobs.runId, runId))
      .orderBy(asc(seoRankJobs.id));
  const repository = {
    withRankLock: createSeoRepository(db).withRankLock,
    async getOrCreatePlan({
      now,
      dailyLimit,
      resumeOnly,
    }: {
      now: Date;
      dailyLimit: number;
      resumeOnly: boolean;
    }): Promise<RankPlan | null> {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('seo-rank-plan'))`,
        );
        const week = rankWeek(now);
        const [existing] = await tx
          .select()
          .from(seoRankRuns)
          .where(
            resumeOnly
              ? lte(seoRankRuns.startedAt, now)
              : and(
                  gte(seoRankRuns.checkDate, week.from),
                  lte(seoRankRuns.checkDate, week.to),
                ),
          )
          .orderBy(desc(seoRankRuns.startedAt))
          .limit(1);
        let run = existing;
        if (!run) {
          if (resumeOnly) return null;
          const queries = await tx
            .select()
            .from(seoQueries)
            .where(eq(seoQueries.tracked, true))
            .orderBy(
              desc(seoQueries.priority),
              sql`case ${seoQueries.kind} when 'commercial' then 0 when 'informational' then 1 else 2 end`,
              asc(seoQueries.createdAt),
              asc(seoQueries.id),
            );
          const regions = await tx
            .select()
            .from(seoRegions)
            .where(
              and(
                eq(seoRegions.source, "yandex_webmaster"),
                eq(seoRegions.active, true),
              ),
            )
            .orderBy(asc(seoRegions.sortOrder));
          const size = regions.length * 2;
          const capacity = size ? Math.floor(dailyLimit / size) : 0;
          const groupCount = capacity && queries.length
            ? Math.ceil(queries.length / capacity) : 0;
          const groupSize = groupCount ? Math.ceil(queries.length / groupCount) : 0;
          // Stable, balanced groups preserve comparable matrices across rotations.
          // Use durable plans (not successful checks): a failed platform must not
          // starve the remaining catalog, and recovery keeps its original jobs.
          const history = groupCount > 1 ? await tx
            .select({ queryId: seoRankJobs.queryId, lastPlanned: sql<string>`max(${seoRankRuns.startedAt})` })
            .from(seoRankJobs)
            .innerJoin(seoRankRuns, eq(seoRankRuns.id, seoRankJobs.runId))
            .where(lte(seoRankRuns.startedAt, now))
            .groupBy(seoRankJobs.queryId) : [];
          const lastPlanned = new Map(history.map(row => [row.queryId, new Date(row.lastPlanned).getTime()]));
          const groups = Array.from({ length: groupCount }, (_, index) => {
            const members = queries.slice(index * groupSize, (index + 1) * groupSize);
            return { index, members, lastPlanned: Math.max(0, ...members.map(q => lastPlanned.get(q.id) ?? 0)) };
          });
          groups.sort((a, b) => a.lastPlanned - b.lastPlanned || a.index - b.index);
          const selected = groups[0]?.members ?? [];
          const errorCode =
            queries.length && (!size || size > dailyLimit)
              ? "seo_yandex_search_daily_limit_too_low"
              : null;
          [run] = await tx
            .insert(seoRankRuns)
            .values({
              checkDate: moscowDate(now),
              startedAt: now,
              plannedCount: selected.length * size,
              status: errorCode
                ? "failed"
                : selected.length
                  ? "running"
                  : "success",
              errorCode,
              metadata: {
                queueVersion: 1,
                availableQueryCount: queries.length,
                selectedQueryCount: selected.length,
                omittedQueryCount: queries.length - selected.length,
                dailyCheckLimit: dailyLimit,
                selectionPolicy: "balanced_weekly_rotation",
                rotationGroupCount: groupCount,
                rotationGroupIndex: groups[0]?.index ?? null,
                rotationCycleDays: groupCount * 7,
              },
            })
            .returning();
          const jobs = selected.flatMap((q) =>
            regions.flatMap((r) =>
              (["desktop", "mobile"] as const).map((device) => ({
                runId: run.id,
                queryId: q.id,
                queryText: q.queryText,
                targetPath: q.targetPath,
                regionId: r.id,
                externalRegionId: Number(r.externalId),
                device,
                nextAttemptAt: now,
              })),
            ),
          );
          if (jobs.length) await tx.insert(seoRankJobs).values(jobs);
        }
        const jobs = await tx
          .select()
          .from(seoRankJobs)
          .where(eq(seoRankJobs.runId, run.id))
          .orderBy(asc(seoRankJobs.id));
        return {
          runId: run.id,
          checkDate: run.checkDate,
          startedAt: run.startedAt,
          expiresAt: new Date(run.startedAt.getTime() + 48 * 3600000),
          jobs,
          quotaMetadata: run.metadata,
        };
      });
    },
    async listDueJobs(runId: string, now: Date, options: { allowBudgetResume?: boolean } = {}) {
      return db
        .select({ ...getTableColumns(seoRankJobs), operationExpiresAt: sql<Date | null>`
          (select max(s.reserved_at) + interval '12 hours' from seo_rank_submissions s where s.job_id = seo_rank_jobs.id)
        `.mapWith((value: string | null) => value === null ? null : new Date(value)) })
        .from(seoRankJobs)
        .where(
          and(
            eq(seoRankJobs.runId, runId),
            sql`${seoRankJobs.state} IN ('queued','polling','retry_wait')`,
            sql`(${seoRankJobs.nextAttemptAt} IS NULL OR ${seoRankJobs.nextAttemptAt} <= ${now}
              OR (${options.allowBudgetResume === true} AND ${seoRankJobs.errorCode} = 'seo_rank_daily_budget_exhausted' AND ${seoRankJobs.operationId} IS NULL))`,
          ),
        )
        .orderBy(asc(seoRankJobs.id));
    },
    async reserveSubmission(jobId: string, now: Date, dailyLimit: number) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('seo-rank-budget'))`,
        );
        const [job] = await tx
          .select()
          .from(seoRankJobs)
          .where(eq(seoRankJobs.id, jobId))
          .for("update");
        if (
          !job ||
          job.operationId ||
          !["queued", "retry_wait"].includes(job.state)
        )
          return false;
        const [count] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(seoRankSubmissions)
          .where(eq(seoRankSubmissions.budgetDate, moscowDate(now)));
        if (count.n >= dailyLimit) return false;
        await tx.insert(seoRankSubmissions).values({
          jobId,
          attempt: job.submitAttempts + 1,
          budgetDate: moscowDate(now),
          reservedAt: now,
        });
        await tx
          .update(seoRankJobs)
          .set({
            state: "submitting",
            submitAttempts: job.submitAttempts + 1,
            nextAttemptAt: null,
            errorCode: null,
          })
          .where(eq(seoRankJobs.id, jobId));
        return true;
      });
    },
    async saveOperation(jobId: string, operationId: string, now: Date) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(operationId))
        throw new Error("seo_rank_operation_invalid");
      const rows = await db
        .update(seoRankJobs)
        .set({
          state: "polling",
          operationId,
          nextAttemptAt: now,
          errorCode: null,
        })
        .where(
          and(eq(seoRankJobs.id, jobId), eq(seoRankJobs.state, "submitting")),
        )
        .returning();
      if (!rows.length) throw new Error("seo_rank_transition_invalid");
    },
    async saveResult(jobId: string, result: YandexRankResult, now: Date) {
      await db.transaction(async (tx) => {
        const [job] = await tx
          .select()
          .from(seoRankJobs)
          .where(eq(seoRankJobs.id, jobId))
          .for("update");
        if (!job) throw new Error("seo_rank_job_missing");
        if (job.state === "stored") return;
        if (!job.operationId || !["polling", "retry_wait"].includes(job.state))
          throw new Error("seo_rank_transition_invalid");
        const [run] = await tx
          .select()
          .from(seoRankRuns)
          .where(eq(seoRankRuns.id, job.runId));
        await tx
          .insert(seoRankChecks)
          .values({
            ...result,
            checkDate: run.checkDate,
            checkedAt: now,
            queryId: job.queryId,
            regionId: job.regionId,
            device: job.device,
          })
          .onConflictDoNothing();
        await tx
          .update(seoRankJobs)
          .set({
            state: "stored",
            checkedAt: now,
            errorCode: null,
            nextAttemptAt: null,
          })
          .where(eq(seoRankJobs.id, jobId));
      });
    },
    async deferJob(
      jobId: string,
      input: {
        stage: "submit" | "poll";
        nextAttemptAt: Date;
        errorCode: string | null;
        expectedState?: string;
      },
    ) {
      await db
        .update(seoRankJobs)
        .set({
          state: input.errorCode ? "retry_wait" : "polling",
          nextAttemptAt: input.nextAttemptAt,
          errorCode: input.errorCode,
          ...(input.stage === "poll" && input.errorCode
            ? { pollErrorAttempts: sql`${seoRankJobs.pollErrorAttempts}+1` }
            : {}),
        })
        .where(
          and(
            eq(seoRankJobs.id, jobId),
            input.expectedState
              ? eq(seoRankJobs.state, input.expectedState)
              : input.stage === "submit"
                ? sql`${seoRankJobs.state} IN ('queued','retry_wait') AND ${seoRankJobs.operationId} IS NULL`
                : sql`${seoRankJobs.state} IN ('polling','retry_wait') AND ${seoRankJobs.operationId} IS NOT NULL`,
          ),
        );
    },
    async blockJob(jobId: string, errorCode: string) {
      await db
        .update(seoRankJobs)
        .set({ state: "blocked", errorCode, nextAttemptAt: null })
        .where(eq(seoRankJobs.id, jobId));
    },
    async expirePlan(runId: string, _now: Date) {
      await db
        .update(seoRankJobs)
        .set({
          state: "expired",
          errorCode: "seo_rank_plan_expired",
          nextAttemptAt: null,
        })
        .where(
          and(
            eq(seoRankJobs.runId, runId),
            sql`${seoRankJobs.state} NOT IN ('stored','blocked','expired')`,
          ),
        );
    },
    async recoverSubmitting(runId: string) {
      await db
        .update(seoRankJobs)
        .set({ state: "blocked", errorCode: "seo_rank_submission_uncertain" })
        .where(
          and(
            eq(seoRankJobs.runId, runId),
            eq(seoRankJobs.state, "submitting"),
          ),
        );
    },
    async recoverPollFailures(runId: string, now: Date) {
      // Only known IDs stopped by the old GET retry cap. Never reopen an uncertain POST.
      await db.update(seoRankJobs).set({ state: "polling", errorCode: null, nextAttemptAt: now }).where(and(
        eq(seoRankJobs.runId, runId), eq(seoRankJobs.state, "blocked"),
        eq(seoRankJobs.errorCode, "seo_yandex_search_retryable"),
        sql`${seoRankJobs.operationId} IS NOT NULL`,
        sql`${now} < (select max(s.reserved_at) + interval '12 hours' from seo_rank_submissions s where s.job_id = seo_rank_jobs.id)`,
      ));
    },
    async summarizePlan(runId: string) {
      const [run] = await db
        .select()
        .from(seoRankRuns)
        .where(eq(seoRankRuns.id, runId));
      if (!run) throw new Error("seo_rank_run_missing");
      return summarizeRankPlan(run, await loadJobs(runId));
    },
    async finishPass(runId: string, now: Date) {
      const progress = await repository.summarizePlan(runId);
      await db
        .update(seoRankRuns)
        .set({
          status: progress.status,
          completedCount: progress.completedCount,
          storedCount: progress.storedCount,
          errorCode: progress.errorCode,
          completedAt: progress.retryable ? null : now,
        })
        .where(eq(seoRankRuns.id, runId));
      return progress;
    },
    async getRankProgress({ dateTo }: { dateTo: string }) {
      const [run] = await db
        .select()
        .from(seoRankRuns)
        .where(lte(seoRankRuns.checkDate, dateTo))
        .orderBy(desc(seoRankRuns.checkDate), desc(seoRankRuns.startedAt))
        .limit(1);
      return run ? repository.summarizePlan(run.id) : null;
    },
  };
  return repository;
}
