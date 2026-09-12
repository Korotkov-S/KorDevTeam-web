import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("legacy static generation cannot recreate public sitemaps that shadow live routes", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "kordev-legacy-sitemap-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "dist"));
  await mkdir(path.join(directory, "public", "blog"), { recursive: true });
  await writeFile(path.join(directory, "dist", "index.html"), '<!doctype html><html lang="ru"><head><title>Site</title></head><body><div id="root"></div></body></html>');
  await writeFile(path.join(directory, "public", "blog", "test.md"), "# Test article\n\nArticle body.");
  const result = spawnSync(process.execPath, [path.resolve("scripts/generate-blog-pages.mjs")], { cwd: directory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const filename of ["sitemap.xml", "sitemap-blog.xml"]) {
    await assert.rejects(access(path.join(directory, "public", filename)), { code: "ENOENT" });
    await access(path.join(directory, "dist", filename));
  }
});
