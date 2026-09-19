import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static HTML does not request analytics vendors before consent", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']*(?:mc\.yandex\.ru|top-fwz1\.mail\.ru)/i);
  assert.doesNotMatch(html, /<img[^>]+src=["'][^"']*(?:mc\.yandex\.ru|top-fwz1\.mail\.ru)/i);
  assert.doesNotMatch(html, /window\._tmr|\bym\s*\(/);
});
