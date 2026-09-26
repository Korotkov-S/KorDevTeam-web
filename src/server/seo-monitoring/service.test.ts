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
      listSemanticCore: method("listSemanticCore", { items: [], nextCursor: null }),
      createCandidate: method("createCandidate"),
      updateSemanticQuery: method("updateSemanticQuery"),
      listChanges: method("listChanges", { items: [], nextCursor: null }),
      listRecommendations: method("listRecommendations", { items: [], nextCursor: null }),
      listRankChecks: method("listRankChecks", { items: [], nextCursor: null }),
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
  assert.throws(() => service.listRankChecks({
    filters: { dateFrom: "bad", dateTo: "2026-09-25" },
  }), { message: "seo_date_invalid" });
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

test("service validates and normalizes semantic-core candidates", async () => {
  const fake = fakeRepository();
  const service = createSeoService(fake.repository as never);
  await service.createCandidate({
    queryText: "  Внедрение   CRM  ",
    targetPath: "https://kordev.team/blog/crm-implementation/?utm_source=test",
    wordstatFrequency: 1159,
    frequencyBand: "high",
    kind: "informational",
    priority: 50,
  });
  assert.deepEqual(fake.calls[0], { method: "createCandidate", args: [{
    queryText: "Внедрение   CRM",
    normalizedQuery: "внедрение crm",
    targetPath: "/blog/crm-implementation/",
    wordstatFrequency: 1159,
    frequencyBand: "high",
    kind: "informational",
    priority: 50,
  }] });

  for (const command of [
    { queryText: " ", priority: 0 },
    { queryText: "x", wordstatFrequency: -1, priority: 0 },
    { queryText: "x", wordstatFrequency: 1.5, priority: 0 },
    { queryText: "x", priority: 1001 },
    { queryText: "x", priority: 0, frequencyBand: "popular" },
    { queryText: "x", priority: 0, kind: "service" },
  ]) {
    assert.throws(() => service.createCandidate(command as never));
  }
});

test("service validates semantic-core filters and optimistic updates", async () => {
  const fake = fakeRepository();
  const service = createSeoService(fake.repository as never);
  await service.listSemanticCore({ status: "candidate", kind: "other", limit: 20, cursor: "0" });
  assert.deepEqual(fake.calls[0], { method: "listSemanticCore", args: [{ status: "candidate", kind: "other" }, { limit: 20, cursor: "0" }] });
  await service.updateSemanticQuery({
    id: "00000000-0000-4000-8000-000000000001",
    expectedUpdatedAt: "2026-09-26T07:00:00.000Z",
    targetPath: "/services/crm-development/",
    wordstatFrequency: 573,
    frequencyBand: "high",
    kind: "commercial",
    priority: 100,
    status: "active",
  });
  assert.equal((fake.calls[1].args[1] as Date).toISOString(), "2026-09-26T07:00:00.000Z");
  assert.throws(() => service.listSemanticCore({ status: "enabled" as never }));
  assert.throws(() => service.updateSemanticQuery({
    id: "not-a-uuid", expectedUpdatedAt: "bad", targetPath: null, wordstatFrequency: null,
    frequencyBand: "unclassified", kind: "other", priority: 0, status: "archived",
  }));
});
