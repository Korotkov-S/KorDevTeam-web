import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { runRecommendationReconciliation } from "./seo-recommendations-reconcile.mjs";

test("reconciliation CLI bounds stdin and never loads or mutates on malformed input", async () => {
  const logs = []; let calls = 0;
  const logger = { info: s => logs.push(s), error: s => logs.push(s) };
  const load = async () => { calls++; return { entry: { module: { reconcileSeoRecommendations: async commands => { assert.deepEqual(commands, [{ id: "fixture" }]); return { revised: 1, unchanged: 0 }; } } } }; };
  assert.equal(await runRecommendationReconciliation(Readable.from(['[{"id":"fixture"}]']), load, logger), 0);
  assert.equal(calls, 1); assert.equal(logs[0], '{"revised":1,"unchanged":0}');
  for (const value of ['{}', '[]', 'not-json', JSON.stringify(Array(101).fill({})), ' '.repeat(1048577)]) {
    assert.equal(await runRecommendationReconciliation(Readable.from([value]), load, logger), 1);
    assert.equal(calls, 1);
  }
  assert.equal(await runRecommendationReconciliation(Readable.from(['[{}]']), async () => { throw Error("secret-private"); }, logger), 1);
  assert.equal(logs.at(-1), "seo_recommendation_reconcile_failed"); assert.doesNotMatch(logs.join(), /secret-private/);
});
