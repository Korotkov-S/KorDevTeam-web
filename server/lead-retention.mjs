import { pathToFileURL } from "node:url";

const loadProductionBuild = () => import("../build/server/index.js");

export async function runLeadRetentionCommand(loadBuild = loadProductionBuild, logger = console) {
  const build = await loadBuild();
  const report = await build.entry.module.runLeadRetention({ limit: 100 });
  const summary = `leads=${report.deletedLeads} objects=${report.deletedObjects} orphans=${report.deletedOrphans} failures=${report.failures}`;
  if (report.failures > 0) {
    logger.error(`Lead retention failed: ${summary}`);
    return 1;
  }
  logger.info(`Lead retention completed: ${summary}`);
  return 0;
}

async function main() {
  if (process.argv.length > 2) throw new Error("lead_retention_arguments_invalid");
  process.exitCode = await runLeadRetentionCommand();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Lead retention failed.");
    process.exitCode = 1;
  });
}
