import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { contentEntries, contentRelations, contentRevisions, seoQueries } from "../db/schema";
import { createContentViewsRepository } from "./repository";

const url = process.env.TEST_DATABASE_URL ?? "";
const dbTest = url ? test : test.skip;
const db = url ? createDb(url) : null!;
let time = new Date("2026-10-21T09:00:00Z");
const repo = () => createContentViewsRepository(db, { now: () => time });
let article: string, caseId: string, draft: string, service: string;
beforeEach(async () => {
  if (!url) return;
  time = new Date("2026-10-21T09:00:00Z");
  await resetTestDatabase(url);
  const rows = await db.insert(contentEntries).values([
    { kind: "article", slug: "article", title: "Article", bodyMd: "Preserved", status: "published", indexable: false },
    { kind: "case", slug: "case", title: "Case", status: "published" },
    { kind: "article", slug: "draft", title: "Draft" },
    { kind: "service", slug: "service", title: "Service", status: "published" },
  ]).returning();
  [article, caseId, draft, service] = rows.map(row => row.id);
});

dbTest("first receipt increments, duplicate does not, another material increments independently", async () => {
  const r = repo();
  await r.registerSession("a");
  assert.deepEqual(await r.recordView("a", article), { counted: true, views: "1", target: { entryId: article, kind: "article", slug: "article", path: "/blog/article/" } });
  assert.equal((await r.recordView("a", article)).counted, false);
  assert.equal((await r.recordView("a", caseId)).views, "1");
  assert.deepEqual(await r.readCounts([article, caseId, draft]), { [article]: "1", [caseId]: "1" });
});
dbTest("20 concurrent same-session writes increase once", async () => {
  const r = repo(); await r.registerSession("a");
  const receipts = await Promise.all(Array.from({ length: 20 }, () => r.recordView("a", article)));
  assert.equal(receipts.filter(row => row.counted).length, 1);
  assert.equal((await r.readCounts([article]))[article], "1");
});
dbTest("different sessions increase independently", async () => {
  const r = repo();
  await Promise.all(["a", "b"].map(token => r.registerSession(token)));
  await Promise.all(["a", "b"].map(token => r.recordView(token, article)));
  assert.equal((await r.readCounts([article]))[article], "2");
});
dbTest("30 minutes expires and touch or register cannot revive", async () => {
  const r = repo();
  assert.deepEqual(await r.registerSession("a"), { expiresAt: "2026-10-21T09:30:00.000Z" });
  time = new Date("2026-10-21T09:29:59.999Z");
  assert.equal((await r.touchSession("a")).expiresAt, "2026-10-21T09:59:59.999Z");
  time = new Date("2026-10-21T09:59:59.999Z");
  for (const operation of [() => r.touchSession("a"), () => r.registerSession("a"), () => r.recordView("a", article), () => r.touchSession("missing")]) {
    await assert.rejects(operation, /session_expired/);
  }
  assert.equal((await r.readCounts([article]))[article], "0");
});
dbTest("draft, unpublished and wrong kind cannot count", async () => {
  const r = repo(); await r.registerSession("a");
  for (const id of [draft, service, "00000000-0000-4000-8000-000000000001"]) await assert.rejects(() => r.recordView("a", id), /target_unavailable/);
  await db.update(contentEntries).set({ status: "draft" }).where(eq(contentEntries.id, article));
  await assert.rejects(() => r.recordView("a", article), /target_unavailable/);
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM content_view_receipts`)).rows[0].n, 0);
});
dbTest("slug and version changes keep totals and receipt identity", async () => {
  const r = repo(); await r.registerSession("a"); await r.recordView("a", article);
  await db.update(contentEntries).set({ slug: "new-article", version: 2 }).where(eq(contentEntries.id, article));
  const result = await r.recordView("a", article);
  assert.equal(result.counted, false); assert.equal(result.views, "1"); assert.equal(result.target.path, "/blog/new-article/");
});
dbTest("48h cleanup keeps aggregates, bounds deletion and runs once per minute", async () => {
  const r = repo(); await r.registerSession("a"); await r.recordView("a", article);
  time = new Date("2026-10-23T09:30:00Z");
  assert.equal((await r.cleanup()).sessions, 0);
  time = new Date("2026-10-23T09:31:00Z");
  await db.execute(sql`INSERT INTO content_view_sessions(session_hash,created_at,last_activity_at,expires_at)
    SELECT 'old-' || n, ${new Date("2026-10-20Z")}, ${new Date("2026-10-20Z")}, ${new Date("2026-10-20Z")} FROM generate_series(1,205) n`);
  assert.equal((await r.cleanup()).sessions, 200);
  assert.equal((await r.cleanup()).sessions, 0);
  time = new Date("2026-10-23T09:32:00Z");
  assert.equal((await r.cleanup()).sessions, 6);
  assert.equal((await r.readCounts([article]))[article], "1");
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM content_view_receipts`)).rows[0].n, 0);
});
dbTest("large bigint round-trips exactly and negative totals are rejected", async () => {
  const r = repo();
  await db.execute(sql`INSERT INTO content_view_totals(entry_id,views) VALUES (${article},9007199254740993)`);
  await r.registerSession("a");
  assert.equal((await r.recordView("a", article)).views, "9007199254740994");
  assert.equal((await r.readCounts([article]))[article], "9007199254740994");
  await assert.rejects(() => db.execute(sql`UPDATE content_view_totals SET views=-1`));
});
dbTest("all content, revisions, relations and semantic core rows remain unchanged", async () => {
  await db.insert(contentRevisions).values({ entryId: article, version: 1, snapshot: { bodyMd: "Preserved" } });
  await db.insert(contentRelations).values({ sourceId: article, targetId: caseId, type: "related_case" });
  const snapshot = async () => JSON.stringify(await Promise.all([db.select().from(contentEntries), db.select().from(contentRevisions), db.select().from(contentRelations), db.select().from(seoQueries)]));
  const before = await snapshot();
  const r = repo(); await r.registerSession("a"); await r.recordView("a", article); await r.touchSession("a"); await r.cleanup();
  assert.equal(await snapshot(), before);
});
dbTest("concurrent rate buckets enforce limits and expired buckets are cleaned in bounded batches", async () => {
  const r = repo();
  const input = { key: "ip-hash", bucketStart: time, windowSeconds: 60, limit: 3 };
  assert.equal((await Promise.all(Array.from({ length: 20 }, () => r.consumeRateLimit(input)))).filter(Boolean).length, 3);
  time = new Date(time.getTime() + 60_000);
  assert.equal(await r.consumeRateLimit({ ...input, bucketStart: time }), true);
  await db.execute(sql`INSERT INTO content_view_rate_limits(key,bucket_start,count,expires_at)
    SELECT 'old-' || n, ${new Date("2026-10-20Z")}, 1, ${new Date("2026-10-20Z")} FROM generate_series(1,505) n`);
  assert.equal((await r.cleanup()).rateBuckets, 500);
});
dbTest("empty database migrations and identical migration replay preserve totals", async () => {
  const r = repo(); await r.registerSession("a"); await r.recordView("a", article);
  await migrate(db, { migrationsFolder: "drizzle" });
  assert.equal((await r.readCounts([article]))[article], "1");
});
