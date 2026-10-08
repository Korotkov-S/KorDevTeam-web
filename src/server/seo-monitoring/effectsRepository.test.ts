import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { contentEntries, seoChanges, seoCollectionRuns, seoDailyMetrics, seoIndexObservations, seoQueries, seoRegions } from "../db/schema";
import { createSeoEffectsRepository } from "./effectsRepository";
import { parseIndexingAudit } from "./pageControl";

const url = process.env.TEST_DATABASE_URL ?? "";
(url ? test : test.skip)("effect evidence is append-only/idempotent, freezes cohorts and completes late baseline", async () => {
  await resetTestDatabase(url); const db = createDb(url);
  const [entry] = await db.insert(contentEntries).values({ kind: "article", slug: "test", title: "Test", status: "published", version: 2 }).returning();
  const [change] = await db.insert(seoChanges).values({ pagePath: "/blog/test/", type: "content", summary: "Improve guide", appliedAt: new Date("2026-10-06T12:00:00Z"), contentEntryId: entry.id, contentVersion: 2 }).returning();
  const [query] = await db.insert(seoQueries).values({ queryText: "test", normalizedQuery: "test", status: "active", tracked: true, targetPath: "/blog/test/" }).returning();
  const [region] = await db.select().from(seoRegions).where(sql`${seoRegions.source}='yandex_webmaster' AND ${seoRegions.code}='ru'`);
  const [run] = await db.insert(seoCollectionRuns).values({ source: "yandex_webmaster", status: "success", requestedFrom: "2026-10-01", requestedTo: "2026-10-17", startedAt: new Date("2026-10-20T06:00:00Z"), completedAt: new Date("2026-10-20T06:01:00Z") }).returning();
  await db.insert(seoIndexObservations).values({ contentEntryId: entry.id, kind: "article", pagePath: "/blog/test/", url: "https://kordev.team/blog/test/", publishedVersion: 2, source: "yandex", checkedAt: new Date("2026-10-20T07:00:00Z"), status: "indexed", evidence: { lastCrawlAt: "2026-10-10T07:00:00Z" } });
  await db.insert(seoDailyMetrics).values([
    { observationDate: "2026-10-01", averagePosition: "20", clicks: 2 },
    { observationDate: "2026-10-08", averagePosition: "18", clicks: 3 },
  ].map(row => ({ ...row, source: "yandex_webmaster" as const, queryId: query.id, regionId: region.id, pagePath: "/blog/test/", device: "desktop" as const, impressions: 100, ctr: "0.02" })));
  const repo = createSeoEffectsRepository(db); const now = new Date("2026-10-20T09:00:00Z");
  assert.deepEqual(await repo.evaluateAll(now), { inserted: 6, unchanged: 0 });
  assert.deepEqual(await repo.evaluateAll(new Date("2026-10-20T09:01:00Z")), { inserted: 0, unchanged: 6 });
  const initial = await repo.list({ limit: 100, cursor: null });
  assert.equal(initial.items.length, 6);
  assert.equal(initial.items.find(r => r.source === "yandex_webmaster" && r.checkpoint === 7)!.result.status, "pending_coverage");
  await db.update(seoCollectionRuns).set({ requestedFrom: "2026-09-29" }).where(eq(seoCollectionRuns.id, run.id));
  await repo.evaluateAll(now);
  const measured = (await repo.list({ limit: 100, cursor: null })).items.find(r => r.source === "yandex_webmaster" && r.checkpoint === 7)!;
  assert.equal(measured.result.status, "improved");
  assert.equal(measured.result.baseline.retrospective, true);
  await db.update(seoDailyMetrics).set({ averagePosition: "50" }).where(eq(seoDailyMetrics.observationDate, "2026-10-01"));
  await db.insert(seoQueries).values({ queryText: "new", normalizedQuery: "new", status: "active", tracked: true, targetPath: "/blog/test/" });
  await repo.evaluateAll(now);
  const frozen = (await repo.list({ limit: 100, cursor: null })).items.find(r => r.source === "yandex_webmaster" && r.checkpoint === 7)!;
  assert.equal(frozen.result.baseline.averagePosition, 20);
  assert.deepEqual(frozen.result.cohort, [query.id]);
  const history = await repo.list({ changeId: change.id, history: true, limit: 100, cursor: null });
  assert.ok(history.items.length > initial.items.length);
  assert.ok(history.items.some(r => r.result.status === "pending_coverage"));
  const first = await repo.list({ pagePath: "/blog/test/", limit: 1, cursor: null });
  const next = await repo.list({ pagePath: "/blog/test/", limit: 1, cursor: first.nextCursor });
  assert.notEqual(first.items[0].id, next.items[0].id);
  await assert.rejects(repo.list({ limit: 101, cursor: null }), /seo_limit_invalid/);
  await assert.rejects(repo.list({ limit: 10, cursor: "bad" }), /seo_cursor_invalid/);
  await assert.rejects(repo.list({ history: true, limit: 10, cursor: null }), /seo_effect_history_change_required/);
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('seo-collector:yandex_webmaster'))`);
    await assert.rejects(repo.evaluateAll(now), /seo_source_locked/);
  });
  assert.equal((await repo.list({ pagePath: "/blog/absent/", limit: 100, cursor: null })).items.length, 0);
});

async function readyFixture() {
  await resetTestDatabase(url); const db = createDb(url);
  const [entry] = await db.insert(contentEntries).values({ kind: "article", slug: "test", title: "Test", status: "published", version: 2 }).returning();
  const [change] = await db.insert(seoChanges).values({ pagePath: "/blog/test/", type: "content", summary: "Improve guide", appliedAt: new Date("2026-10-06T12:00:00Z"), contentEntryId: entry.id, contentVersion: 2 }).returning();
  const [query] = await db.insert(seoQueries).values({ queryText: "test", normalizedQuery: "test", status: "active", tracked: true, targetPath: "/blog/test/" }).returning();
  const [region] = await db.select().from(seoRegions).where(sql`${seoRegions.source}='yandex_webmaster' AND ${seoRegions.code}='ru'`);
  await db.insert(seoCollectionRuns).values({ source: "yandex_webmaster", status: "success", requestedFrom: "2026-09-29", requestedTo: "2026-10-17", startedAt: new Date("2026-10-20T06:00:00Z"), completedAt: new Date("2026-10-20T06:01:00Z") });
  await db.insert(seoDailyMetrics).values(["2026-10-01", "2026-10-08"].map((date, i) => ({ observationDate: date, source: "yandex_webmaster" as const, queryId: query.id, regionId: region.id, pagePath: "/blog/test/", device: "desktop" as const, impressions: 100, clicks: 2, ctr: "0.02", averagePosition: i ? "18" : "20" })));
  const observation = parseIndexingAudit({ schemaVersion: 2, pages: [{ contentEntryId: entry.id, kind: "article", path: "/blog/test/", url: "https://kordev.team/blog/test/", publishedVersion: 2, checkedAt: "2026-10-20T07:00:00Z", httpStatus: 200, canonical: "https://kordev.team/blog/test/", noindex: false, robotsAllowed: true, yandex: { status: "confirmed_indexed", checkedAt: "2026-10-20T07:00:00Z", lastCrawlAt: "2026-10-10T07:00:00Z" } }] })[0];
  await db.insert(seoIndexObservations).values({ ...observation, checkedAt: new Date(observation.checkedAt) });
  const repo = createSeoEffectsRepository(db);
  const evaluate = async () => { await repo.evaluateAll(new Date("2026-10-20T09:00:00Z")); return (await repo.list({ changeId: change.id, limit: 100, cursor: null })).items.find(r => r.source === "yandex_webmaster" && r.checkpoint === 7)!.result; };
  return { db, entry, change, observation, evaluate };
}

(url ? test : test.skip)("change entry identity is not replaced by another publication at the same path", async () => {
  const f = await readyFixture();
  const [other] = await f.db.insert(contentEntries).values({ kind: "article", slug: "other", title: "Other", status: "published", version: 2 }).returning();
  await f.db.update(seoChanges).set({ contentEntryId: other.id }).where(eq(seoChanges.id, f.change.id));
  assert.equal((await f.evaluate()).status, "incompatible");
});

(url ? test : test.skip)("explicit live technical failures survive the audit adapter and block a directional verdict", async () => {
  const f = await readyFixture();
  assert.equal((await f.evaluate()).status, "improved");
  for (const adverse of [{ httpStatus: 404 }, { noindex: true }, { robotsAllowed: false }, { canonical: "https://kordev.team/blog/other/" }, { technicalErrorCode: "http_unavailable" }]) {
    await f.db.update(seoIndexObservations).set({ evidence: { ...f.observation.evidence, ...adverse } });
    assert.equal((await f.evaluate()).status, "pending_refresh", JSON.stringify(adverse));
  }
});

(url ? test : test.skip)("operational journal events do not confound unchanged published content", async () => {
  const f = await readyFixture();
  await f.db.insert(seoChanges).values({ pagePath: "/blog/test/", type: "other", summary: "Audit completed", appliedAt: new Date("2026-10-08T12:00:00Z") });
  assert.equal((await f.evaluate()).status, "improved");
});
