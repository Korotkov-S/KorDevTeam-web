import type { NormalizedRankCheck } from "./contracts";
import type { YandexRankResult } from "./providers/yandexSearch";
import { SeoProviderError } from "./providers/provider-error";

type RankStatus = "success" | "partial" | "failed";
type Device = "desktop" | "mobile";
type Repository = {
  withRankLock<T>(work: () => Promise<T>): Promise<T>;
  hasRankRunInWindow(dateFrom: string, dateTo: string): Promise<boolean>;
  listTrackedQueries(): Promise<Array<{ id: string; queryText: string }>>;
  listRankRegions(): Promise<Array<{ id: string; externalId: string; displayName: string }>>;
  startRankRun(checkDate: string, plannedCount: number): Promise<{ id: string }>;
  finishRankRun(id: string, status: RankStatus, result: {
    completedCount: number;
    storedCount: number;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  upsertRankChecks(rows: readonly NormalizedRankCheck[]): Promise<number>;
};
type Provider = {
  startSearch(query: string, regionId: number, device: Device): Promise<string>;
  pollSearch(operationId: string): Promise<YandexRankResult | null>;
};
type Logger = { write(record: Record<string, unknown>): void };

const DEVICES: Device[] = ["desktop", "mobile"];

function isoDate(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function rankWeekWindow(date: Date): { dateFrom: string; dateTo: string } {
  const moscow = new Date(date.getTime() + 3 * 60 * 60 * 1_000);
  const daysSinceMonday = (moscow.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() - daysSinceMonday));
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1_000);
  return { dateFrom: monday.toISOString().slice(0, 10), dateTo: sunday.toISOString().slice(0, 10) };
}

function safeError(error: unknown): { code: string; retryable: boolean; retryAfterSeconds?: number } {
  if (error instanceof SeoProviderError) {
    return { code: error.message, retryable: error.retryable,
      ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }) };
  }
  if (error instanceof Error && error.message === "seo_rank_locked") return { code: error.message, retryable: false };
  return { code: "seo_yandex_search_collection_failed", retryable: false };
}

async function retry<T>(operation: () => Promise<T>, sleep: (ms: number) => Promise<void>, random: () => number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const safe = safeError(error);
      if (!safe.retryable || attempt >= 2) throw error;
      const exponential = Math.min(10_000, 500 * (2 ** attempt));
      const delay = safe.retryAfterSeconds === undefined
        ? Math.round(exponential * (0.5 + Math.max(0, Math.min(1, random()))))
        : safe.retryAfterSeconds * 1_000;
      await sleep(Math.min(30_000, Math.max(0, delay)));
    }
  }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export function createSeoRankCollector(dependencies: {
  repository: Repository;
  provider: Provider;
  dailyCheckLimit: number;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: Logger;
  submitConcurrency?: number;
  pollConcurrency?: number;
  pollIntervalMs?: number;
  maxPollCycles?: number;
}) {
  const clock = dependencies.clock ?? (() => new Date());
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = dependencies.random ?? Math.random;
  const logger = dependencies.logger ?? { write: (record) => console.info(JSON.stringify(record)) };
  const submitConcurrency = dependencies.submitConcurrency ?? 16;
  const pollConcurrency = dependencies.pollConcurrency ?? 32;
  const pollIntervalMs = dependencies.pollIntervalMs ?? 120_000;
  const maxPollCycles = dependencies.maxPollCycles ?? 180;

  return {
    async run() {
      const startedAt = clock();
      const checkDate = isoDate(startedAt);
      const week = rankWeekWindow(startedAt);
      return dependencies.repository.withRankLock(async () => {
        if (await dependencies.repository.hasRankRunInWindow(week.dateFrom, week.dateTo)) {
          logger.write({ event: "seo_rank_collection_skipped", source: "yandex_search", reason: "weekly_run_already_started",
            checkDate, dateFrom: week.dateFrom, dateTo: week.dateTo });
          return { source: "yandex_search" as const, status: "skipped" as const, plannedCount: 0,
            completedCount: 0, storedCount: 0, checkDate, reason: "weekly_run_already_started" as const };
        }
        const [queries, regions] = await Promise.all([
          dependencies.repository.listTrackedQueries(),
          dependencies.repository.listRankRegions(),
        ]);
        const checksPerQuery = regions.length * DEVICES.length;
        const selectedQueryCount = checksPerQuery === 0 ? 0 : Math.min(queries.length, Math.floor(dependencies.dailyCheckLimit / checksPerQuery));
        const selectedQueries = queries.slice(0, selectedQueryCount);
        const quotaMetadata = {
          availableQueryCount: queries.length,
          selectedQueryCount,
          omittedQueryCount: queries.length - selectedQueryCount,
          dailyCheckLimit: dependencies.dailyCheckLimit,
        };
        const plannedCount = selectedQueries.length * checksPerQuery;
        const run = await dependencies.repository.startRankRun(checkDate, plannedCount);
        if (queries.length > 0 && checksPerQuery > dependencies.dailyCheckLimit) {
          const errorCode = "seo_yandex_search_daily_limit_too_low";
          await dependencies.repository.finishRankRun(run.id, "failed", {
            completedCount: 0,
            storedCount: 0,
            errorCode,
            metadata: { failedCount: 0, ...quotaMetadata },
          });
          logger.write({ event: "seo_rank_collection_finished", source: "yandex_search", status: "failed",
            plannedCount, completedCount: 0, storedCount: 0, errorCode });
          return { source: "yandex_search" as const, status: "failed" as const, plannedCount,
            completedCount: 0, storedCount: 0, checkDate, errorCode };
        }
        let completedCount = 0;
        let storedCount = 0;
        const errors: string[] = [];
        const jobs: Array<{
          query: { id: string; queryText: string };
          region: { id: string; externalId: string; displayName: string };
          regionId: number;
          device: Device;
        }> = [];
        for (const query of selectedQueries) {
          for (const region of regions) {
            const regionId = Number(region.externalId);
            if (!Number.isSafeInteger(regionId) || regionId < 1) {
              errors.push("seo_yandex_search_region_invalid");
              continue;
            }
            for (const device of DEVICES) {
              jobs.push({ query, region, regionId, device });
            }
          }
        }
        const submissions = await mapConcurrent(jobs, submitConcurrency, async (job) => {
          try {
            const id = await retry(() => dependencies.provider.startSearch(job.query.queryText, job.regionId, job.device), sleep, random);
            return { status: "pending" as const, job, operationId: id };
          } catch (error) {
            return { status: "failed" as const, errorCode: safeError(error).code };
          }
        });
        let pending = submissions.flatMap((submission) => {
          if (submission.status === "failed") {
            errors.push(submission.errorCode);
            return [];
          }
          return [submission];
        });
        for (let cycle = 0; pending.length > 0 && cycle < maxPollCycles; cycle++) {
          const polled = await mapConcurrent(pending, pollConcurrency, async (submission) => {
            try {
              const result = await retry(() => dependencies.provider.pollSearch(submission.operationId), sleep, random);
              return result === null ? { status: "pending" as const, submission }
                : { status: "complete" as const, submission, result };
            } catch (error) {
              return { status: "failed" as const, errorCode: safeError(error).code };
            }
          });
          const nextPending: typeof pending = [];
          for (const item of polled) {
            if (item.status === "pending") {
              nextPending.push(item.submission);
              continue;
            }
            if (item.status === "failed") {
              errors.push(item.errorCode);
              continue;
            }
            const { job } = item.submission;
            const row: NormalizedRankCheck = {
              checkDate,
              checkedAt: clock(),
              queryId: job.query.id,
              regionId: job.region.id,
              device: job.device,
              ...item.result,
            };
            storedCount += await dependencies.repository.upsertRankChecks([row]);
            completedCount++;
          }
          pending = nextPending;
          if (pending.length > 0 && cycle + 1 < maxPollCycles) await sleep(pollIntervalMs);
        }
        if (pending.length > 0) errors.push(...pending.map(() => "seo_yandex_search_operation_timeout"));
        const status: RankStatus = errors.length === 0 ? "success" : storedCount > 0 ? "partial" : "failed";
        await dependencies.repository.finishRankRun(run.id, status, {
          completedCount,
          storedCount,
          ...(errors[0] ? { errorCode: errors[0] } : {}),
          metadata: { failedCount: errors.length, ...quotaMetadata },
        });
        logger.write({ event: "seo_rank_collection_finished", source: "yandex_search", status,
          plannedCount, completedCount, storedCount, errorCode: errors[0] });
        return { source: "yandex_search" as const, status, plannedCount, completedCount, storedCount, checkDate,
          ...(errors[0] ? { errorCode: errors[0] } : {}) };
      });
    },
  };
}
