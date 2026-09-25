import assert from "node:assert/strict";
import test from "node:test";

import { createDb } from "../db/client";
import { adminUsers, mcpTokens } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createMcpSeoService } from "./mcpService";
import { createSeoRepository } from "./repository";
import { createSeoService } from "./service";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

databaseTest("sanitized observations flow through dashboard reads and token-bound MCP writes", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [admin] = await db.insert(adminUsers).values({ login: "seo-fixture", passwordDigest: "digest", passwordSalt: "salt" }).returning();
  const [token] = await db.insert(mcpTokens).values({ adminUserId: admin.id, name: "SEO heartbeat", tokenHash: "a".repeat(64),
    tokenPrefix: "kdt_mcp_fixture", scopes: ["seo:read", "seo:write"] }).returning();
  const repository = createSeoRepository(db);
  await repository.upsertObservations([{ source: "google_search_console", observationDate: "2026-09-23", queryText: "Внедрение CRM",
    normalizedQuery: "внедрение crm", pagePath: "/services/crm-development/", regionExternalId: "RUS", device: "desktop",
    impressions: 500, clicks: 25, ctr: 0.05, averagePosition: 8.2 }]);
  const service = createSeoService(repository);
  const mcp = createMcpSeoService(service, token.id);
  assert.deepEqual(await mcp.getOverview({ dateFrom: "2026-09-23", dateTo: "2026-09-23", source: "google_search_console" }),
    { impressions: 500, clicks: 25, ctr: 0.05, averagePosition: 8.2 });
  const recommendation = await mcp.createRecommendation({ title: "Проверить сниппет", rationale: "500 показов при CTR 5%",
    pagePath: "/services/crm-development/", issueType: "low_ctr", evidence: { observationDate: "2026-09-23", impressions: 500, ctr: 0.05 }, confidence: "medium" });
  assert.equal(recommendation.status, "new");
  await mcp.recordChange({ pagePath: "/services/crm-development/", summary: "Обновлён title", type: "metadata" });
  assert.equal((await mcp.listRecommendations({ dateFrom: "2026-09-01", dateTo: "2026-09-30", limit: 10 })).items.length, 1);
  assert.equal((await mcp.listChanges({ dateFrom: "2026-09-01", dateTo: "2026-09-30", limit: 10 })).items.length, 1);
});
