import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSeoEffect, type EffectInput } from "./effects";

export function effectFixture(): EffectInput {
  return {
    source: "yandex_webmaster", checkpoint: 7, now: "2026-10-20T09:00:00Z",
    change: { id: "change", pagePath: "/blog/test/", type: "content", appliedAt: "2026-10-06T12:00:00Z", contentVersion: 2 },
    publication: { pagePath: "/blog/test/", version: 2, indexable: true },
    cohort: ["query"], currentCohort: ["query"], subsequentChanges: [],
    runs: [{ id: "run", status: "success", requestedFrom: "2026-09-29", requestedTo: "2026-10-17", startedAt: "2026-10-20T06:00:00Z", completedAt: "2026-10-20T06:01:00Z" }],
    index: { status: "indexed", checkedAt: "2026-10-20T07:00:00Z", lastCrawlAt: "2026-10-10T07:00:00Z", publishedVersion: 2, pagePath: "/blog/test/" },
    metrics: [
      { queryId: "query", date: "2026-10-01", regionCode: "ru", device: "desktop", impressions: 100, clicks: 2, averagePosition: 20 },
      { queryId: "query", date: "2026-10-08", regionCode: "ru", device: "desktop", impressions: 100, clicks: 3, averagePosition: 18 },
    ],
  };
}

test("full source-day windows, weighted query samples and observational threshold", () => {
  const result = evaluateSeoEffect(effectFixture());
  assert.equal(result.status, "improved");
  assert.deepEqual(result.windows, { before: { from: "2026-09-29", to: "2026-10-05" }, after: { from: "2026-10-07", to: "2026-10-13" } });
  assert.equal(result.positionDelta, -2);
  assert.equal(result.baseline.impressions, 100);
  assert.equal(result.after.clicks, 3);
  assert.equal(result.baseline.retrospective, true);
  assert.equal(result.policy.minImpressionsPerQuery, 100);
  const same = effectFixture(); same.metrics[1].averagePosition = 19.5;
  assert.equal(evaluateSeoEffect(same).status, "no_material_change");
  same.metrics[1].averagePosition = 22;
  assert.equal(evaluateSeoEffect(same).status, "declined");
});

test("source calendars skip the change day and unfinished after windows", () => {
  const input = effectFixture(); input.change.appliedAt = "2026-10-07T01:00:00Z";
  input.now = "2026-10-14T09:00:00Z";
  assert.equal(evaluateSeoEffect(input).status, "pending_period");
  input.source = "google_search_console";
  assert.deepEqual(evaluateSeoEffect(input).windows.after, { from: "2026-10-07", to: "2026-10-13" });
  input.checkpoint = 28;
  assert.equal(evaluateSeoEffect(input).status, "pending_period");
});

test("missing rows are not missing coverage but cannot pass sampling", () => {
  const input = effectFixture(); input.metrics = [];
  const result = evaluateSeoEffect(input);
  assert.equal(result.baseline.complete, true);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.positionDelta, null);
  input.metrics = effectFixture().metrics; input.metrics[1].impressions = 99;
  assert.equal(evaluateSeoEffect(input).status, "insufficient_data");
  input.cohort = []; input.currentCohort = [];
  assert.equal(evaluateSeoEffect(input).status, "insufficient_data");
});

test("latest partial/running/stale sources and internal coverage holes defer", () => {
  for (const status of ["partial", "failed", "running"] as const) {
    const input = effectFixture(); input.runs[0].status = status;
    assert.equal(evaluateSeoEffect(input).status, "pending_source");
  }
  const stale = effectFixture(); stale.runs[0].startedAt = "2026-10-16T06:00:00Z";
  assert.equal(evaluateSeoEffect(stale).status, "pending_source");
  const gap = effectFixture(); gap.runs[0].requestedTo = "2026-10-05";
  gap.runs.push({ ...gap.runs[0], id: "later", requestedFrom: "2026-10-09", requestedTo: "2026-10-17", startedAt: "2026-10-20T07:00:00Z" });
  assert.equal(evaluateSeoEffect(gap).status, "pending_coverage");
  gap.runs.push({ ...gap.runs[0], id: "fill", requestedFrom: "2026-10-06", requestedTo: "2026-10-08" });
  assert.equal(evaluateSeoEffect(gap).status, "improved");
});

test("refresh, canonical, version, source errors and subsequent page changes gate conclusions", () => {
  for (const status of ["canonical_conflict", "not_indexed", "failed"] as const) {
    const input = effectFixture(); input.index!.status = status;
    assert.equal(evaluateSeoEffect(input).status, "pending_refresh");
  }
  const input = effectFixture(); input.index!.lastCrawlAt = "2026-10-05T09:00:00Z";
  assert.equal(evaluateSeoEffect(input).status, "pending_refresh");
  input.index = null;
  assert.equal(evaluateSeoEffect(input).status, "pending_refresh");
  const changed = effectFixture(); changed.subsequentChanges = ["2026-10-08T12:00:00Z"];
  assert.equal(evaluateSeoEffect(changed).status, "confounded");
  changed.subsequentChanges = []; changed.publication!.version = 3;
  assert.equal(evaluateSeoEffect(changed).status, "confounded");
  const drift = effectFixture(); drift.currentCohort = ["other"];
  assert.equal(evaluateSeoEffect(drift).status, "incompatible");
  drift.currentCohort = ["query", "added"];
  assert.equal(evaluateSeoEffect(drift).status, "improved", "new keys do not enter frozen cohort");
});

test("city/all-device rows are excluded and query means have equal weights", () => {
  const input = effectFixture(); input.cohort.push("query2"); input.currentCohort.push("query2");
  input.metrics.push(
    { ...input.metrics[0], queryId: "query2", impressions: 10000, averagePosition: 10 },
    { ...input.metrics[1], queryId: "query2", impressions: 10000, averagePosition: 12 },
    { ...input.metrics[1], regionCode: "ru-mow", impressions: 50000, averagePosition: 1 },
    { ...input.metrics[1], device: "all", impressions: 50000, averagePosition: 1 },
    { ...input.metrics[1], queryId: "not-in-cohort", impressions: 50000, averagePosition: 1 },
  );
  const result = evaluateSeoEffect(input);
  assert.equal(result.baseline.averagePosition, 15);
  assert.equal(result.after.averagePosition, 15);
  assert.equal(result.status, "no_material_change");
  assert.equal(result.after.impressions, 10100);
});

test("frozen complete baseline survives later metric corrections; incomplete baseline is not frozen", () => {
  const input = effectFixture(); const first = evaluateSeoEffect(input);
  input.baseline = first.baseline; input.metrics[0].averagePosition = 50;
  assert.equal(evaluateSeoEffect(input).baseline.averagePosition, 20);
  input.baseline = { ...first.baseline, complete: false };
  assert.equal(evaluateSeoEffect(input).baseline.averagePosition, 50);
  input.change.type = "other";
  assert.equal(evaluateSeoEffect(input).status, "not_applicable");
});
