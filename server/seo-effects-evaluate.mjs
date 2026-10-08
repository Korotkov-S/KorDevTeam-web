import { pathToFileURL } from "node:url";

export async function runEffectsEvaluation(loadBuild = () => import("../build/server/index.js"), logger = console) {
  try {
    const build = await loadBuild();
    const { inserted, unchanged } = await build.entry.module.evaluateSeoChanges();
    logger.info(JSON.stringify({ inserted, unchanged }));
    return 0;
  } catch {
    logger.error("seo_effect_evaluation_failed"); return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runEffectsEvaluation();
