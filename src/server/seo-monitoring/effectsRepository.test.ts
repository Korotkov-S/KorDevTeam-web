import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { contentEntries, seoChanges, seoChangeEvaluations, seoCollectionRuns, seoDailyMetrics, seoIndexObservations, seoQueries, seoRegions } from "../db/schema";
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

function measuredDatabase(maxChangeBatches = Infinity) {
  const reads: Array<{ table: string; rows: number }> = [];
  let changeBatches = 0;
  const pool = new Pool({ connectionString: url, allowExitOnIdle: true });
  pool.on("connect", client => {
    const original = client.query;
    client.query = ((...args: unknown[]) => {
      const pending = Reflect.apply(original, client, args);
      const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? "";
      if (!pending || typeof pending.then !== "function") return pending;
      return pending.then((result: { rows: unknown[] }) => {
        const table = /from "(seo_daily_metrics|seo_change_evaluations|seo_collection_runs|seo_changes)"/.exec(text)?.[1];
        if (table) reads.push({ table, rows: result.rows.length });
        if (table === "seo_changes" && text.includes(" limit ") && ++changeBatches > maxChangeBatches) throw Error("repeated_change_batch");
        return result;
      });
    }) as typeof client.query;
  });
  return { db: drizzle(pool, { schema }), reads, close: () => pool.end() };
}

(url ? test : test.skip)("evaluation reads only relevant evidence instead of loading unrelated metric and evaluation history", async () => {
  const f = await readyFixture();
  const initial = await f.evaluate();
  const [query] = await f.db.select().from(seoQueries);
  const [region] = await f.db.select().from(seoRegions).where(sql`${seoRegions.source}='yandex_webmaster' AND ${seoRegions.code}='ru'`);
  await f.db.insert(seoDailyMetrics).values(Array.from({ length: 110 }, (_, i) => ({
    observationDate: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), source: "yandex_webmaster" as const,
    queryId: query.id, regionId: region.id, pagePath: "/blog/unrelated/", device: "desktop" as const,
    impressions: 100, clicks: 0, ctr: "0", averagePosition: "1",
  })));
  await f.db.insert(seoCollectionRuns).values(Array.from({ length: 110 }, (_, i) => ({
    source: "yandex_webmaster" as const, status: "success" as const, requestedFrom: "2020-01-01", requestedTo: "2020-01-31",
    startedAt: new Date(Date.UTC(2020, 0, i + 1)), completedAt: new Date(Date.UTC(2020, 0, i + 1, 0, 1)),
  })));
  await f.db.insert(seoChangeEvaluations).values(Array.from({ length: 110 }, (_, i) => ({
    changeId: f.change.id, source: "yandex_webmaster", checkpoint: 7, evaluatedAt: new Date("2026-10-20T09:00:00Z"),
    evidenceHash: i.toString(16).padStart(64, "0"), result: initial,
  })));
  const measured = measuredDatabase();
  try {
    assert.deepEqual(await createSeoEffectsRepository(measured.db).evaluateAll(new Date("2026-10-20T09:00:00Z")), { inserted: 0, unchanged: 6 });
    for (const [table, maximum] of [["seo_daily_metrics", 2], ["seo_change_evaluations", 1], ["seo_collection_runs", 1]] as const) {
      const reads = measured.reads.filter(r => r.table === table);
      assert.ok(reads.length, `expected a measured ${table} read`);
      assert.ok(reads.every(r => r.rows <= maximum), `${table} returned unrelated history: ${Math.max(...reads.map(r => r.rows))} rows`);
    }
  } finally { await measured.close(); }
});

(url ? test : test.skip)("a latest failed attempt outside the measured period still blocks a directional verdict", async () => {
  const f = await readyFixture();
  assert.equal((await f.evaluate()).status, "improved");
  await f.db.insert(seoCollectionRuns).values({ source: "yandex_webmaster", status: "failed", requestedFrom: "2026-12-01", requestedTo: "2026-12-01",
    startedAt: new Date("2026-10-20T08:00:00Z"), completedAt: new Date("2026-10-20T08:01:00Z"), errorCode: "provider_unavailable" });
  assert.equal((await f.evaluate()).status, "pending_source");
});

(url ? test : test.skip)("native PostgreSQL microseconds neither repeat keyset pages nor add same-millisecond changes to evidence", async () => {
  await resetTestDatabase(url);
  const db = createDb(url);
  await db.insert(seoChanges).values(Array.from({ length: 26 }, () => ({ pagePath: "/blog/microseconds/", type: "content" as const, summary: "Timestamp test" })));
  await db.execute(sql`update seo_changes set applied_at = '2026-10-06T12:00:00.123456Z'::timestamptz`);
  const measured = measuredDatabase(10);
  try {
    const repo = createSeoEffectsRepository(measured.db);
    assert.deepEqual(await repo.evaluateAll(new Date("2026-10-20T09:00:00Z")), { inserted: 156, unchanged: 0 });
    const first = (await repo.list({ limit: 100, cursor: null })).items;
    assert.ok(first.every(r => r.result.subsequentChanges.length === 0), "same-millisecond changes were not later in the original evaluator");
  } finally { await measured.close(); }
});

(url ? test : test.skip)("native run timestamps retain the original millisecond eligibility and latest-run tie breaker", async () => {
  const f = await readyFixture();
  assert.equal((await f.evaluate()).status, "improved");
  await f.db.execute(sql`insert into seo_collection_runs (id,source,status,requested_from,requested_to,started_at,completed_at) values
    ('00000000-0000-4000-8000-000000000001','yandex_webmaster','success','2026-12-01','2026-12-01','2026-10-20T08:00:00.123999Z','2026-10-20T09:00:00.000456Z'),
    ('00000000-0000-4000-8000-000000000002','yandex_webmaster','failed','2026-12-01','2026-12-01','2026-10-20T08:00:00.123001Z','2026-10-20T09:00:00.000456Z')`);
  assert.equal((await f.evaluate()).status, "pending_source");
});

(url ? test : test.skip)("every change across same-time keyset batches is evaluated once and remains idempotent", async () => {
  await resetTestDatabase(url);
  const db = createDb(url);
  await db.insert(seoChanges).values(Array.from({ length: 56 }, (_, i) => ({ pagePath: `/blog/test-${i}/`, type: "other" as const,
    summary: "Operational test", appliedAt: new Date("2026-10-06T12:00:00Z") })));
  const measured = measuredDatabase();
  try {
    const repo = createSeoEffectsRepository(measured.db), now = new Date("2026-10-20T09:00:00Z");
    assert.deepEqual(await repo.evaluateAll(now), { inserted: 336, unchanged: 0 });
    assert.deepEqual(await repo.evaluateAll(now), { inserted: 0, unchanged: 336 });
    assert.ok(measured.reads.filter(r => r.table === "seo_changes").every(r => r.rows <= 25), "changes must be read in bounded batches");
  } finally { await measured.close(); }
});
