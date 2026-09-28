import assert from "node:assert/strict";
import test from "node:test";

import { parseSeoCollectArgs, runSeoCollectCommand } from "./seo-collect.mjs";

test("CLI accepts only --check and exact source selection", () => {
  assert.deepEqual(parseSeoCollectArgs([]), { check: false, skipYandexRank: false });
  assert.deepEqual(parseSeoCollectArgs(["--skip-yandex-rank"]), { check: false, skipYandexRank: true });
  assert.deepEqual(parseSeoCollectArgs(["--check", "--source=yandex"]), { check: true, skipYandexRank: false, source: "yandex_webmaster" });
  assert.deepEqual(parseSeoCollectArgs(["--source=google"]), { check: false, skipYandexRank: false, source: "google_search_console" });
  assert.deepEqual(parseSeoCollectArgs(["--source=metrika"]), { check: false, skipYandexRank: false, source: "yandex_metrika" });
  assert.deepEqual(parseSeoCollectArgs(["--source=yandex-rank"]), { check: false, skipYandexRank: false, source: "yandex_search" });
  assert.deepEqual(parseSeoCollectArgs(["--source=geo-crawler"]), { check: false, skipYandexRank: false, source: "geo_crawler" });
  assert.throws(() => parseSeoCollectArgs(["--source=bing"]), /seo_collect_arguments_invalid/u);
  assert.throws(() => parseSeoCollectArgs(["--check", "--check"]), /seo_collect_arguments_invalid/u);
  assert.throws(() => parseSeoCollectArgs(["--source=yandex-rank", "--skip-yandex-rank"]), /seo_collect_arguments_invalid/u);
});

test("daily collection forwards the paid-rank exclusion", async () => {
  let collectedWith;
  const build = { entry: { module: {
    checkSeoCollectionReady: async () => ({ sources: [] }),
    runSeoCollection: async (options) => { collectedWith = options; return { sources: [], failed: false }; },
  } } };
  assert.equal(await runSeoCollectCommand(["--skip-yandex-rank"], async () => build, { info() {}, error() {} }), 0);
  assert.deepEqual(collectedWith, { skipYandexRank: true });
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

test("Yandex rank target is forwarded and reports its planned matrix compactly", async () => {
  const lines = [];
  let collectedWith;
  const build = { entry: { module: {
    checkSeoCollectionReady: async () => ({ sources: [] }),
    runSeoCollection: async (options) => {
      collectedWith = options;
      return { sources: [{ source: "yandex_search", status: "success", plannedCount: 16, completedCount: 16, storedCount: 16 }] };
    },
  } } };
  assert.equal(await runSeoCollectCommand(["--source=yandex-rank"], async () => build, {
    info: (line) => lines.push(line), error: (line) => lines.push(line),
  }), 0);
  assert.deepEqual(collectedWith, { source: "yandex_search" });
  assert.match(lines.join("\n"), /yandex_search:success planned=16 completed=16 stored=16/u);
});
