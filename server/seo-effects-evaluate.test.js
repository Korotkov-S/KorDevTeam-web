import assert from "node:assert/strict";
import test from "node:test";
import { runEffectsEvaluation } from "./seo-effects-evaluate.mjs";

test("effects CLI evaluates saved evidence once and exposes only safe counts/errors", async () => {
  const logs = []; let calls = 0;
  const logger = { info: s => logs.push(s), error: s => logs.push(s) };
  assert.equal(await runEffectsEvaluation(async () => ({ entry: { module: { evaluateSeoChanges: async () => {
    calls++; return { inserted: 6, unchanged: 0 };
  } } } }), logger), 0);
  assert.equal(calls, 1); assert.deepEqual(logs, ['{"inserted":6,"unchanged":0}']);
  assert.equal(await runEffectsEvaluation(async () => { throw Error("private-secret"); }, logger), 1);
  assert.equal(logs.at(-1), "seo_effect_evaluation_failed");
  assert.equal(logs.join().includes("private"), false);
});
