import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AD_ACTOR_KINDS,
  AD_CHANNELS,
  AD_CHANGED_VARIABLES,
  AD_CONVERSION_PATHS,
  AD_EVIDENCE_GRADES,
  AD_EXPERIMENT_STATUSES,
  AD_EXPERIMENT_VERDICTS,
  AD_HYPOTHESIS_STATUSES,
  AD_LEAD_CLASSIFICATIONS,
  AD_LEARNING_CONFIDENCES,
  AD_METRIC_GRANULARITIES,
  AD_PRIMARY_METRICS,
  AD_RESEARCH_SOURCE_TYPES,
  AD_VARIANT_STATUSES,
  type AdsPage,
} from "./contracts";

test("advertising contracts expose the exact bounded lifecycle vocabulary", () => {
  assert.deepEqual(AD_EVIDENCE_GRADES, ["A", "B", "C"]);
  assert.deepEqual(AD_RESEARCH_SOURCE_TYPES, [
    "official_guide", "case_study", "public_ad", "competitor_landing", "wordstat", "product", "internal",
  ]);
  assert.deepEqual(AD_CHANNELS, ["vk", "yandex", "telegram", "web", "internal"]);
  assert.deepEqual(AD_HYPOTHESIS_STATUSES, [
    "candidate", "proposed", "approved", "testing", "validated", "rejected", "inconclusive", "archived",
  ]);
  assert.deepEqual(AD_CONVERSION_PATHS, ["vk_lead_form", "site", "message"]);
  assert.deepEqual(AD_CHANGED_VARIABLES, ["offer", "audience", "creative_angle", "conversion_path"]);
  assert.deepEqual(AD_PRIMARY_METRICS, ["qualified_lead_cost", "sale_cost", "romi"]);
  assert.deepEqual(AD_EXPERIMENT_STATUSES, [
    "draft", "awaiting_approval", "approved", "creating", "moderation", "scheduled", "running", "stopping",
    "completed", "analyzed", "rejected_moderation", "invalid_tracking", "stopped_safety", "failed_reconciliation",
  ]);
  assert.deepEqual(AD_VARIANT_STATUSES, ["draft", "moderation", "scheduled", "running", "paused", "rejected", "completed"]);
  assert.deepEqual(AD_METRIC_GRANULARITIES, ["hour", "day"]);
  assert.deepEqual(AD_EXPERIMENT_VERDICTS, ["winner", "loser", "inconclusive", "invalid_tracking", "stopped_safety"]);
  assert.deepEqual(AD_LEAD_CLASSIFICATIONS, ["submitted", "contacted", "qualified", "won", "lost", "open"]);
  assert.deepEqual(AD_LEARNING_CONFIDENCES, ["low", "medium", "high"]);
  assert.deepEqual(AD_ACTOR_KINDS, ["agent", "admin", "mcp", "system", "vendor"]);
});

test("advertising list results carry an explicit nullable cursor", () => {
  const first: AdsPage<string> = { items: ["candidate"], nextCursor: "opaque" };
  const last: AdsPage<string> = { items: [], nextCursor: null };
  assert.deepEqual(first, { items: ["candidate"], nextCursor: "opaque" });
  assert.deepEqual(last, { items: [], nextCursor: null });
});
