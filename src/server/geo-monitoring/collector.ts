import { checkGeoCrawlerHealth } from "./crawlerHealth";
import type { GeoCrawlerCheckInput } from "./repository";

type Repository = { recordCrawlerChecks(input: readonly GeoCrawlerCheckInput[]): Promise<number> };

export function createGeoCollector(dependencies: {
  origin: URL;
  repository: Repository;
  fetch?: typeof fetch;
  check?: typeof checkGeoCrawlerHealth;
}) {
  return {
    async run() {
      let plannedCount = 0;
      try {
        const rows = await (dependencies.check ?? checkGeoCrawlerHealth)(dependencies.origin, dependencies.fetch);
        plannedCount = rows.length;
        const storedCount = await dependencies.repository.recordCrawlerChecks(rows);
        return { source: "geo_crawler" as const, status: "success" as const, plannedCount,
          completedCount: rows.length, storedCount };
      } catch {
        return { source: "geo_crawler" as const, status: "failed" as const, plannedCount,
          completedCount: 0, storedCount: 0, errorCode: "geo_crawler_collection_failed" };
      }
    },
  };
}
