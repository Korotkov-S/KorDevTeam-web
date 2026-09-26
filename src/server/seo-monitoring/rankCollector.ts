import type { NormalizedRankCheck } from "./contracts";
import type { YandexRankResult } from "./providers/yandexSearch";
import { SeoProviderError } from "./providers/provider-error";

type RankStatus = "success" | "partial" | "failed";
type Device = "desktop" | "mobile";
type Repository = {
  withRankLock<T>(work: () => Promise<T>): Promise<T>;
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
type Provider = { search(query: string, regionId: number, device: Device): Promise<YandexRankResult> };
type Logger = { write(record: Record<string, unknown>): void };

const DEVICES: Device[] = ["desktop", "mobile"];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

export function createSeoRankCollector(dependencies: {
  repository: Repository;
  provider: Provider;
  dailyCheckLimit: number;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: Logger;
}) {
  const clock = dependencies.clock ?? (() => new Date());
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = dependencies.random ?? Math.random;
  const logger = dependencies.logger ?? { write: (record) => console.info(JSON.stringify(record)) };

  return {
    async run() {
      const checkDate = isoDate(clock());
      return dependencies.repository.withRankLock(async () => {
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
        for (const query of selectedQueries) {
          for (const region of regions) {
            const regionId = Number(region.externalId);
            if (!Number.isSafeInteger(regionId) || regionId < 1) {
              errors.push("seo_yandex_search_region_invalid");
              continue;
            }
            for (const device of DEVICES) {
              try {
                const result = await retry(() => dependencies.provider.search(query.queryText, regionId, device), sleep, random);
                const row: NormalizedRankCheck = {
                  checkDate,
                  checkedAt: clock(),
                  queryId: query.id,
                  regionId: region.id,
                  device,
                  ...result,
                };
                storedCount += await dependencies.repository.upsertRankChecks([row]);
                completedCount++;
              } catch (error) {
                errors.push(safeError(error).code);
              }
            }
          }
        }
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
