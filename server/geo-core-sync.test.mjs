import assert from "node:assert/strict";
import test from "node:test";

import { runGeoCoreSyncCommand } from "./geo-core-sync.mjs";

test("GEO core sync prints compact counts", async () => {
  const lines = [];
  const build = { entry: { module: { async syncGeoPromptCatalog() {
    return { inserted: 48, promoted: 0, preserved: 0 };
  } } } };
  assert.equal(await runGeoCoreSyncCommand(async () => build, { info: (line) => lines.push(line), error: (line) => lines.push(line) }), 0);
  assert.deepEqual(lines, ["GEO prompt catalog synced: inserted=48 promoted=0 preserved=0"]);
});

test("GEO core sync never prints build or database secrets", async () => {
  const lines = [];
  const build = { entry: { module: { async syncGeoPromptCatalog() { throw new Error("postgres password secret"); } } } };
  assert.equal(await runGeoCoreSyncCommand(async () => build, { info() {}, error: (line) => lines.push(line) }), 1);
  assert.deepEqual(lines, ["GEO prompt catalog sync failed."]);
});
