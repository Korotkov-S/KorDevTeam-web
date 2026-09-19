import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  createConsentRecord,
  parseConsentRecord,
} from "./consent";

test("unknown, accepted, rejected and stale records normalize deterministically", () => {
  assert.equal(parseConsentRecord(null), "unknown");
  assert.equal(parseConsentRecord(JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" })), "accepted");
  assert.equal(parseConsentRecord(JSON.stringify({ version: CONSENT_VERSION, decision: "rejected" })), "rejected");
  assert.equal(parseConsentRecord(JSON.stringify({ version: "old", decision: "accepted" })), "unknown");
  assert.equal(parseConsentRecord("broken"), "unknown");
  assert.equal(parseConsentRecord(JSON.stringify({ version: CONSENT_VERSION, decision: "other" })), "unknown");
});

test("a persisted choice uses the versioned storage contract and an ISO timestamp", () => {
  const record = createConsentRecord("accepted", new Date("2026-09-18T09:30:00.000Z"));

  assert.equal(CONSENT_STORAGE_KEY, "kordev.analytics-consent");
  assert.deepEqual(record, {
    version: "2026-09-18",
    decision: "accepted",
    decidedAt: "2026-09-18T09:30:00.000Z",
  });
});
