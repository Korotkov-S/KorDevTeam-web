import assert from "node:assert/strict";
import test from "node:test";
import * as analytics from "./analytics";
import type { GeoAnalyticsRow } from "./analytics";

function row(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1", runStatus: "success", platform: "yandex_alice", surface: "alice_web", mode: "live_ui",
    language: "ru", region: "RU", promptSetFingerprint: "a".repeat(64), runPromptIds: ["generic"],
    plannedCount: 3, completedCount: 3, storedCount: 3, runStartedAt: "2026-10-08T06:00:00.000Z",
    runCompletedAt: "2026-10-08T06:01:00.000Z", runSessionPersonalized: false, runComparisonEligible: true,
    promptId: "generic", topicId: "topic", category: "informational", promptText: "Как выбрать CRM",
    promptUpdatedAt: "2026-10-01T00:00:00.000Z", sessionPersonalized: false, repetition: 1,
    mentioned: false, cited: false, ownedCitationCount: 0, totalCitationCount: 0, expectedOwnedCitationCount: 0,
    ownedEntityMentionCount: 0, confirmedCompetitorMentionCount: 0, ...overrides,
  } as GeoAnalyticsRow;
}
const triple = (overrides: Record<string, unknown> = {}) => [1, 2, 3].map(repetition => row({ ...overrides, repetition }));

test("full_run_before_projection rejects a missing sibling even when one triple is complete", () => {
  const result = analytics.summarizeGeoObservations(triple({ runPromptIds: ["generic", "sibling"], plannedCount: 6, completedCount: 6, storedCount: 6 }));
  assert.equal(result.sample.observations, 0);
});
test("counter-only success and an explicitly ineligible correction cannot become observations", () => {
  for (const fields of [{ storedCount: 2 }, { completedCount: 2 }, { runCompletedAt: null }, { runComparisonEligible: false }])
    assert.equal(analytics.summarizeGeoObservations(triple(fields)).sample.observations, 0);
});
test("mixed_personalization is excluded as a whole rather than filtering away the conflicting repetition", () => {
  const rows = triple(); rows[2] = row({ repetition: 3, sessionPersonalized: true });
  assert.equal(analytics.summarizeGeoObservations(rows).sample.observations, 0);
  assert.equal(analytics.summarizeGeoObservations(triple({ runSessionPersonalized: true })).sample.observations, 0);
});
test("edited_definition cannot use a current question as invented historical evidence", () => {
  assert.equal(analytics.summarizeGeoObservations(triple({ promptUpdatedAt: "2026-10-08T07:00:00.000Z" })).sample.observations, 0);
});
test("same_day_not_duplicate: three real complete run IDs are sufficient, duplicate IDs are not", () => {
  const build = (analytics as unknown as { buildGeoSnapshots?: (rows: GeoAnalyticsRow[]) => unknown[] }).buildGeoSnapshots;
  assert.equal(typeof build, "function");
  const snapshots = build!([1, 2, 3].flatMap(n => triple({ runId: `run-${n}`, runCompletedAt: `2026-10-08T06:0${n}:00.000Z` })));
  assert.equal(analytics.compareGeoSnapshots(snapshots as never).status, "comparable");
  assert.equal(analytics.compareGeoSnapshots([snapshots[0], snapshots[0], snapshots[0]] as never).status, "insufficient_baseline");
  for (const fields of [{ surface: "another_surface" }, { sessionPersonalized: true, runSessionPersonalized: true }, { region: "RU-MOW" }, { mode: "api_probe" }]) {
    const other = build!(triple({ ...fields, runId: "other" }));
    assert.equal(analytics.compareGeoSnapshots([snapshots[0], snapshots[1], other[0]] as never).status, "incomparable_prompt_sets");
  }
});
test("category_zero_vs_unchecked keeps a tested negative separate from absent evidence and brand discovery", async () => {
  const { summarizeGeoControl } = await import("./control");
  const rows = [...triple(), ...triple({ runId: "brand-run", promptId: "brand", runPromptIds: ["brand"], category: "brand", promptText: "KorDevTeam", mentioned: true, cited: true, ownedCitationCount: 1, totalCitationCount: 1 })];
  const prompts = [{ id: "generic", category: "informational", language: "ru", region: "RU", topicId: "topic" }, { id: "brand", category: "brand", language: "ru", region: "RU", topicId: "topic" }, { id: "unchecked", category: "local", language: "ru", region: "RU-MOW", topicId: "local" }];
  const result = summarizeGeoControl({ rows, prompts, platforms: ["yandex_alice", "bing_copilot"], filters: {} });
  const generic = result.coverage.find(r => r.platform === "yandex_alice" && r.category === "nonbrand")!;
  assert.equal(generic.plannedQuestions, 2); assert.equal(generic.checkedQuestions, 1); assert.equal(generic.uncheckedQuestions, 1);
  assert.deepEqual(generic.mentionRate, { numerator: 0, denominator: 3, value: 0 });
  const brand = result.coverage.find(r => r.platform === "yandex_alice" && r.category === "brand")!;
  assert.deepEqual(brand.mentionRate, { numerator: 3, denominator: 3, value: 1 });
  assert.deepEqual(result.coverage.find(r => r.platform === "bing_copilot" && r.category === "nonbrand")!.citationRate, { numerator: 0, denominator: 0, value: null });
  assert.equal(result.cohorts.every(c => c.completeSnapshots === 1 && c.decisionReady === false), true);
});
test("category coverage counts the latest full triple once and never relabels an older positive as present growth", async () => {
  const { summarizeGeoControl } = await import("./control");
  const result = summarizeGeoControl({ rows: [...triple({ runId: "old", runCompletedAt: "2026-10-08T06:01:00.000Z", mentioned: true }), ...triple({ runId: "new", runCompletedAt: "2026-10-08T06:02:00.000Z" })],
    prompts: [{ id: "generic", category: "informational", language: "ru", region: "RU", topicId: "topic" }], platforms: ["yandex_alice"], filters: {} });
  assert.equal(result.coverage[1].checkedQuestions, 1); assert.equal(result.coverage[1].mentionRate.denominator, 3); assert.equal(result.coverage[1].mentionRate.numerator, 0);
  assert.equal(result.cohorts[0].completeSnapshots, 2); assert.equal(result.cohorts[0].decisionReady, false);
});
