import assert from "node:assert/strict";
import test from "node:test";

import { buildGeoSnapshots, compareGeoSnapshots, summarizeGeoObservations, type GeoAnalyticsRow } from "./analytics";

function row(overrides: Partial<GeoAnalyticsRow> = {}): GeoAnalyticsRow {
  return {
    runId: "run-1",
    runStatus: "success",
    platform: "chatgpt_search",
    surface: "chatgpt_search_web",
    runPromptIds: ["prompt-1"], plannedCount: 3, completedCount: 3, storedCount: 3,
    runStartedAt: "2026-09-01T00:00:00Z", runCompletedAt: "2026-09-01T00:01:00Z",
    runSessionPersonalized: false, runComparisonEligible: true, sessionPersonalized: false,
    category: "commercial", promptText: "Какая CRM подходит", promptUpdatedAt: "2026-08-01T00:00:00Z",
    mode: "live_ui",
    language: "ru",
    region: "RU",
    promptSetFingerprint: "a".repeat(64),
    promptId: "prompt-1",
    topicId: "topic-1",
    repetition: 1,
    mentioned: true,
    cited: true,
    ownedCitationCount: 1,
    totalCitationCount: 2,
    expectedOwnedCitationCount: 1,
    ownedEntityMentionCount: 1,
    confirmedCompetitorMentionCount: 1,
    ...overrides,
  };
}

test("GEO rates expose transparent numerators and denominators and ignore incomplete runs/prompts", () => {
  const rows = [
    row(),
    row({ repetition: 2, cited: false, ownedCitationCount: 0, totalCitationCount: 0,
      expectedOwnedCitationCount: 0, confirmedCompetitorMentionCount: 0 }),
    row({ repetition: 3, mentioned: false, ownedEntityMentionCount: 0,
      ownedCitationCount: 1, totalCitationCount: 1, expectedOwnedCitationCount: 0,
      confirmedCompetitorMentionCount: 0 }),
    row({ runId: "partial", runStatus: "partial", promptId: "ignored", repetition: 1 }),
    row({ runId: "failed", runStatus: "failed", promptId: "ignored", repetition: 2 }),
    row({ runId: "incomplete", runPromptIds: ["only-two"], promptId: "only-two", repetition: 1 }),
    row({ runId: "incomplete", runPromptIds: ["only-two"], promptId: "only-two", repetition: 2 }),
  ];
  const result = summarizeGeoObservations(rows);
  assert.deepEqual(result.mentionRate, { numerator: 2, denominator: 3, value: 2 / 3 });
  assert.deepEqual(result.citationRate, { numerator: 2, denominator: 3, value: 2 / 3 });
  assert.deepEqual(result.citationShare, { numerator: 2, denominator: 3, value: 2 / 3 });
  assert.deepEqual(result.ownedSourceCoverage, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(result.shareOfVoice, { numerator: 2, denominator: 3, value: 2 / 3 });
  assert.deepEqual(result.sample, { runs: 1, prompts: 1, observations: 3, requiredRepetitions: 3 });
});

test("GEO action matrix keeps the four approved evidence buckets separate", () => {
  const configurations = [
    { promptId: "strong", mentioned: true, cited: true, confirmedCompetitorMentionCount: 0 },
    { promptId: "source", mentioned: true, cited: false, confirmedCompetitorMentionCount: 0 },
    { promptId: "brand", mentioned: false, cited: true, confirmedCompetitorMentionCount: 0 },
    { promptId: "attention", mentioned: false, cited: false, confirmedCompetitorMentionCount: 1 },
  ];
  const rows = configurations.flatMap((configuration) => [1, 2, 3].map((repetition) => row({
    ...configuration,
    runPromptIds: configurations.map(value => value.promptId), plannedCount: 12, completedCount: 12, storedCount: 12,
    repetition,
    ownedEntityMentionCount: configuration.mentioned ? 1 : 0,
    ownedCitationCount: configuration.cited ? 1 : 0,
    totalCitationCount: configuration.cited ? 1 : 0,
    expectedOwnedCitationCount: configuration.cited ? 1 : 0,
  })));
  assert.deepEqual(summarizeGeoObservations(rows).actionMatrix, {
    strong: { prompts: 1, promptIds: ["strong"] },
    strengthenSource: { prompts: 1, promptIds: ["source"] },
    restoreBrand: { prompts: 1, promptIds: ["brand"] },
    attention: { prompts: 1, promptIds: ["attention"] },
  });
});

test("GEO comparisons require equal full plans and three distinct complete snapshots", () => {
  const snapshots = buildGeoSnapshots([13, 20, 27].flatMap(day => [1, 2, 3].map(repetition => row({
    runId: `run-${day}`, runCompletedAt: `2026-09-${day}T00:01:00.000Z`, repetition,
    mentioned: day === 27 || repetition === 1, cited: day === 27 || repetition === 1,
  }))));
  assert.deepEqual(compareGeoSnapshots(snapshots.slice(0, 2)), { status: "insufficient_baseline", requiredSnapshots: 3, availableSnapshots: 2 });
  const incomparable = compareGeoSnapshots([snapshots[0]!, { ...snapshots[1]!, fullPromptIds: ["different"] }, snapshots[2]!]);
  assert.deepEqual(incomparable, { status: "incomparable_prompt_sets" });
  const compared = compareGeoSnapshots(snapshots);
  assert.equal(compared.status, "comparable");
  if (compared.status !== "comparable") throw new Error("comparison missing");
  assert.deepEqual(compared.period, { from: "2026-09-13T00:01:00.000Z", to: "2026-09-27T00:01:00.000Z", snapshots: 3 });
  assert.deepEqual(compared.mentionRate, { first: 1 / 3, last: 1, delta: 1 - 1 / 3 });
  assert.deepEqual(compared.citationRate, { first: 1 / 3, last: 1, delta: 1 - 1 / 3 });
});
