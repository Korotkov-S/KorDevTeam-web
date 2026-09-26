import assert from "node:assert/strict";
import test from "node:test";

import { runSeoCoreSyncCommand } from "./seo-core-sync.mjs";

test("semantic-core CLI emits compact counts from the production build", async () => {
  const lines = [];
  let calls = 0;
  const build = { entry: { module: {
    async syncSeoSemanticCore() {
      calls++;
      return { inserted: 51, promoted: 4, preserved: 3 };
    },
  } } };

  assert.equal(await runSeoCoreSyncCommand(async () => build, { info: (line) => lines.push(line), error: (line) => lines.push(line) }), 0);
  assert.equal(calls, 1);
  assert.deepEqual(lines, ["SEO semantic core synced: inserted=51 promoted=4 preserved=3"]);
});

test("semantic-core CLI sanitizes failures", async () => {
  const lines = [];
  const build = { entry: { module: { async syncSeoSemanticCore() { throw new Error("postgres password secret"); } } } };
  assert.equal(await runSeoCoreSyncCommand(async () => build, { info() {}, error: (line) => lines.push(line) }), 1);
  assert.deepEqual(lines, ["SEO semantic core sync failed."]);
});
