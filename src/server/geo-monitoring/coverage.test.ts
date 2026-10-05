import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageTotals, COVERAGE_PLATFORMS, GEO_SURFACES } from "./coverage";
test("coverage declares exactly four official live UI surfaces", () => {
 assert.deepEqual(COVERAGE_PLATFORMS.map(p=>GEO_SURFACES[p]),["alice_web","google_ai_mode","bing_copilot_search","chatgpt_search_web"]);
});
test("human-cancelled GEO work is not reported as pending or successfully checked", () => {
 const c=coverageTotals([{state:"complete",completedRepetitions:3},{state:"cancelled",completedRepetitions:0},{state:"queued",completedRepetitions:0}]);
 assert.equal(c.completeCount,1);assert.equal(c.cancelledCount,1);assert.equal(c.remainingCount,1);
});
