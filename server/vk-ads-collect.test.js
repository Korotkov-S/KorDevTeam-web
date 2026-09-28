import assert from "node:assert/strict";
import test from "node:test";

import { parseVkAdsCollectArgs, runVkAdsCollectCommand } from "./vk-ads-collect.mjs";

const report = (mode, overrides = {}) => ({
  mode,
  status: "succeeded",
  errorCode: null,
  correlationId: "00000000-0000-4000-8000-000000000001",
  counters: { campaigns: 3 },
  coveredDateFrom: mode === "check" ? null : "2030-01-01",
  coveredDateTo: mode === "check" ? null : "2030-01-07",
  ...overrides,
});

test("CLI accepts exactly one fixed mode and rejects everything else before build loading", async () => {
  assert.deepEqual(parseVkAdsCollectArgs(["--mode=check"]), { mode: "check" });
  assert.deepEqual(parseVkAdsCollectArgs(["--mode=backfill"]), { mode: "backfill" });
  assert.deepEqual(parseVkAdsCollectArgs(["--mode=daily"]), { mode: "daily" });
  for (const args of [[], ["--mode=check", "--mode=daily"], ["--mode=other"], ["daily"], ["--url=https://example.test"]]) {
    assert.throws(() => parseVkAdsCollectArgs(args), /ads_vk_contract_invalid/u);
    let loaded = false;
    await assert.rejects(runVkAdsCollectCommand(args, async () => { loaded = true; return {}; }), /ads_vk_contract_invalid/u);
    assert.equal(loaded, false);
  }
});

test("CLI dispatches check separately and returns zero only for succeeded reports", async () => {
  const calls = [];
  const lines = [];
  const build = { entry: { module: {
    async checkVkAdsCollectionReady() { calls.push("check"); return report("check"); },
    async runVkAdsCollection(mode) { calls.push(mode); return report(mode); },
  } } };
  const logger = { info: (line) => lines.push(line), error: (line) => lines.push(line) };
  assert.equal(await runVkAdsCollectCommand(["--mode=check"], async () => build, logger), 0);
  assert.equal(await runVkAdsCollectCommand(["--mode=daily"], async () => build, logger), 0);
  assert.deepEqual(calls, ["check", "daily"]);
  assert.equal(lines.length, 2);
  assert.match(lines.join("\n"), /mode=check status=succeeded/u);
});

test("partial, failed, disabled, locked, config, and OAuth reports return one safe error line", async () => {
  for (const errorCode of [
    "ads_vk_sync_partial", "ads_vk_disabled", "ads_vk_sync_locked", "ads_vk_config_invalid", "ads_vk_token_revoked",
  ]) {
    const lines = [];
    const status = errorCode === "ads_vk_sync_partial" ? "partial" : "failed";
    const build = { entry: { module: {
      async runVkAdsCollection() { return { ...report("daily", { status, errorCode }), raw: "client-secret?token=unsafe" }; },
    } } };
    assert.equal(await runVkAdsCollectCommand(["--mode=daily"], async () => build, {
      info: (line) => lines.push(line),
      error: (line) => lines.push(line),
    }), 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp(errorCode, "u"));
    assert.doesNotMatch(lines[0], /client-secret|token=|https?:/iu);
  }
});

test("malformed runtime output is rejected without reflecting its contents", async () => {
  const lines = [];
  const build = { entry: { module: {
    async runVkAdsCollection() { return { status: "owned client-secret?token=unsafe" }; },
  } } };
  assert.equal(await runVkAdsCollectCommand(["--mode=backfill"], async () => build, {
    info: (line) => lines.push(line), error: (line) => lines.push(line),
  }), 1);
  assert.deepEqual(lines, ["VK Ads collection failed."]);
});
