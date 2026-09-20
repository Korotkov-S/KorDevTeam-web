import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { loadPortfolioSources } from "../../src/server/portfolio/loader";
import { loadPortfolioMediaManifest } from "../../src/server/portfolio/mediaManifest";

test("media manifest covers every portfolio slug exactly once", async () => {
  const cases = await loadPortfolioSources();
  const media = await loadPortfolioMediaManifest();
  assert.deepEqual(media.map(item => item.slug).sort(), cases.map(item => item.slug).sort());
});

test("every portfolio cover exists as a decodable 1600 by 1000 WebP", async () => {
  const media = await loadPortfolioMediaManifest();
  for (const item of media) {
    const filename = path.resolve("public", item.output.replace(/^\//, ""));
    await access(filename);
    const metadata = await sharp(filename).metadata();
    assert.equal(metadata.format, "webp", item.slug);
    assert.deepEqual([metadata.width, metadata.height], [1600, 1000], item.slug);
  }
});

test("every portfolio case uses its generated cover as the first screenshot", async () => {
  const cases = await loadPortfolioSources();
  const media = await loadPortfolioMediaManifest();
  const mediaBySlug = new Map(media.map(item => [item.slug, item]));

  for (const record of cases) {
    const item = mediaBySlug.get(record.slug);
    assert.ok(item, `missing media manifest entry for ${record.slug}`);
    const screenshot = record.payload.screenshots?.[0];
    assert.ok(screenshot, `missing primary screenshot for ${record.slug}`);
    assert.equal(screenshot.src, item.output, record.slug);
    assert.equal(screenshot.alt, item.alt, record.slug);
    assert.deepEqual([screenshot.width, screenshot.height], [1600, 1000], record.slug);
  }
});
