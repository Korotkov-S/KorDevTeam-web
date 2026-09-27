import assert from "node:assert/strict";
import test from "node:test";

import { compareGeoSnapshots, summarizeGeoObservations, type GeoAnalyticsRow } from "./analytics";

function row(overrides: Partial<GeoAnalyticsRow> = {}): GeoAnalyticsRow {
  return {
    runId: "run-1",
    runStatus: "success",
    platform: "chatgpt_search",
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
    row({ promptId: "only-two", repetition: 1 }),
    row({ promptId: "only-two", repetition: 2 }),
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

test("GEO comparisons require equal prompt sets and three weekly snapshots", () => {
  const base = {
    platform: "chatgpt_search" as const, mode: "live_ui" as const, language: "ru", region: "RU", topicId: "topic-1",
    promptSetFingerprint: "a".repeat(64), promptIds: ["a", "b"], mentionRate: 0.5, citationRate: 0.25,
  };
  assert.deepEqual(compareGeoSnapshots([
    { ...base, date: "2026-09-13" },
    { ...base, date: "2026-09-20", mentionRate: 0.6 },
  ]), { status: "insufficient_baseline", requiredSnapshots: 3, availableSnapshots: 2 });

  const incomparable = compareGeoSnapshots([
    { ...base, date: "2026-09-13" },
    { ...base, date: "2026-09-20", promptIds: ["a", "c"] },
    { ...base, date: "2026-09-27" },
  ]);
  assert.deepEqual(incomparable, { status: "incomparable_prompt_sets" });

  const compared = compareGeoSnapshots([
    { ...base, date: "2026-09-13" },
    { ...base, date: "2026-09-20", mentionRate: 0.6, citationRate: 0.3 },
    { ...base, date: "2026-09-27", mentionRate: 0.75, citationRate: 0.5 },
  ]);
  assert.deepEqual(compared, {
    status: "comparable",
    dimensions: {
      platform: "chatgpt_search", mode: "live_ui", language: "ru", region: "RU", topicId: "topic-1",
      promptSetFingerprint: "a".repeat(64), promptIds: ["a", "b"],
    },
    period: { from: "2026-09-13", to: "2026-09-27", snapshots: 3 },
    mentionRate: { first: 0.5, last: 0.75, delta: 0.25 },
    citationRate: { first: 0.25, last: 0.5, delta: 0.25 },
  });
});
