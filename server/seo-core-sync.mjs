import { pathToFileURL } from "node:url";

const loadProductionBuild = () => import("../build/server/index.js");

export async function runSeoCoreSyncCommand(loadBuild = loadProductionBuild, logger = console) {
  try {
    const build = await loadBuild();
    const report = await build.entry.module.syncSeoSemanticCore();
    logger.info(`SEO semantic core synced: inserted=${report.inserted} promoted=${report.promoted} preserved=${report.preserved}`);
    return 0;
  } catch {
    logger.error("SEO semantic core sync failed.");
    return 1;
  }
}

async function main() {
  process.exitCode = await runSeoCoreSyncCommand();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
