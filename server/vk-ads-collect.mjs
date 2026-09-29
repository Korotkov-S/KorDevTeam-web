import { pathToFileURL } from "node:url";

const loadProductionBuild = () => import("../build/server/index.js");
const modes = new Set(["check", "backfill", "daily"]);
const statuses = new Set(["succeeded", "partial", "failed"]);
const errorCode = /^ads_vk_[a-z_]{1,80}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/u;

export function parseVkAdsCollectArgs(args) {
  if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== "string" || !args[0].startsWith("--mode=")) {
    throw new Error("ads_vk_contract_invalid");
  }
  const mode = args[0].slice("--mode=".length);
  if (!modes.has(mode)) throw new Error("ads_vk_contract_invalid");
  return { mode };
}

function safeReport(report, expectedMode) {
  if (!report || typeof report !== "object" || report.mode !== expectedMode || !statuses.has(report.status) ||
      !uuid.test(report.correlationId) || !report.counters || typeof report.counters !== "object" || Array.isArray(report.counters)) return null;
  if ((report.status === "succeeded" && report.errorCode !== null) ||
      (report.status !== "succeeded" && (typeof report.errorCode !== "string" || !errorCode.test(report.errorCode)))) return null;
  const counters = [];
  for (const [key, value] of Object.entries(report.counters).sort(([left], [right]) => left.localeCompare(right))) {
    if (!/^[a-z][A-Za-z0-9]{0,79}$/u.test(key) || !Number.isSafeInteger(value) || value < 0 || counters.length >= 20) return null;
    counters.push(`${key}=${value}`);
  }
  for (const value of [report.coveredDateFrom, report.coveredDateTo]) {
    if (value !== null && (typeof value !== "string" || !dateOnly.test(value))) return null;
  }
  return [
    `mode=${report.mode}`,
    `status=${report.status}`,
    `correlation=${report.correlationId}`,
    ...(report.errorCode ? [`error=${report.errorCode}`] : []),
    ...counters,
    ...(report.coveredDateFrom ? [`from=${report.coveredDateFrom}`] : []),
    ...(report.coveredDateTo ? [`to=${report.coveredDateTo}`] : []),
  ].join(" ");
}

export async function runVkAdsCollectCommand(args, loadBuild = loadProductionBuild, logger = console) {
  const { mode } = parseVkAdsCollectArgs(args);
  try {
    const build = await loadBuild();
    const report = mode === "check"
      ? await build.entry.module.checkVkAdsCollectionReady()
      : await build.entry.module.runVkAdsCollection(mode);
    const line = safeReport(report, mode);
    if (!line) {
      logger.error("VK Ads collection failed.");
      return 1;
    }
    if (report.status !== "succeeded") {
      logger.error(`VK Ads collection failed: ${line}`);
      return 1;
    }
    logger.info(`VK Ads collection ready: ${line}`);
    return 0;
  } catch {
    logger.error("VK Ads collection failed.");
    return 1;
  }
}

async function main() {
  process.exitCode = await runVkAdsCollectCommand(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("VK Ads collection failed.");
    process.exitCode = 1;
  });
}
