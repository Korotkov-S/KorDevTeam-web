import { readSeoConfig, safeSeoConfigSummary } from "./config";
import type { SeoCollectionTarget, SeoSourceId } from "./contracts";
import { createSeoCollector } from "./collector";
import { getDb } from "../db/client";
import { createSeoRepository } from "./repository";
import { createSeoService } from "./service";
import { createGoogleSearchConsoleProvider } from "./providers/google";
import { createYandexWebmasterProvider } from "./providers/yandex";
import { createYandexMetrikaProvider } from "./providers/yandexMetrika";
import { SeoProviderError } from "./providers/provider-error";
import { createYandexSearchProvider } from "./providers/yandexSearch";
import { createSeoRankCollector } from "./rankCollector";
import { createRankQueueRepository } from "./rankQueueRepository";
import { loadSemanticCore } from "./semanticCore";
import { createGeoRepository } from "../geo-monitoring/repository";
import { createGeoCollector } from "../geo-monitoring/collector";
import { checkGeoCrawlerHealth } from "../geo-monitoring/crawlerHealth";
import { createPageControlRepository } from "./pageControlRepository";
import { createSeoEffectsRepository } from "./effectsRepository";
import { createRecommendationHistoryRepository } from "./recommendationHistory";
import { createRecommendationExecutionRepository } from "./recommendationExecutionRepository";
import { createRecommendationExecutionService } from "./recommendationExecutionService";

export function getSeoRecommendationExecutionService() {
  return createRecommendationExecutionService(createRecommendationExecutionRepository(getDb()));
}

export function reconcileSeoRecommendations(commands: unknown) {
  return createRecommendationHistoryRepository(getDb()).reconcile(commands, { operation: "saved-audit-reconcile" });
}

export function evaluateSeoChanges() {
  return createSeoEffectsRepository(getDb()).evaluateAll();
}

export function importSeoIndexingAudit(report: unknown) {
  return createPageControlRepository(getDb()).importAudit(report);
}

export function readGeoSiteOrigin(env: NodeJS.ProcessEnv = process.env) {
  let origin: URL;
  try {
    origin = new URL(env.GEO_SITE_ORIGIN ?? "https://kordev.team");
  } catch {
    throw new Error("geo_site_origin_invalid");
  }
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash
    || origin.username || origin.password) throw new Error("geo_site_origin_invalid");
  return origin;
}

export function getSeoMonitoringService() {
  return createSeoService(createSeoRepository(getDb()));
}

export function syncSeoSemanticCore() {
  return createSeoRepository(getDb()).syncSemanticCore(loadSemanticCore());
}

export async function runSeoCollection(
  options: {
    source?: SeoCollectionTarget
    skipYandexRank?: boolean
    resumeYandexRank?: boolean;
    allowDaytimeYandexRank?: boolean;
  } = {},
) {
  const config = readSeoConfig(process.env);
  const repository = createSeoRepository(getDb());
  const geoRepository = createGeoRepository(getDb());
  const collector = createSeoCollector({
    config,
    repository: { ...repository, upsertGeoReferrals: geoRepository.upsertGeoReferrals },
    ...(config.yandex.enabled ? { yandex: createYandexWebmasterProvider(config.yandex) } : {}),
    ...(config.google.enabled ? { google: createGoogleSearchConsoleProvider(config.google) } : {}),
    ...(config.yandexMetrika.enabled ? { yandexMetrika: createYandexMetrikaProvider(config.yandexMetrika) } : {}),
  });
  const metricReport = options.source === "yandex_search" || options.source === "geo_crawler"
    ? { sources: [], failed: false }
    : await collector.run(options.source as SeoSourceId | undefined);
  if (options.source && options.source !== "yandex_search" && options.source !== "geo_crawler") return metricReport;
  const sources: Array<Record<string, unknown>> = [...metricReport.sources];
  let failed = metricReport.failed;
  if (
    (!options.source && !options.skipYandexRank) || options.source === "yandex_search"
  ) {
    if (!config.yandexSearch.enabled) {
      sources.push({ source: "yandex_search", status: "disabled", plannedCount: 0, completedCount: 0, storedCount: 0, checkDate: null });
    } else {
      try {
        const rank = await createSeoRankCollector({
          repository: createRankQueueRepository(getDb()),
          provider: createYandexSearchProvider(config.yandexSearch),
          dailyCheckLimit: config.yandexSearch.dailyCheckLimit,
        }).run({ resumeOnly: options.resumeYandexRank, allowDaytime: options.resumeYandexRank === true && options.allowDaytimeYandexRank === true });
        sources.push(rank);
        failed ||= rank.status === "failed";
      } catch (error) {
        const errorCode = error instanceof SeoProviderError || (error instanceof Error && error.message === "seo_rank_locked")
          ? error.message : "seo_yandex_search_collection_failed";
        sources.push({ source: "yandex_search", status: "failed", plannedCount: 0, completedCount: 0, storedCount: 0, checkDate: null, errorCode });
        failed = true;
      }
    }
  }
  if (!options.source || options.source === "geo_crawler") {
    const geo = await createGeoCollector({ origin: readGeoSiteOrigin(), repository: geoRepository }).run();
    sources.push(geo);
    failed ||= geo.status === "failed";
  }
  return { sources, failed };
}

export async function checkSeoCollectionReady(options: { source?: SeoCollectionTarget } = {}) {
  const config = readSeoConfig(process.env);
  const summary = safeSeoConfigSummary(config);
  const sources: Array<{ source: SeoCollectionTarget; status: "disabled" | "ready" | "failed"; errorCode?: string }> = [];
  for (const [source, provider] of [
    ["yandex_webmaster", config.yandex.enabled ? createYandexWebmasterProvider(config.yandex) : null],
    ["google_search_console", config.google.enabled ? createGoogleSearchConsoleProvider(config.google) : null],
    ["yandex_metrika", config.yandexMetrika.enabled ? createYandexMetrikaProvider(config.yandexMetrika) : null],
  ] as const) {
    if (options.source && source !== options.source) continue;
    if (!provider) { sources.push({ source, status: "disabled" }); continue; }
    try {
      await provider.check();
      sources.push({ source, status: "ready" });
    } catch (error) {
      sources.push({ source, status: "failed", errorCode: error instanceof SeoProviderError ? error.message : "seo_check_failed" });
    }
  }
  if (!options.source || options.source === "yandex_search") {
    const provider = config.yandexSearch.enabled ? createYandexSearchProvider(config.yandexSearch) : null;
    if (!provider) sources.push({ source: "yandex_search", status: "disabled" });
    else {
      try {
        await provider.check();
        sources.push({ source: "yandex_search", status: "ready" });
      } catch (error) {
        sources.push({ source: "yandex_search", status: "failed",
          errorCode: error instanceof SeoProviderError ? error.message : "seo_check_failed" });
      }
    }
  }
  if (!options.source || options.source === "geo_crawler") {
    try {
      await checkGeoCrawlerHealth(readGeoSiteOrigin());
      sources.push({ source: "geo_crawler", status: "ready" });
    } catch {
      sources.push({ source: "geo_crawler", status: "failed", errorCode: "geo_crawler_check_failed" });
    }
  }
  return { config: summary, sources, failed: sources.some((source) => source.status === "failed") };
}
