import type { createRankQueueRepository } from "./rankQueueRepository";
import type { YandexRankResult } from "./providers/yandexSearch";
import { SeoProviderError } from "./providers/provider-error";
import {
  isSubmissionWindow,
  nextRetryAt,
  planExpired,
  nextSubmissionWindow,
} from "./rankRecoveryPolicy";

export function createSeoRankCollector(dependencies: {
  repository: ReturnType<typeof createRankQueueRepository>;
  provider: {
    startSearch(
      query: string,
      region: number,
      device: "desktop" | "mobile",
    ): Promise<string>;
    pollSearch(id: string): Promise<YandexRankResult | null>;
  };
  dailyCheckLimit: number;
  clock?: () => Date;
  logger?: { write(record: Record<string, unknown>): void };
}) {
  const clock = dependencies.clock ?? (() => new Date()),
    repo = dependencies.repository;
  return {
    async run(options: { resumeOnly?: boolean } = {}) {
      return repo.withRankLock(async () => {
        const plan = await repo.getOrCreatePlan({
          now: clock(),
          dailyLimit: dependencies.dailyCheckLimit,
          resumeOnly: options.resumeOnly ?? false,
        });
        if (!plan)
          return {
            source: "yandex_search" as const,
            status: "skipped" as const,
            plannedCount: 0,
            completedCount: 0,
            storedCount: 0,
          };
        await repo.recoverSubmitting(plan.runId);
        if (planExpired(plan, clock()))
          await repo.expirePlan(plan.runId, clock());
        const jobs = await repo.listDueJobs(plan.runId, clock());
        let index = 0;
        await Promise.all(
          Array.from({ length: Math.min(8, jobs.length) }, async () => {
            while (index < jobs.length) {
              const job = jobs[index++];
              let operationId = job.operationId;
              if (planExpired(plan, clock())) break;
              if (!operationId) {
                if (!isSubmissionWindow(clock())) {
                  await repo.deferJob(job.id, {
                    stage: "submit",
                    nextAttemptAt: nextSubmissionWindow(clock()),
                    errorCode: "seo_rank_waiting_night_window",
                  });
                  continue;
                }
                if (
                  !(await repo.reserveSubmission(
                    job.id,
                    clock(),
                    dependencies.dailyCheckLimit,
                  ))
                ) {
                  await repo.deferJob(job.id, {
                    stage: "submit",
                    nextAttemptAt: nextSubmissionWindow(clock()),
                    errorCode: "seo_rank_daily_budget_exhausted",
                  });
                  continue;
                }
                try {
                  operationId = await dependencies.provider.startSearch(
                    job.queryText,
                    job.externalRegionId,
                    job.device as "desktop" | "mobile",
                  );
                } catch (error) {
                  if (
                    error instanceof SeoProviderError &&
                    error.message === "seo_rank_submit_rejected" &&
                    job.submitAttempts + 1 < 4
                  )
                    await repo.deferJob(job.id, {
                      stage: "submit",
                      nextAttemptAt: nextRetryAt({
                        now: clock(),
                        attempt: job.submitAttempts + 1,
                        retryAfterSeconds: error.retryAfterSeconds,
                      }),
                      errorCode: error.message,
                    });
                  else
                    await repo.blockJob(
                      job.id,
                      error instanceof SeoProviderError
                        ? error.message
                        : "seo_rank_submission_uncertain",
                    );
                  continue;
                }
                // Never catch a persistence failure as a rejected submission. Next pass fences submitting as uncertain.
                await repo.saveOperation(job.id, operationId, clock());
              }
              if (planExpired(plan, clock())) break;
              let result: YandexRankResult | null;
              try {
                result = await dependencies.provider.pollSearch(operationId);
              } catch (error) {
                const code =
                  error instanceof SeoProviderError
                    ? error.message
                    : "seo_yandex_search_collection_failed";
                if (
                  error instanceof SeoProviderError &&
                  error.retryable &&
                  job.pollErrorAttempts + 1 < 4
                )
                  await repo.deferJob(job.id, {
                    stage: "poll",
                    nextAttemptAt: nextRetryAt({
                      now: clock(),
                      attempt: job.pollErrorAttempts + 1,
                      retryAfterSeconds: error.retryAfterSeconds,
                    }),
                    errorCode: code,
                  });
                else await repo.blockJob(job.id, code);
                continue;
              }
              if (planExpired(plan, clock())) break;
              else if (result === null)
                await repo.deferJob(job.id, {
                  stage: "poll",
                  nextAttemptAt: new Date(clock().getTime() + 120000),
                  errorCode: null,
                });
              else await repo.saveResult(job.id, result, clock());
            }
          }),
        );
        if (planExpired(plan, clock()))
          await repo.expirePlan(plan.runId, clock());
        const progress = await repo.finishPass(plan.runId, clock());
        dependencies.logger?.write({
          event: "seo_rank_collection_finished",
          source: "yandex_search",
          ...progress,
        });
        return { source: "yandex_search" as const, ...progress };
      });
    },
  };
}
