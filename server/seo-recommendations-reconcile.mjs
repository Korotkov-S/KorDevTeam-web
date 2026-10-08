import { pathToFileURL } from "node:url";
export async function runRecommendationReconciliation(input = process.stdin, loadBuild = () => import("../build/server/index.js"), logger = console) {
  try {
    let size = 0; const chunks = [];
    for await (const chunk of input) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > 1048576) throw Error(); chunks.push(bytes); }
    const commands = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(commands) || commands.length < 1 || commands.length > 100) throw Error();
    const build = await loadBuild(); const { revised, unchanged } = await build.entry.module.reconcileSeoRecommendations(commands);
    logger.info(JSON.stringify({ revised, unchanged })); return 0;
  } catch { logger.error("seo_recommendation_reconcile_failed"); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runRecommendationReconciliation();
