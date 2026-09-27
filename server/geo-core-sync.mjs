import { pathToFileURL } from "node:url";

const loadProductionBuild = () => import("../build/server/index.js");

export async function runGeoCoreSyncCommand(loadBuild = loadProductionBuild, logger = console) {
  try {
    const build = await loadBuild();
    const report = await build.entry.module.syncGeoPromptCatalog();
    logger.info(`GEO prompt catalog synced: inserted=${report.inserted} promoted=${report.promoted} preserved=${report.preserved}`);
    return 0;
  } catch {
    logger.error("GEO prompt catalog sync failed.");
    return 1;
  }
}

async function main() {
  process.exitCode = await runGeoCoreSyncCommand();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
