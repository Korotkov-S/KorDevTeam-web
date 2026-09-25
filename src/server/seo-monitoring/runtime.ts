import { readSeoConfig, safeSeoConfigSummary } from "./config";
import type { SeoSourceId } from "./contracts";
import { createSeoCollector } from "./collector";
import { getDb } from "../db/client";
import { createSeoRepository } from "./repository";
import { createSeoService } from "./service";
import { createGoogleSearchConsoleProvider } from "./providers/google";
import { createYandexWebmasterProvider } from "./providers/yandex";
import { SeoProviderError } from "./providers/provider-error";

export function getSeoMonitoringService() {
  return createSeoService(createSeoRepository(getDb()));
}

export async function runSeoCollection(options: { source?: SeoSourceId } = {}) {
  const config = readSeoConfig(process.env);
  const collector = createSeoCollector({
    config,
    repository: createSeoRepository(getDb()),
    ...(config.yandex.enabled ? { yandex: createYandexWebmasterProvider(config.yandex) } : {}),
    ...(config.google.enabled ? { google: createGoogleSearchConsoleProvider(config.google) } : {}),
  });
  return collector.run(options.source);
}

export async function checkSeoCollectionReady() {
  const config = readSeoConfig(process.env);
  const summary = safeSeoConfigSummary(config);
  const sources: Array<{ source: SeoSourceId; status: "disabled" | "ready" | "failed"; errorCode?: string }> = [];
  for (const [source, provider] of [
    ["yandex_webmaster", config.yandex.enabled ? createYandexWebmasterProvider(config.yandex) : null],
    ["google_search_console", config.google.enabled ? createGoogleSearchConsoleProvider(config.google) : null],
  ] as const) {
    if (!provider) { sources.push({ source, status: "disabled" }); continue; }
    try {
      await provider.check();
      sources.push({ source, status: "ready" });
    } catch (error) {
      sources.push({ source, status: "failed", errorCode: error instanceof SeoProviderError ? error.message : "seo_check_failed" });
    }
  }
  return { config: summary, sources, failed: sources.some((source) => source.status === "failed") };
}
