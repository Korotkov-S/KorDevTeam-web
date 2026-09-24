import assert from "node:assert/strict";
import test from "node:test";
import { parseArticleSyncArgs } from "./sync-articles";

test("article sync CLI accepts one or more repeated slug arguments", () => {
  assert.deepEqual(
    parseArticleSyncArgs(["--slug", "first-article", "--slug", "second-article"]),
    ["first-article", "second-article"],
  );
});

test("article sync CLI rejects empty, missing, duplicate, and unknown arguments", () => {
  for (const args of [
    [],
    ["--slug"],
    ["--slug", ""],
    ["--slug", "first-article", "--slug", "first-article"],
    ["--all"],
    ["first-article"],
  ]) {
    assert.throws(() => parseArticleSyncArgs(args), /article_sync_invalid_arguments/);
  }
});
