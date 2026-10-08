import assert from "node:assert/strict";
import test from "node:test";

import { createGeoMonitoringService } from "./service";
import type { GeoRepository } from "./repository";

const tokenId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const promptId = "33333333-3333-4333-8333-333333333333";

function fakeRepository(overrides: Partial<GeoRepository> = {}): GeoRepository {
  return {
    syncPromptCatalog: async () => ({ inserted: 0, promoted: 0, preserved: 0 }),
    createPromptCandidate: async (input) => input as never,
    updatePrompt: async (input) => input as never,
    updateEntity: async (input) => input as never,
    startRun: async (input, principal) => ({ id: runId, ...input, initiatedByMcpTokenId: principal }) as never,
    recordObservation: async (_runId, _principal, input) => ({ id: "44444444-4444-4444-8444-444444444444", ...input }) as never,
    finishRun: async (_runId, _principal, input) => input as never,
    recordCrawlerChecks: async (input) => input.length,
    ...overrides,
  };
}

function startInput(overrides: Record<string, unknown> = {}) {
  return {
    platform: "chatgpt_search" as const,
    surface: "search",
    mode: "live_ui" as const,
    region: "RU",
    language: "ru",
    promptIds: [promptId],
    metadata: {},
    ...overrides,
  };
}

function observationInput(overrides: Record<string, unknown> = {}) {
  return {
    promptId,
    repetition: 1,
    mentioned: true,
    linked: true,
    cited: true,
    sourceOrder: 1,
    responseExcerpt: "KorDevTeam рекомендован",
    responseSnapshot: "KorDevTeam рекомендован. Источник: https://kordev.team/services/crm-development/",
    snapshotTruncated: false,
    responseHash: "b".repeat(64),
    modelName: "ChatGPT Search",
    sourceCount: 1,
    sessionPersonalized: false,
    mentions: [],
    citations: [{
      url: "https://kordev.team/services/crm-development/?utm_source=chatgpt",
      title: "Разработка CRM",
      sourceOrder: 1,
      category: "owned" as const,
    }],
    fanoutQueries: [],
    ...overrides,
  };
}

test("GEO read filters preserve explicit false personalization and reject unsafe cohort dimensions", async () => {
  const service = createGeoMonitoringService(fakeRepository({ getOverview: async input => input as never }));
  const filters = { from: "2026-10-01", to: "2026-10-08", surface: "alice_web", sessionPersonalized: false };
  assert.deepEqual(await service.getOverview(filters), filters);
  for (const invalid of [{ surface: "\n" }, { surface: "bad\u0000surface" }, { sessionPersonalized: "false" }])
    await assert.rejects(service.getOverview({ ...filters, ...invalid } as never), /geo_(?:run_surface|observation_session)_invalid/u);
});

test("observational GEO candidates require both actual cohort dimensions; official metrics do not", async () => {
  const service = createGeoMonitoringService(fakeRepository({ createExperimentCandidate: async input => input as never }));
  const input = { recommendationId: runId, pagePath: "/services/crm/", actionType: "content_answer" as const,
    hypothesis: "Ответ", platform: "chatgpt_search" as const, mode: "live_ui" as const, language: "ru", region: "RU",
    promptIds: [promptId], primaryMetric: "citation_rate" as const, direction: "increase" as const,
    minimumDelta: 0.05, expectedSignal: "Рост" };
  await assert.rejects(service.createExperimentCandidate(input, { mcpTokenId: tokenId }), /geo_experiment_cohort_invalid/u);
  await assert.rejects(service.createExperimentCandidate({ ...input, surface: "search" } as never, { mcpTokenId: tokenId }), /geo_experiment_cohort_invalid/u);
  const accepted = await service.createExperimentCandidate({ ...input, surface: "search", sessionPersonalized: false }, { mcpTokenId: tokenId });
  assert.equal((accepted as unknown as { sessionPersonalized: boolean }).sessionPersonalized, false);
  await service.createExperimentCandidate({ ...input, primaryMetric: "ai_referrals" }, { mcpTokenId: tokenId });
});

test("startRun accepts only bounded plans, known modes, and bounded plain metadata", async () => {
  let calls = 0;
  const service = createGeoMonitoringService(fakeRepository({
    startRun: async (input, principal) => {
      calls++;
      assert.equal(principal, tokenId);
      assert.deepEqual(input.metadata, { agent: "daily" });
      return { id: runId } as never;
    },
  }));

  await service.startRun(startInput({ metadata: { agent: "daily" } }), tokenId);
  assert.equal(calls, 1);
  await assert.rejects(service.startRun(startInput({ promptIds: [] }), tokenId), /geo_run_prompt_set_invalid/u);
  await assert.rejects(service.startRun(startInput({ promptIds: Array.from({ length: 334 }, () => promptId) }), tokenId), /geo_run_prompt_set_invalid/u);
  await assert.rejects(service.startRun(startInput({ promptIds: [promptId, promptId] }), tokenId), /geo_run_prompt_set_invalid/u);
  await assert.rejects(service.startRun(startInput({ mode: "browser_scrape" }), tokenId), /geo_run_mode_invalid/u);
  await assert.rejects(service.startRun(startInput({ metadata: [] }), tokenId), /geo_run_metadata_invalid/u);
  await assert.rejects(service.startRun(startInput({ metadata: { value: "я".repeat(9_000) } }), tokenId), /geo_run_metadata_invalid/u);
});

test("recordObservation normalizes owned citations and enforces coherent evidence", async () => {
  const service = createGeoMonitoringService(fakeRepository({
    recordObservation: async (_runId, principal, input) => {
      assert.equal(principal, tokenId);
      assert.deepEqual(input.citations[0], {
        url: "https://kordev.team/services/crm-development/",
        hostname: "kordev.team",
        title: "Разработка CRM",
        sourceOrder: 1,
        isOwned: true,
        category: "owned",
        localPath: "/services/crm-development/",
      });
      return { id: "44444444-4444-4444-8444-444444444444" } as never;
    },
  }));

  await service.recordObservation(runId, tokenId, observationInput());
  await assert.rejects(
    service.recordObservation(runId, tokenId, observationInput({ repetition: 0 })),
    /geo_observation_repetition_invalid/u,
  );
  await assert.rejects(
    service.recordObservation(runId, tokenId, observationInput({ cited: true, linked: true, citations: [{
      url: "https://example.com/source", sourceOrder: 1, category: "other",
    }] })),
    /geo_observation_owned_citation_required/u,
  );
  await assert.rejects(
    service.recordObservation(runId, tokenId, observationInput({ cited: false, linked: true, sourceOrder: null, citations: [{
      url: "https://example.com/source", sourceOrder: 1, category: "other",
    }] })),
    /geo_observation_owned_link_required/u,
  );
  await assert.rejects(
    service.recordObservation(runId, tokenId, observationInput({ responseSnapshot: "я".repeat(8_193) })),
    /geo_observation_snapshot_invalid/u,
  );
});

test("recordObservation returns safe errors without echoing supplied snapshots or URLs", async () => {
  const secretUrl = "javascript:very-secret-value";
  const secretSnapshot = "private-snapshot-value".repeat(900);
  const service = createGeoMonitoringService(fakeRepository());
  for (const promise of [
    service.recordObservation(runId, tokenId, observationInput({ citations: [{ url: secretUrl, sourceOrder: 1, category: "owned" }] })),
    service.recordObservation(runId, tokenId, observationInput({ responseSnapshot: secretSnapshot })),
  ]) {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^geo_/u);
      assert.doesNotMatch(error.message, /secret|private-snapshot/u);
      return true;
    });
  }
});

test("finishRun validates terminal status and bounded counters before repository ownership checks", async () => {
  let received: unknown;
  const service = createGeoMonitoringService(fakeRepository({
    finishRun: async (_runId, principal, input) => {
      assert.equal(principal, tokenId);
      received = input;
      return input as never;
    },
  }));
  await service.finishRun(runId, tokenId, {
    status: "success",
    completedCount: 3,
    storedCount: 3,
    metadata: { source: "agent" },
  });
  assert.deepEqual(received, {
    status: "success",
    completedCount: 3,
    storedCount: 3,
    errorCode: null,
    metadata: { source: "agent" },
  });
  await assert.rejects(service.finishRun(runId, tokenId, {
    status: "running" as never, completedCount: 0, storedCount: 0,
  }), /geo_run_status_invalid/u);
  await assert.rejects(service.finishRun(runId, tokenId, {
    status: "success", completedCount: 2, storedCount: 3,
  }), /geo_run_counts_invalid/u);
});
