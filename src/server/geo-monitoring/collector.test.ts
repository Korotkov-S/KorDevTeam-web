import assert from "node:assert/strict";
import test from "node:test";

import { createGeoCollector } from "./collector";

test("GEO collector persists crawler checks and returns compact counts", async () => {
  const stored: unknown[] = [];
  const collector = createGeoCollector({
    origin: new URL("https://kordev.team"),
    repository: { async recordCrawlerChecks(rows) { stored.push(...rows); return rows.length; } },
    check: async () => [
      { checkDate: "2026-09-27", target: "/robots.txt", bot: "OAI-SearchBot", status: "pass", metadata: {} },
      { checkDate: "2026-09-27", target: "/sitemap.xml", bot: "system", status: "fail", reasonCode: "geo_redirect_not_allowed", metadata: {} },
    ],
  });
  assert.deepEqual(await collector.run(), {
    source: "geo_crawler", status: "success", plannedCount: 2, completedCount: 2, storedCount: 2,
  });
  assert.equal(stored.length, 2);
});

test("GEO collector exposes only a safe failure code", async () => {
  const collector = createGeoCollector({
    origin: new URL("https://kordev.team"),
    repository: { async recordCrawlerChecks() { throw new Error("postgres password secret"); } },
    check: async () => [],
  });
  assert.deepEqual(await collector.run(), {
    source: "geo_crawler", status: "failed", plannedCount: 0, completedCount: 0, storedCount: 0,
    errorCode: "geo_crawler_collection_failed",
  });
});
