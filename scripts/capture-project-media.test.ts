import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  dismissByExactText,
  renderFallbackCover,
  validateCaptureUrl,
} from "./capture-project-media";
import { portfolioMediaItem } from "../src/server/portfolio/mediaManifest";

test("capture target rejects local, private and unsupported addresses", () => {
  for (const url of [
    "http://127.0.0.1/admin",
    "http://10.0.0.8/",
    "http://169.254.169.254/metadata",
    "http://[::1]/admin",
    "file:///etc/passwd",
  ]) assert.throws(() => validateCaptureUrl(url), /portfolio_capture_url_forbidden/);
  assert.equal(validateCaptureUrl("https://simsdynastytree.com/ru").hostname, "simsdynastytree.com");
});

test("capture manifest can declare an exact consent button label", () => {
  const item = portfolioMediaItem.parse({
    slug: "example",
    mode: "capture",
    sourceUrl: "https://example.com",
    output: "/projects/portfolio/example/cover.webp",
    alt: "Example",
    viewport: { width: 1440, height: 1000 },
    title: "Example",
    category: "Веб-сервисы",
    dismissText: "Принять",
  });

  assert.equal(item.mode, "capture");
  assert.equal(item.dismissText, "Принять");
});

test("consent callback is self-contained for Puppeteer browser execution", () => {
  assert.doesNotMatch(dismissByExactText.toString(), /\b__name\b/);
});

test("unavailable page produces a branded cover without a fabricated interface", async t => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "portfolio-fallback-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));

  const result = await renderFallbackCover({
    slug: "notion-analog",
    title: "Корпоративная платформа",
    category: "CRM и внутренние системы",
  }, outputDir);
  const metadata = await sharp(result.path).metadata();

  assert.equal(metadata.format, "webp");
  assert.deepEqual([metadata.width, metadata.height], [1600, 1000]);
  assert.equal(result.mode, "fallback");
});
