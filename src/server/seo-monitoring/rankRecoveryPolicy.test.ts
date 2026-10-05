import assert from "node:assert/strict";
import { test } from "node:test";
import * as policy from "./rankRecoveryPolicy";
test("paid submission window is Moscow 00:30 inclusive through 06:00 exclusive", () => {
  for (const [date, want] of [
    ["2026-10-04T21:29:59Z", false],
    ["2026-10-04T21:30:00Z", true],
    ["2026-10-05T02:59:59Z", true],
    ["2026-10-05T03:00:00Z", false],
  ] as const)
    assert.equal(policy.isSubmissionWindow(new Date(date)), want);
});
test("retry deadlines retain the original window and never shorten Retry-After", () => {
  const now = new Date("2026-10-04T22:00:00Z");
  assert.equal(
    policy.nextRetryAt({ now, attempt: 1 }).toISOString(),
    "2026-10-04T22:10:00.000Z",
  );
  assert.equal(
    policy.nextRetryAt({ now, attempt: 2 }).toISOString(),
    "2026-10-04T22:30:00.000Z",
  );
  assert.equal(
    policy.nextRetryAt({ now, attempt: 3 }).toISOString(),
    "2026-10-05T00:00:00.000Z",
  );
  assert.equal(
    policy
      .nextRetryAt({ now, attempt: 1, retryAfterSeconds: 1000 })
      .toISOString(),
    "2026-10-04T22:16:40.000Z",
  );
});
