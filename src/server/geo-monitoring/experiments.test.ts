import assert from "node:assert/strict";
import test from "node:test";

import { evaluateExperimentMetric, milestoneLabel } from "./experiments";
import { createGeoMonitoringService } from "./service";
import type { GeoRepository } from "./repository";

const adminId = "11111111-1111-4111-8111-111111111111";
const tokenId = "22222222-2222-4222-8222-222222222222";
const experimentId = "33333333-3333-4333-8333-333333333333";
const recommendationId = "44444444-4444-4444-8444-444444444444";
const promptIds = ["55555555-5555-4555-8555-555555555555"];

test("experiment milestones are explicit and final verdict follows direction and minimum delta", () => {
  assert.equal(milestoneLabel(7), "early_signal");
  assert.equal(milestoneLabel(14), "intermediate");
  assert.equal(milestoneLabel(28), "final");
  assert.deepEqual(evaluateExperimentMetric({ milestone: 7, baseline: 0.2, result: 0.3, direction: "increase",
    minimumDelta: 0.05, baselineSample: 9, resultSample: 9, complete: true, confoundingChanges: [] }).verdict, "pending");
  assert.equal(evaluateExperimentMetric({ milestone: 28, baseline: 0.2, result: 0.3, direction: "increase",
    minimumDelta: 0.05, baselineSample: 9, resultSample: 9, complete: true, confoundingChanges: [] }).verdict, "won");
  assert.equal(evaluateExperimentMetric({ milestone: 28, baseline: 0.2, result: 0.24, direction: "increase",
    minimumDelta: 0.05, baselineSample: 9, resultSample: 9, complete: true, confoundingChanges: [] }).verdict, "lost");
  assert.equal(evaluateExperimentMetric({ milestone: 28, baseline: 0.4, result: 0.3, direction: "decrease",
    minimumDelta: 0.05, baselineSample: 9, resultSample: 9, complete: true, confoundingChanges: [] }).verdict, "won");
});

test("insufficient repetitions and later material page changes make attribution inconclusive", () => {
  assert.equal(evaluateExperimentMetric({ milestone: 28, baseline: 0.2, result: 0.5, direction: "increase",
    minimumDelta: 0.05, baselineSample: 9, resultSample: 2, complete: false, confoundingChanges: [] }).verdict, "inconclusive");
  const confounded = evaluateExperimentMetric({ milestone: 28, baseline: 0.2, result: 0.5, direction: "increase",
    minimumDelta: 0.05, baselineSample: 9, resultSample: 9, complete: true, confoundingChanges: ["change-2"] });
  assert.equal(confounded.verdict, "inconclusive");
  assert.equal(confounded.confounded, true);
});

function fakeRepository(overrides: Partial<GeoRepository> = {}): GeoRepository {
  return {
    syncPromptCatalog: async () => ({ inserted: 0, promoted: 0, preserved: 0 }),
    createPromptCandidate: async (input) => input as never,
    updatePrompt: async (input) => input as never,
    updateEntity: async (input) => input as never,
    startRun: async () => ({}) as never,
    recordObservation: async () => ({}) as never,
    finishRun: async () => ({}) as never,
    recordCrawlerChecks: async () => 0,
    upsertGeoReferrals: async () => 0,
    getOverview: async () => ({}) as never,
    listTopics: async () => ({ items: [], nextCursor: null }),
    listEntities: async () => ({ items: [], nextCursor: null }),
    listPrompts: async () => ({ items: [], nextCursor: null }),
    listObservations: async () => ({ items: [], nextCursor: null }),
    getObservationEvidence: async () => ({}) as never,
    listCitations: async () => ({ items: [], nextCursor: null }),
    listFanoutQueries: async () => ({ items: [], nextCursor: null }),
    listReferrals: async () => ({ items: [], nextCursor: null }),
    listCrawlerChecks: async () => ({ items: [], nextCursor: null }),
    listExperiments: async () => ({ items: [], nextCursor: null }),
    createExperimentCandidate: async (input) => input as never,
    approveExperiment: async (input) => input as never,
    linkExperimentChange: async (input) => input as never,
    evaluateExperiment: async (input) => input as never,
    ...overrides,
  };
}

function candidate() {
  return {
    recommendationId,
    pagePath: "/services/crm-development/",
    actionType: "content_answer" as const,
    hypothesis: "Прямой ответ повысит долю цитирования.",
    platform: "chatgpt_search" as const,
    mode: "live_ui" as const,
    language: "ru",
    region: "RU",
    promptIds,
    primaryMetric: "citation_rate" as const,
    direction: "increase" as const,
    minimumDelta: 0.05,
    expectedSignal: "Рост citation rate минимум на 5 п.п.",
  };
}

test("promotion lifecycle fixes immutable dimensions and reserves approval/linking for an admin", async () => {
  let created: any;
  const service = createGeoMonitoringService(fakeRepository({
    createExperimentCandidate: async (input, actor) => { created = { input, actor }; return input as never; },
  }));
  await service.createExperimentCandidate(candidate(), { mcpTokenId: tokenId });
  assert.deepEqual(created.input.evaluationWindows, [7, 14, 28]);
  assert.match(created.input.promptSetFingerprint, /^[0-9a-f]{64}$/u);
  assert.deepEqual(created.actor, { mcpTokenId: tokenId });
  await assert.rejects(service.createExperimentCandidate({ ...candidate(), actionType: "purchased_reviews" as never }, { mcpTokenId: tokenId }), /geo_experiment_action_invalid/u);
  await assert.rejects(service.approveExperiment({ id: experimentId }, { mcpTokenId: tokenId }), /geo_admin_required/u);
  await assert.rejects(service.linkExperimentChange({ id: experimentId, seoChangeId: recommendationId }, { mcpTokenId: tokenId }), /geo_admin_required/u);
  await service.approveExperiment({ id: experimentId }, { adminUserId: adminId });
  await service.linkExperimentChange({ id: experimentId, seoChangeId: recommendationId }, { adminUserId: adminId });
});

test("evaluation requires a full milestone after implementation and never accepts content mutations", async () => {
  let evaluated: any;
  const service = createGeoMonitoringService(fakeRepository({
    evaluateExperiment: async (input, actor) => { evaluated = { input, actor }; return input as never; },
  }), () => new Date("2026-10-01T00:00:00.000Z"));
  await service.evaluateExperiment({ id: experimentId, milestone: 7, evaluatedAt: "2026-09-28T00:00:00.000Z" }, { mcpTokenId: tokenId });
  assert.deepEqual(evaluated.actor, { mcpTokenId: tokenId });
  await assert.rejects(service.evaluateExperiment({ id: experimentId, milestone: 10 as never,
    evaluatedAt: "2026-09-28T00:00:00.000Z" }, { mcpTokenId: tokenId }), /geo_experiment_milestone_invalid/u);
  await assert.rejects(service.evaluateExperiment({ id: experimentId, milestone: 7,
    evaluatedAt: "2026-10-02T00:00:00.000Z" }, { mcpTokenId: tokenId }), /geo_experiment_evaluated_at_invalid/u);
});
