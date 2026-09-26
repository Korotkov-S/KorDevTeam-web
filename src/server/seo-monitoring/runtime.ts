import { readSeoConfig, safeSeoConfigSummary } from "./config";
import type { SeoCollectionTarget, SeoSourceId } from "./contracts";
import { createSeoCollector } from "./collector";
import { getDb } from "../db/client";
import { createSeoRepository } from "./repository";
import { createSeoService } from "./service";
import { createGoogleSearchConsoleProvider } from "./providers/google";
import { createYandexWebmasterProvider } from "./providers/yandex";
import { SeoProviderError } from "./providers/provider-error";
import { createYandexSearchProvider } from "./providers/yandexSearch";
import { createSeoRankCollector } from "./rankCollector";

export function getSeoMonitoringService() {
  return createSeoService(createSeoRepository(getDb()));
}

export async function runSeoCollection(options: { source?: SeoCollectionTarget } = {}) {
  const config = readSeoConfig(process.env);
  const repository = createSeoRepository(getDb());
  const collector = createSeoCollector({
    config,
    repository,
    ...(config.yandex.enabled ? { yandex: createYandexWebmasterProvider(config.yandex) } : {}),
    ...(config.google.enabled ? { google: createGoogleSearchConsoleProvider(config.google) } : {}),
  });
  const metricReport = options.source === "yandex_search"
    ? { sources: [], failed: false }
    : await collector.run(options.source as SeoSourceId | undefined);
  if (options.source && options.source !== "yandex_search") return metricReport;
  if (!config.yandexSearch.enabled) {
    const rank = { source: "yandex_search" as const, status: "disabled" as const, plannedCount: 0, completedCount: 0, storedCount: 0, checkDate: null };
    return { sources: [...metricReport.sources, rank], failed: metricReport.failed };
  }
  try {
    const rank = await createSeoRankCollector({
      repository,
      provider: createYandexSearchProvider(config.yandexSearch),
    }).run();
    return { sources: [...metricReport.sources, rank], failed: metricReport.failed || rank.status === "failed" };
  } catch (error) {
    const errorCode = error instanceof SeoProviderError || (error instanceof Error && error.message === "seo_rank_locked")
      ? error.message : "seo_yandex_search_collection_failed";
    const rank = { source: "yandex_search" as const, status: "failed" as const, plannedCount: 0, completedCount: 0, storedCount: 0, checkDate: null, errorCode };
    return { sources: [...metricReport.sources, rank], failed: true };
  }
}

export async function checkSeoCollectionReady(options: { source?: SeoCollectionTarget } = {}) {
  const config = readSeoConfig(process.env);
  const summary = safeSeoConfigSummary(config);
  const sources: Array<{ source: SeoCollectionTarget; status: "disabled" | "ready" | "failed"; errorCode?: string }> = [];
  for (const [source, provider] of [
    ["yandex_webmaster", config.yandex.enabled ? createYandexWebmasterProvider(config.yandex) : null],
    ["google_search_console", config.google.enabled ? createGoogleSearchConsoleProvider(config.google) : null],
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
  return { config: summary, sources, failed: sources.some((source) => source.status === "failed") };
}
