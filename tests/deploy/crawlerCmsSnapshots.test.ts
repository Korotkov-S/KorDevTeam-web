import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm, writeFile, symlink, stat, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { contentEntries, contentMediaRefs, mediaAssets, seoChanges } from "../../src/server/db/schema";
import { assertCrawlerFixtureTarget, seedCrawlerCmsSnapshots, prepareCrawlerPublicAssets } from "../../scripts/seed-crawler-cms-snapshots";
import { loadContentReleaseBundle } from "../../src/server/content-release/manifest";
import { applyRelease, planRelease } from "../../src/server/content-release/orchestrator";

const ack = { ci: "true", acknowledgement: "local-ci-only" };
const runFile = promisify(execFile);
const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
test("fixture-using test entry points reject URL overrides before attempting any database connection", async () => {
  for (const [filename, pattern] of [["tests/deploy/crawlerCmsSnapshots.test.ts", "^public CMS crawler snapshots"], ["tests/seo/crawler.test.ts", "^live sitemaps are disjoint"]]) {
    let connections = 0;
    const listener = createServer(socket => { connections++; socket.destroy(); });
    await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
    try {
      const address = listener.address() as { port: number };
      const unsafeUrl = `postgresql://fixture:fixture@127.0.0.1:${address.port}/kordev_test?application_name=must-refuse-before-reset`;
      const result = await runFile(process.execPath, [tsxCli, "--test", "--test-name-pattern", pattern, filename], {
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, TEST_DATABASE_URL: unsafeUrl }, timeout: 20000,
      }).then(result => result, e => ({ stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));
      assert.equal(connections, 0, filename);
      assert.match(result.stdout + result.stderr, /crawler_fixture_target_invalid/);
    } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
  }
});
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
    const publicRoot = path.join(root, "build/client");
    await prepareCrawlerPublicAssets(targetUrl, ack, publicRoot, root);
    const target = path.join(publicRoot, "blog/uploads/production-robotization-payback-dc41d5ed.mp4");
    const hash = createHash("sha256").update(await readFile(target)).digest("hex");
    assert.equal(hash, "dc41d5ed318f65ccccad7b2765ed61cebd016774052d4284510a006355934f0a");
    await prepareCrawlerPublicAssets(targetUrl, ack, publicRoot, root);
    await writeFile(target, "existing conflicting file");
    await assert.rejects(prepareCrawlerPublicAssets(targetUrl, ack, publicRoot, root), /crawler_fixture_asset_conflict/);
    assert.equal(await readFile(target, "utf8"), "existing conflicting file");
    await rm(path.join(publicRoot, "blog"), { recursive: true });
    await symlink(outside, path.join(publicRoot, "blog"));
    await assert.rejects(prepareCrawlerPublicAssets(targetUrl, ack, publicRoot, root), /crawler_fixture_asset_invalid/);
    await assert.rejects(stat(path.join(outside, "uploads")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("crawler assets reject linked build and client roots before writing outside the workspace", async () => {
  for (const linked of ["build", "client"]) {
    const workspace = await mkdtemp(path.join(tmpdir(), "kordev-crawler-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "kordev-crawler-root-outside-"));
    try {
      if (linked === "client") await mkdir(path.join(workspace, "build"));
      await symlink(outside, path.join(workspace, linked === "build" ? "build" : "build/client"));
      await assert.rejects(prepareCrawlerPublicAssets("postgresql://fixture:fixture@127.0.0.1/kordev_test", ack,
        path.join(workspace, "build/client"), workspace), /crawler_fixture_asset_invalid/);
      await assert.rejects(stat(path.join(outside, "blog")), { code: "ENOENT" });
    } finally { await rm(workspace, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  }
});

const url = process.env.TEST_DATABASE_URL ?? "";
const dbTest = url ? test : test.skip;
dbTest("public CMS crawler snapshots preserve published content, media and provenance without publication events", async () => {
  assertCrawlerFixtureTarget(url, ack);
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
    for (const source of fixture.mediaAssets) {
      const result = await db.execute(sql`SELECT created_at = ${source.createdAt}::timestamptz AS "createdExact",
        updated_at = ${source.updatedAt}::timestamptz AS "updatedExact" FROM media_assets WHERE id = ${source.id}`);
      assert.equal(result.rows[0].createdExact, true, `${source.id}:createdAt microseconds`);
      assert.equal(result.rows[0].updatedExact, true, `${source.id}:updatedAt microseconds`);
    }
    assert.equal((await db.select().from(contentMediaRefs)).length, fixture.entries.reduce((n: number, x: any) => n + x.mediaRefs.length, 0));
    assert.equal((await db.select().from(seoChanges)).length, baselineChanges, "fixture loading is not a publication or SEO change");
    await assert.rejects(seedCrawlerCmsSnapshots(url, fixture, ack), /crawler_fixture_conflict/);
    assert.equal((await db.select().from(contentEntries)).length, baselineRows + 18);
    const bad = structuredClone(fixture); bad.mediaAssets[0].visibility = "private";
    await assert.rejects(seedCrawlerCmsSnapshots(url, bad, ack), /crawler_fixture_invalid/);
  } finally { await db.$client.end(); }
});

dbTest("crawler fixture permits the same slug for an unrelated content kind", async () => {
  assertCrawlerFixtureTarget(url, ack);
  await resetTestDatabase(url);
  const fixture = JSON.parse(await readFile("tests/fixtures/crawler-cms-published.json", "utf8"));
  fixture.entries = [fixture.entries.find((x: any) => !x.entry.ogMediaId && x.mediaRefs.length === 0)];
  fixture.entries[0].relations = []; fixture.mediaAssets = [];
  const db = createDb(url);
  try {
    await db.insert(contentEntries).values({ kind: "page", slug: fixture.entries[0].entry.slug, title: "Unrelated draft" });
    assert.equal((await seedCrawlerCmsSnapshots(url, fixture, ack)).entries, 1);
    assert.equal((await db.select().from(contentEntries)).length, 2);
  } finally { await db.$client.end(); }
});

dbTest("a CLI asset conflict leaves the snapshot database unmodified and retryable", async () => {
  assertCrawlerFixtureTarget(url, ack);
  await resetTestDatabase(url);
  const db = createDb(url);
  const workspace = await mkdtemp(path.join(tmpdir(), "kordev-crawler-cli-"));
  try {
    const bundle = await loadContentReleaseBundle();
    const plan = await planRelease(db, bundle.manifest);
    await applyRelease(db, bundle, { releaseSha: "1".repeat(40), manifestChecksum: bundle.manifest.checksum, planChecksum: plan.planChecksum });
    const before = (await db.select().from(contentEntries)).length;
    await mkdir(path.join(workspace, "tests/fixtures/crawler-assets"), { recursive: true });
    await copyFile("tests/fixtures/crawler-cms-published.json", path.join(workspace, "tests/fixtures/crawler-cms-published.json"));
    const filename = "production-robotization-payback-dc41d5ed.mp4";
    await copyFile("tests/fixtures/crawler-assets/" + filename, path.join(workspace, "tests/fixtures/crawler-assets/" + filename));
    await mkdir(path.join(workspace, "build/client/blog/uploads"), { recursive: true });
    await writeFile(path.join(workspace, "build/client/blog/uploads", filename), "conflicting generated cache");
    const result = await runFile(process.execPath, [tsxCli, path.resolve("scripts/seed-crawler-cms-snapshots.ts")], {
      cwd: workspace, env: { ...process.env, DATABASE_URL: url, CI: "true", CMS_CRAWLER_FIXTURE_ACK: "local-ci-only" }, timeout: 30000,
    }).then(() => ({ stderr: "" }), e => ({ stderr: e.stderr ?? "" }));
    assert.match(result.stderr, /crawler_fixture_asset_conflict/);
    assert.equal((await db.select().from(contentEntries)).length, before);
    assert.equal((await db.select().from(mediaAssets)).length, 0);
    await rm(path.join(workspace, "build/client/blog/uploads", filename));
    const retried = await runFile(process.execPath, [tsxCli, path.resolve("scripts/seed-crawler-cms-snapshots.ts")], {
      cwd: workspace, env: { ...process.env, DATABASE_URL: url, CI: "true", CMS_CRAWLER_FIXTURE_ACK: "local-ci-only" }, timeout: 30000,
    });
    assert.equal(JSON.parse(retried.stdout).entries, 18);
    assert.equal((await db.select().from(contentEntries)).length, before + 18);
  } finally { await db.$client.end(); await rm(workspace, { recursive: true, force: true }); }
});
