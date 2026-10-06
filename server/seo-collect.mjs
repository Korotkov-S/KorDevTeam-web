import { pathToFileURL } from "node:url";

const loadProductionBuild = () => import("../build/server/index.js");

export function parseSeoCollectArgs(args) {
  if (args.includes("--resume-yandex-rank")) {
    const allowDaytime = args.length === 2 && args.includes("--allow-daytime-yandex-rank");
    if (args.length !== 1 && !allowDaytime) throw new Error("seo_collect_arguments_invalid");
    return {
      check: false,
      skipYandexRank: false,
      source: "yandex_search",
      resumeYandexRank: true,
      ...(allowDaytime ? { allowDaytimeYandexRank: true } : {}),
    };
  }
  let check = false;
  let skipYandexRank = false;
  let source;
  for (const argument of args) {
    if (argument === "--check" && !check) check = true;
    else if (argument === "--skip-yandex-rank" && !skipYandexRank) skipYandexRank = true;
    else if (argument === "--source=yandex" && source === undefined) source = "yandex_webmaster";
    else if (argument === "--source=google" && source === undefined) source = "google_search_console";
    else if (argument === "--source=metrika" && source === undefined) source = "yandex_metrika";
    else if (argument === "--source=yandex-rank" && source === undefined) source = "yandex_search";
    else if (argument === "--source=geo-crawler" && source === undefined) source = "geo_crawler";
    else throw new Error("seo_collect_arguments_invalid");
  }
  if (skipYandexRank && (check || source !== undefined)) throw new Error("seo_collect_arguments_invalid");
  return { check, skipYandexRank, ...(source ? { source } : {}) };
}

function compact(report) {
  return report.sources.map((source) => {
    const counts = source.receivedCount !== undefined
      ? ` received=${source.receivedCount} stored=${source.storedCount}`
      : source.plannedCount !== undefined
        ? ` planned=${source.plannedCount} completed=${source.completedCount} stored=${source.storedCount}`
        : "";
    return `${source.source}:${source.status}${counts}${source.errorCode ? ` error=${source.errorCode}` : ""}`;
  }).join(" ");
}

export async function runSeoCollectCommand(
  args,
  loadBuild = loadProductionBuild,
  logger = console,
) {
  const options = parseSeoCollectArgs(args);
  const build = await loadBuild();
  const report = options.check
    ? await build.entry.module.checkSeoCollectionReady(options.source ? { source: options.source } : {})
    : await build.entry.module.runSeoCollection(
        options.source
          ? {
              source: options.source,
              ...(options.resumeYandexRank ? { resumeYandexRank: true } : {}),
              ...(options.allowDaytimeYandexRank ? { allowDaytimeYandexRank: true } : {}),
            }
          : options.skipYandexRank ? { skipYandexRank: true } : {},
      );
  const line = compact(report);
  if (
    report.failed ||
    report.sources.some(
      (source) =>
        source.status === "failed" ||
        (source.status === "partial" &&
          (source.retryable === false || source.blockedCount > 0)),
    )
  ) {
    logger.error(`SEO collection failed: ${line}`);
    return 1;
  }
  if (
    report.sources.some(
      (source) => source.status === "partial" || source.status === "running",
    )
  ) {
    logger.error(`SEO collection incomplete: ${line}`);
    return 2;
  }
  logger.info(`SEO collection ready: ${line}`);
  return 0;
}

async function main() {
  process.exitCode = await runSeoCollectCommand(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("SEO collection failed.");
    process.exitCode = 1;
  });
}
