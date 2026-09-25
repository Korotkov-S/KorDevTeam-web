import { pathToFileURL } from "node:url";

const loadProductionBuild = () => import("../build/server/index.js");

export function parseSeoCollectArgs(args) {
  let check = false;
  let source;
  for (const argument of args) {
    if (argument === "--check" && !check) check = true;
    else if (argument === "--source=yandex" && source === undefined) source = "yandex_webmaster";
    else if (argument === "--source=google" && source === undefined) source = "google_search_console";
    else throw new Error("seo_collect_arguments_invalid");
  }
  return { check, ...(source ? { source } : {}) };
}

function compact(report) {
  return report.sources.map((source) => {
    const counts = source.receivedCount === undefined ? "" : ` received=${source.receivedCount} stored=${source.storedCount}`;
    return `${source.source}:${source.status}${counts}${source.errorCode ? ` error=${source.errorCode}` : ""}`;
  }).join(" ");
}

export async function runSeoCollectCommand(args, loadBuild = loadProductionBuild, logger = console) {
  const options = parseSeoCollectArgs(args);
  const build = await loadBuild();
  const report = options.check
    ? await build.entry.module.checkSeoCollectionReady()
    : await build.entry.module.runSeoCollection(options.source ? { source: options.source } : {});
  const line = compact(report);
  if (report.failed || report.sources.some((source) => source.status === "failed")) {
    logger.error(`SEO collection failed: ${line}`);
    return 1;
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

