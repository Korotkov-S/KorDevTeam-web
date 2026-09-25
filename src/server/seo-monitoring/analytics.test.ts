import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateDailySeries,
  buildComparisonWindows,
  detectCannibalization,
  detectPerformanceProblems,
  positionBucket,
  suppressRecentAdvice,
} from "./analytics";

test("comparison windows are adjacent and have equal inclusive lengths", () => {
  assert.deepEqual(buildComparisonWindows("2026-09-24", 7), {
    current: { from: "2026-09-18", to: "2026-09-24" },
    previous: { from: "2026-09-11", to: "2026-09-17" },
  });
});

test("daily aggregation is impression-weighted, excludes the incomplete date, and preserves gaps", () => {
  const points = aggregateDailySeries([
    { date: "2026-09-20", clicks: 1, impressions: 10, position: 2 },
    { date: "2026-09-20", clicks: 9, impressions: 90, position: 6 },
    { date: "2026-09-22", clicks: 5, impressions: 20, position: 4 },
    { date: "2026-09-23", clicks: 100, impressions: 100, position: 1 },
  ], "2026-09-23");

  assert.deepEqual(points, [
    { date: "2026-09-20", clicks: 10, impressions: 100, ctr: 0.1, averagePosition: 5.6 },
    { date: "2026-09-22", clicks: 5, impressions: 20, ctr: 0.25, averagePosition: 4 },
  ]);
});

test("position buckets are mutually exclusive at every boundary", () => {
  assert.deepEqual([1, 3, 4, 10, 11, 30, 31, 50, 51].map(positionBucket), [
    "1-3", "1-3", "4-10", "4-10", "11-30", "11-30", "31-50", "31-50", ">50",
  ]);
});

test("cannibalization requires meaningful impressions on at least two pages", () => {
  const rows = [
    { pagePath: "/a/", impressions: 120 },
    { pagePath: "/b/", impressions: 80 },
    { pagePath: "/c/", impressions: 9 },
  ];
  assert.deepEqual(detectCannibalization(rows, 50), ["/a/", "/b/"]);
  assert.deepEqual(detectCannibalization(rows, 100), []);
});

test("fall and low-CTR signals require minimum impressions", () => {
  assert.deepEqual(detectPerformanceProblems(
    { impressions: 20, ctr: 0.01, averagePosition: 18 },
    { impressions: 20, ctr: 0.08, averagePosition: 5 },
    { minimumImpressions: 100, positionFall: 5, lowCtr: 0.03 },
  ), []);
  assert.deepEqual(detectPerformanceProblems(
    { impressions: 200, ctr: 0.01, averagePosition: 18 },
    { impressions: 180, ctr: 0.08, averagePosition: 5 },
    { minimumImpressions: 100, positionFall: 5, lowCtr: 0.03 },
  ), ["position_fall", "low_ctr"]);
});

test("a recent matching page change suppresses premature repeat advice", () => {
  const now = new Date("2026-09-25T09:00:00.000Z");
  assert.equal(suppressRecentAdvice([
    { pagePath: "/services/crm/", appliedAt: new Date("2026-09-20T10:00:00.000Z") },
  ], "/services/crm/", now, 14), true);
  assert.equal(suppressRecentAdvice([
    { pagePath: "/services/crm/", appliedAt: new Date("2026-08-20T10:00:00.000Z") },
  ], "/services/crm/", now, 14), false);
});
