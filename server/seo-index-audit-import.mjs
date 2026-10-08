import { pathToFileURL } from "node:url";

export async function runIndexAuditImport(stream = process.stdin, loadBuild = () => import("../build/server/index.js"), logger = console) {
  try {
    let size = 0; const chunks = [];
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk); size += buffer.length;
      if (size > 8 * 1024 * 1024) throw Error("input_too_large");
      chunks.push(buffer);
    }
    const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const build = await loadBuild();
    const result = await build.entry.module.importSeoIndexingAudit(report);
    logger.info(JSON.stringify({ inserted: result.inserted, unchanged: result.unchanged }));
    return 0;
  } catch {
    logger.error("seo_index_audit_import_failed"); return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runIndexAuditImport();
