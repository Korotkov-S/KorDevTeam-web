import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { contentEntries, contentRevisions, seoQueries } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { auditPage } from "./pageControl.test";
import { createPageControlRepository } from "./pageControlRepository";

const url = process.env.TEST_DATABASE_URL ?? "";
const dbTest = url ? test : test.skip;
dbTest("published registry includes untracked pages and preserves success across failed and out-of-order attempts", async () => {
  await resetTestDatabase(url);
  const db = createDb(url);
  const [entry, empty] = await db.insert(contentEntries).values([
    { id: auditPage().contentEntryId, kind: "article", slug: "test", title: "Tracked", status: "published", version: 2 },
    { kind: "article", slug: "empty", title: "Untracked", status: "published" },
    { kind: "article", slug: "draft", title: "Draft", status: "draft" },
    { kind: "service", slug: "hidden", title: "Hidden", status: "published", indexable: false },
  ]).returning();
  await db.insert(seoQueries).values({ queryText: "test", normalizedQuery: "test", status: "active", tracked: true, targetPath: "/blog/test/" });
  const repo = createPageControlRepository(db);
  const report = { schemaVersion: 2, pages: [auditPage()] };
  assert.deepEqual(await repo.importAudit(report), { inserted: 2, unchanged: 0 });
  assert.deepEqual(await repo.importAudit(report), { inserted: 0, unchanged: 2 });
  await assert.rejects(repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), httpStatus: 404 }] }), /seo_index_observation_conflict/);
  await repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), google: { status: "failed", checkedAt: "2026-10-08T07:00:00Z", errorCode: "google_http_429" } }] });
  await repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), google: { ...auditPage().google, status: "not_indexed", checkedAt: "2026-10-07T07:00:00Z" } }] });
  let pages = await repo.listPages({ limit: 100, cursor: null }, new Date("2026-10-08T08:00:00Z"));
  assert.equal(pages.total, 3);
  assert.equal(pages.items.some(p => p.title === "Draft"), false);
  assert.equal(pages.items.find(p => p.id === empty.id)!.keywords.length, 0);
  assert.equal(pages.items.find(p => p.id === empty.id)!.google.lastSuccess, null);
  assert.equal(pages.items.find(p => p.title === "Hidden")!.indexable, false);
  const tracked = pages.items.find(p => p.id === entry.id)!;
  assert.equal(tracked.keywords.length, 1);
  assert.equal(tracked.google.lastAttempt!.status, "failed");
  assert.equal(tracked.google.lastSuccess!.status, "indexed");
  assert.equal(tracked.google.stale, false);
  assert.equal(pages.summary.google.confirmedIndexed, 1, "failed attempt must not erase fresh indexed evidence");
  assert.equal(pages.summary.google.completed, 0);
  const [draft] = await db.select().from(contentEntries).where(eq(contentEntries.slug, "draft"));
  await assert.rejects(repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), contentEntryId: draft.id, path: "/blog/draft/", url: "https://kordev.team/blog/draft/", publishedVersion: draft.version }] }), /seo_index_publication_mismatch/);
  await assert.rejects(repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), publishedVersion: 1 }] }), /seo_index_publication_mismatch/);
  await db.insert(contentRevisions).values({ entryId: entry.id, version: entry.version, snapshot: { entry } });
  await db.update(contentEntries).set({ version: 3 }).where(eq(contentEntries.id, entry.id));
  assert.deepEqual(await repo.importAudit(report), { inserted: 0, unchanged: 2 });
  pages = await repo.listPages({ limit: 100, cursor: null }, new Date("2026-10-08T08:00:00Z"));
  assert.equal(pages.items.find(p => p.id === entry.id)!.google.stale, true);
  const page1 = await repo.listPages({ limit: 1, cursor: null });
  const page2 = await repo.listPages({ limit: 1, cursor: page1.nextCursor });
  assert.notEqual(page1.items[0].id, page2.items[0].id);
  await assert.rejects(repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), publishedVersion: 999 }] }), /seo_index_publication_mismatch/);
});

dbTest("import rejects drafts and historical versions without a published snapshot", async () => {
  await resetTestDatabase(url);
  const db = createDb(url);
  const [entry] = await db.insert(contentEntries).values({ id: auditPage().contentEntryId, kind: "article", slug: "test", title: "Draft", status: "draft", version: 2 }).returning();
  const repo = createPageControlRepository(db);
  await assert.rejects(repo.importAudit({ schemaVersion: 2, pages: [auditPage()] }), /seo_index_publication_mismatch/);
  await db.update(contentEntries).set({ status: "published" }).where(eq(contentEntries.id, entry.id));
  await assert.rejects(repo.importAudit({ schemaVersion: 2, pages: [{ ...auditPage(), publishedVersion: 1 }] }), /seo_index_publication_mismatch/);
  const historical = { schemaVersion: 2, pages: [{ ...auditPage(), publishedVersion: 1 }] };
  await db.insert(contentRevisions).values({ entryId: entry.id, version: 1, snapshot: { entry: { ...entry, version: 1 } } });
  await assert.rejects(repo.importAudit(historical), /seo_index_publication_mismatch/);
  await db.update(contentRevisions).set({ snapshot: { entry: { ...entry, version: 1, status: "published", slug: "other" } } }).where(eq(contentRevisions.entryId, entry.id));
  await assert.rejects(repo.importAudit(historical), /seo_index_publication_mismatch/);
  await db.update(contentRevisions).set({ snapshot: { entry: { ...entry, version: 1, status: "published" } } }).where(eq(contentRevisions.entryId, entry.id));
  assert.deepEqual(await repo.importAudit(historical), { inserted: 2, unchanged: 0 });
});
