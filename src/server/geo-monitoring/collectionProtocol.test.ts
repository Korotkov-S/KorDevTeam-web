import assert from "node:assert/strict";
import { test } from "node:test";
import {
  missingRepetitions,
  geoAvailabilityRetry,
  shouldRefreshFreeSeo,
  coverageTotals,
} from "./coverage";
test("remaining-answer planner never repeats recorded observations", () => {
  assert.deepEqual(missingRepetitions([1, 2]), [3]);
  assert.deepEqual(missingRepetitions([1, 2, 3]), []);
});
test("availability backoff stops after three attempts and never retries CAPTCHA automatically", () => {
  const now = new Date("2026-10-05T06:00:00Z");
  assert.equal(
    geoAvailabilityRetry(now, 1, "platform_unavailable")?.toISOString(),
    "2026-10-05T06:30:00.000Z",
  );
  assert.equal(
    geoAvailabilityRetry(now, 2, "platform_unavailable")?.toISOString(),
    "2026-10-05T08:00:00.000Z",
  );
  assert.equal(geoAvailabilityRetry(now, 3, "platform_unavailable"), null);
  assert.equal(geoAvailabilityRetry(now, 1, "captcha_required"), null);
});
test("later daily wakes skip free SEO even after an earlier source failed", () => {
  const now = new Date("2026-10-05T08:00:00Z");
  assert.equal(
    shouldRefreshFreeSeo(new Date("2026-10-05T06:00:00Z"), now),
    false,
  );
  assert.equal(
    shouldRefreshFreeSeo(new Date("2026-10-04T06:00:00Z"), now),
    true,
  );
});
test("coverage needs full triples, not an artificial zero or a weekly promise", () => {
  const result = coverageTotals(
    Array.from({ length: 152 }, () => ({
      state: "queued",
      completedRepetitions: 0,
    })),
  );
  assert.equal(result.minimumDays, 26);
  assert.equal(result.remainingCount, 152);
  assert.equal(result.completeCount, 0);
});
