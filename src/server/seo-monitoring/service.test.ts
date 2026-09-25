import assert from "node:assert/strict";
import { test } from "node:test";

import { createSeoService } from "./service";

function fakeRepository() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const method = (name: string, result: unknown = {}) => async (...args: unknown[]) => {
    calls.push({ method: name, args });
    return result;
  };
  return {
    calls,
    repository: {
      getOverview: method("getOverview"),
      listQueries: method("listQueries", { items: [], nextCursor: null }),
      listChanges: method("listChanges", { items: [], nextCursor: null }),
      listRecommendations: method("listRecommendations", { items: [], nextCursor: null }),
      saveQueryTarget: method("saveQueryTarget"),
      recordChange: method("recordChange"),
      createRecommendation: method("createRecommendation"),
      updateRecommendationStatus: method("updateRecommendationStatus"),
    },
  };
}

test("service bounds date windows and pagination before repository access", async () => {
  const fake = fakeRepository();
  const service = createSeoService(fake.repository as never);
  assert.throws(() => service.getOverview({ dateFrom: "2025-01-01", dateTo: "2026-09-25" }), {
    message: "seo_date_range_invalid",
  });
  assert.throws(() => service.listQueries({
    filters: { dateFrom: "2026-09-01", dateTo: "2026-09-25" },
    limit: 101,
  }), { message: "seo_limit_invalid" });
  assert.equal(fake.calls.length, 0);
});

test("service normalizes local paths and rejects unsafe evidence", async () => {
  const fake = fakeRepository();
  const service = createSeoService(fake.repository as never);
  await service.saveQueryTarget({ queryId: "00000000-0000-4000-8000-000000000001", targetPath: "https://kordev.team/services/crm/?x=1" });
  assert.equal((fake.calls[0].args as [string, string])[1], "/services/crm/");
  assert.throws(() => service.createRecommendation({
    title: "Проверить CTR",
    rationale: "Показов достаточно",
    pagePath: "/services/crm/",
    issueType: "low_ctr",
    evidence: [] as never,
    confidence: "high",
    fingerprint: "a".repeat(64),
  }, {}), { message: "seo_evidence_invalid" });
});

test("service binds change actors without allowing ambiguous identities", async () => {
  const fake = fakeRepository();
  const service = createSeoService(fake.repository as never);
  const actor = { adminUserId: "00000000-0000-4000-8000-000000000001" };
  await service.recordChange({
    pagePath: "/blog/crm/",
    summary: "Обновили метаданные",
    type: "metadata",
  }, actor);
  assert.equal((fake.calls[0].args[0] as { actorAdminUserId: string }).actorAdminUserId, actor.adminUserId);
  assert.throws(() => service.recordChange({
    pagePath: "/blog/crm/",
    summary: "Обновили метаданные",
    type: "metadata",
  }, { ...actor, mcpTokenId: "00000000-0000-4000-8000-000000000002" }), { message: "seo_actor_invalid" });
});
