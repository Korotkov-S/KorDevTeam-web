import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm, writeFile, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { contentEntries, contentMediaRefs, mediaAssets, seoChanges } from "../../src/server/db/schema";
import { assertCrawlerFixtureTarget, seedCrawlerCmsSnapshots, prepareCrawlerPublicAssets } from "../../scripts/seed-crawler-cms-snapshots";
import { loadContentReleaseBundle } from "../../src/server/content-release/manifest";
import { applyRelease, planRelease } from "../../src/server/content-release/orchestrator";

const ack = { ci: "true", acknowledgement: "local-ci-only" };
test("crawler fixture cannot run against production, remote, overridden or unacknowledged databases", () => {
  for (const url of ["postgresql://kordev:pass@127.0.0.1/kordevteam", "postgresql://kordev:pass@example.com/kordev_ci",
    "postgresql://kordev:pass@127.0.0.1/kordev_ci?host=example.com", "invalid"]) {
    assert.throws(() => assertCrawlerFixtureTarget(url, ack), /crawler_fixture_target_invalid/);
  }
  assert.throws(() => assertCrawlerFixtureTarget("postgresql://kordev:pass@127.0.0.1/kordev_ci", { ...ack, ci: "false" }), /crawler_fixture_target_invalid/);
  assert.throws(() => assertCrawlerFixtureTarget("postgresql://kordev:pass@127.0.0.1/kordev_ci", { ...ack, acknowledgement: "" }), /crawler_fixture_target_invalid/);
});

test("crawler public asset fixture verifies its bytes, preserves conflicting files and rejects symlink escapes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-crawler-assets-"));
  const outside = await mkdtemp(path.join(tmpdir(), "kordev-crawler-outside-"));
  const targetUrl = "postgresql://kordev:fixture@127.0.0.1/kordev_test";
  try {
    await prepareCrawlerPublicAssets(targetUrl, ack, root);
    const target = path.join(root, "blog/uploads/production-robotization-payback-dc41d5ed.mp4");
    const hash = createHash("sha256").update(await readFile(target)).digest("hex");
    assert.equal(hash, "dc41d5ed318f65ccccad7b2765ed61cebd016774052d4284510a006355934f0a");
    await prepareCrawlerPublicAssets(targetUrl, ack, root);
    await writeFile(target, "existing conflicting file");
    await assert.rejects(prepareCrawlerPublicAssets(targetUrl, ack, root), /crawler_fixture_asset_conflict/);
    assert.equal(await readFile(target, "utf8"), "existing conflicting file");
    await rm(path.join(root, "blog"), { recursive: true });
    await symlink(outside, path.join(root, "blog"));
    await assert.rejects(prepareCrawlerPublicAssets(targetUrl, ack, root), /crawler_fixture_asset_invalid/);
    await assert.rejects(stat(path.join(outside, "uploads")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

const url = process.env.TEST_DATABASE_URL ?? "";
const dbTest = url ? test : test.skip;
dbTest("public CMS crawler snapshots preserve published content, media and provenance without publication events", async () => {
  await resetTestDatabase(url);
  const fixture = JSON.parse(await readFile("tests/fixtures/crawler-cms-published.json", "utf8"));
  const db = createDb(url);
  try {
    const bundle = await loadContentReleaseBundle();
    const plan = await planRelease(db, bundle.manifest);
    await applyRelease(db, bundle, { releaseSha: "1".repeat(40), manifestChecksum: bundle.manifest.checksum, planChecksum: plan.planChecksum });
    const baselineRows = (await db.select().from(contentEntries)).length;
    const baselineChanges = (await db.select().from(seoChanges)).length;
    const invalidTarget = structuredClone(fixture);
    invalidTarget.entries.find((x: any) => x.relations.length).relations[0].targetKey = "article:nonexistent-crawler-target";
    await assert.rejects(seedCrawlerCmsSnapshots(url, invalidTarget, ack), /crawler_fixture_target_missing/);
    assert.equal((await db.select().from(contentEntries)).length, baselineRows, "failed restore must roll back every inserted snapshot");
    assert.equal((await db.select().from(mediaAssets)).length, 0);
    const result = await seedCrawlerCmsSnapshots(url, fixture, ack);
    assert.equal(result.entries, 18);
    assert.equal(result.mediaAssets, 4);
    const rows = await db.select().from(contentEntries);
    assert.equal(rows.length, baselineRows + 18);
    for (const source of fixture.entries) {
      const actual = rows.find(x => x.id === source.entry.id)!;
      for (const key of ["kind", "slug", "status", "title", "bodyMd", "payload", "version", "ogMediaId", "indexable"])
        assert.deepEqual((actual as any)[key], source.entry[key], `${source.entry.slug}:${key}`);
      assert.equal(actual.publishedAt!.toISOString(), new Date(source.entry.publishedAt).toISOString());
      assert.equal(actual.updatedAt.toISOString(), new Date(source.entry.updatedAt).toISOString());
    }
    assert.equal((await db.select().from(mediaAssets)).length, 4);
    assert.equal((await db.select().from(contentMediaRefs)).length, fixture.entries.reduce((n: number, x: any) => n + x.mediaRefs.length, 0));
    assert.equal((await db.select().from(seoChanges)).length, baselineChanges, "fixture loading is not a publication or SEO change");
    await assert.rejects(seedCrawlerCmsSnapshots(url, fixture, ack), /crawler_fixture_conflict/);
    assert.equal((await db.select().from(contentEntries)).length, baselineRows + 18);
    const bad = structuredClone(fixture); bad.mediaAssets[0].visibility = "private";
    await assert.rejects(seedCrawlerCmsSnapshots(url, bad, ack), /crawler_fixture_invalid/);
  } finally { await db.$client.end(); }
});
