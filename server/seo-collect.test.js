import assert from "node:assert/strict";
import test from "node:test";

import { parseSeoCollectArgs, runSeoCollectCommand } from "./seo-collect.mjs";

test("CLI accepts only --check and exact source selection", () => {
  assert.deepEqual(parseSeoCollectArgs([]), { check: false });
  assert.deepEqual(parseSeoCollectArgs(["--check", "--source=yandex"]), { check: true, source: "yandex_webmaster" });
  assert.deepEqual(parseSeoCollectArgs(["--source=google"]), { check: false, source: "google_search_console" });
  assert.throws(() => parseSeoCollectArgs(["--source=bing"]), /seo_collect_arguments_invalid/u);
  assert.throws(() => parseSeoCollectArgs(["--check", "--check"]), /seo_collect_arguments_invalid/u);
});

test("check and collection emit compact summaries and return nonzero on failure", async () => {
  const lines = [];
  let checkedWith;
  const logger = { info: (line) => lines.push(line), error: (line) => lines.push(line) };
  const build = { entry: { module: {
    checkSeoCollectionReady: async (options) => { checkedWith = options; return { sources: [{ source: "yandex_webmaster", status: "ready" }] }; },
    runSeoCollection: async () => ({ sources: [{ source: "google_search_console", status: "failed", receivedCount: 0, storedCount: 0, errorCode: "seo_google_auth_failed" }] }),
  } } };
  assert.equal(await runSeoCollectCommand(["--check", "--source=yandex"], async () => build, logger), 0);
  assert.deepEqual(checkedWith, { source: "yandex_webmaster" });
  assert.equal(await runSeoCollectCommand(["--source=google"], async () => build, logger), 1);
  assert.match(lines.join("\n"), /google_search_console:failed received=0 stored=0 error=seo_google_auth_failed/u);
  assert.doesNotMatch(lines.join("\n"), /token|private.key/u);
});
