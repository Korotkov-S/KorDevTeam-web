import { pathToFileURL } from "node:url";
import path from "node:path";
import { getDb } from "../src/server/db/client";
import { applyCommercialServiceSources, loadCommercialServiceSources } from "../src/server/content/commercialServices";

export async function syncCommercialServices() {
  const sources = await loadCommercialServiceSources();
  return applyCommercialServiceSources(getDb(), sources);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncCommercialServices()
    .then(result => process.stdout.write(`${JSON.stringify({ ok: true, services: result }, null, 2)}\n`))
    .catch(error => {
      const code = error instanceof Error && /^commercial_service_/.test(error.message)
        ? error.message
        : "commercial_service_sync_failed";
      process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
      process.exitCode = 1;
    });
}
