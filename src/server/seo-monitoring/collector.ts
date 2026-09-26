import type { NormalizedSeoObservation, SeoConfig, SeoDevice, SeoSourceId } from "./contracts";
import type { YandexRegion } from "./providers/yandex";
import { SeoProviderError } from "./providers/provider-error";

type Window = { from: string; to: string };
type SourceStatus = "disabled" | "success" | "partial" | "failed";

type CollectionSourceReport = {
  source: SeoSourceId;
  status: SourceStatus;
  receivedCount: number;
  storedCount: number;
  latestObservationDate: string | null;
  errorCode?: string;
};

type CollectorRepository = {
  setSourceEnabled(source: SeoSourceId, enabled: boolean): Promise<unknown>;
  withSourceLock<T>(source: SeoSourceId, work: () => Promise<T>): Promise<T>;
  startRun(source: SeoSourceId, from: string, to: string): Promise<{ id: string }>;
  finishRun(id: string, status: "success" | "partial" | "failed", result: {
    receivedCount: number;
    storedCount: number;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  upsertObservations(rows: readonly NormalizedSeoObservation[]): Promise<number>;
  syncYandexRegions(regions: readonly YandexRegion[]): Promise<Array<{
    code: string;
    displayName: string;
    externalId: string | null;
    active: boolean;
  }>>;
};

type YandexProvider = {
  check(): Promise<unknown>;
  listAvailableRegions(): Promise<YandexRegion[]>;
  collect(window: Window, region: YandexRegion, device: SeoDevice): Promise<NormalizedSeoObservation[]>;
};

type GoogleProvider = {
  check(): Promise<unknown>;
  collect(window: Window): Promise<NormalizedSeoObservation[]>;
};

type Logger = { write(record: Record<string, unknown>): void };

const DAY_MS = 86_400_000;
const YANDEX_DEVICES: SeoDevice[] = ["desktop", "mobile"];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function windowEnding(now: Date, lagDays: number, lengthDays = 14): Window {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - lagDays * DAY_MS);
  return { from: isoDate(new Date(+end - (lengthDays - 1) * DAY_MS)), to: isoDate(end) };
}

function safeError(error: unknown): { code: string; retryable: boolean; retryAfterSeconds?: number } {
  if (error instanceof SeoProviderError) {
    return { code: error.message, retryable: error.retryable,
      ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }) };
  }
  if (error instanceof Error && error.message === "seo_source_locked") return { code: error.message, retryable: false };
  return { code: "seo_collection_failed", retryable: false };
}

function latestDate(rows: readonly NormalizedSeoObservation[]): string | null {
  let latest: string | null = null;
  for (const row of rows) if (latest === null || row.observationDate > latest) latest = row.observationDate;
  return latest;
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

export function createSeoCollector(dependencies: {
  config: SeoConfig;
  repository: CollectorRepository;
  yandex?: YandexProvider;
  google?: GoogleProvider;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: Logger;
}) {
  const clock = dependencies.clock ?? (() => new Date());
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = dependencies.random ?? Math.random;
  const logger = dependencies.logger ?? { write: (record) => console.info(JSON.stringify(record)) };

  async function runYandex(): Promise<CollectionSourceReport> {
    const source = "yandex_webmaster" as const;
    const provider = dependencies.yandex;
    if (!provider) return { source, status: "failed", receivedCount: 0, storedCount: 0, latestObservationDate: null, errorCode: "seo_yandex_provider_missing" };
    const window = windowEnding(clock(), 3);
    return dependencies.repository.withSourceLock(source, async () => {
      const run = await dependencies.repository.startRun(source, window.from, window.to);
      let receivedCount = 0;
      let storedCount = 0;
      let latestObservationDate: string | null = null;
      const errors: string[] = [];
      try {
        const available = await retry(() => provider.listAvailableRegions(), sleep, random);
        const desired = await dependencies.repository.syncYandexRegions(available);
        const names = new Map(available.map((region) => [String(region.id), region]));
        for (const region of desired) {
          if (!region.active || !region.externalId) continue;
          const authoritative = names.get(region.externalId);
          if (!authoritative) continue;
          for (const device of YANDEX_DEVICES) {
            try {
              const rows = await retry(() => provider.collect(window, authoritative, device), sleep, random);
              receivedCount += rows.length;
              storedCount += await dependencies.repository.upsertObservations(rows);
              latestObservationDate = [latestObservationDate, latestDate(rows)].filter(Boolean).sort().at(-1) ?? null;
            } catch (error) {
              errors.push(safeError(error).code);
            }
          }
        }
        const status = errors.length ? (storedCount > 0 ? "partial" : "failed") : "success";
        await dependencies.repository.finishRun(run.id, status, {
          receivedCount, storedCount, ...(errors[0] ? { errorCode: errors[0] } : {}),
          metadata: { completedSlices: desired.filter((region) => region.externalId).length * YANDEX_DEVICES.length - errors.length, failedSlices: errors.length },
        });
        logger.write({ event: "seo_collection_finished", source, status, receivedCount, storedCount, errorCode: errors[0] });
        return { source, status, receivedCount, storedCount, latestObservationDate, ...(errors[0] ? { errorCode: errors[0] } : {}) };
      } catch (error) {
        const { code } = safeError(error);
        await dependencies.repository.finishRun(run.id, "failed", { receivedCount, storedCount, errorCode: code });
        logger.write({ event: "seo_collection_finished", source, status: "failed", receivedCount, storedCount, errorCode: code });
        return { source, status: "failed", receivedCount, storedCount, latestObservationDate, errorCode: code };
      }
    });
  }

  async function runGoogle(): Promise<CollectionSourceReport> {
    const source = "google_search_console" as const;
    const provider = dependencies.google;
    if (!provider) return { source, status: "failed", receivedCount: 0, storedCount: 0, latestObservationDate: null, errorCode: "seo_google_provider_missing" };
    const window = windowEnding(clock(), 3);
    return dependencies.repository.withSourceLock(source, async () => {
      const run = await dependencies.repository.startRun(source, window.from, window.to);
      try {
        const rows = await retry(() => provider.collect(window), sleep, random);
        const storedCount = await dependencies.repository.upsertObservations(rows);
        await dependencies.repository.finishRun(run.id, "success", { receivedCount: rows.length, storedCount });
        logger.write({ event: "seo_collection_finished", source, status: "success", receivedCount: rows.length, storedCount });
        return { source, status: "success", receivedCount: rows.length, storedCount, latestObservationDate: latestDate(rows) };
      } catch (error) {
        const { code } = safeError(error);
        await dependencies.repository.finishRun(run.id, "failed", { receivedCount: 0, storedCount: 0, errorCode: code });
        logger.write({ event: "seo_collection_finished", source, status: "failed", receivedCount: 0, storedCount: 0, errorCode: code });
        return { source, status: "failed", receivedCount: 0, storedCount: 0, latestObservationDate: null, errorCode: code };
      }
    });
  }

  async function safeRun(source: SeoSourceId, operation: () => Promise<CollectionSourceReport>): Promise<CollectionSourceReport> {
    try {
      return await operation();
    } catch (error) {
      const { code } = safeError(error);
      logger.write({ event: "seo_collection_skipped", source, status: "failed", errorCode: code });
      return { source, status: "failed", receivedCount: 0, storedCount: 0, latestObservationDate: null, errorCode: code };
    }
  }

  return {
    async run(selected?: SeoSourceId) {
      const reports: CollectionSourceReport[] = [];
      const sources: Array<[SeoSourceId, boolean, () => Promise<CollectionSourceReport>]> = [
        ["yandex_webmaster", dependencies.config.yandex.enabled, runYandex],
        ["google_search_console", dependencies.config.google.enabled, runGoogle],
      ];
      for (const [source, enabled, operation] of sources) {
        await dependencies.repository.setSourceEnabled(source, enabled);
        if (selected && source !== selected) continue;
        if (!enabled) {
          reports.push({ source, status: "disabled", receivedCount: 0, storedCount: 0, latestObservationDate: null });
          continue;
        }
        reports.push(await safeRun(source, operation));
      }
      return { sources: reports, failed: reports.some((report) => report.status === "failed") };
    },
  };
}
