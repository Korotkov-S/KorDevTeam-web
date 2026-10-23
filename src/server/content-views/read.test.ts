import assert from "node:assert/strict";
import test from "node:test";
import { createPublishedViewCountReader } from "./read";
import { createDb, getDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { contentEntries, contentRelations, contentViewTotals } from "../db/schema";
import { sql } from "drizzle-orm";
test("disabled SSR performs no DB access, enabled reader batches and deduplicates all IDs", async () => {
  let calls = 0;
  const readCounts = async (ids: readonly string[]) => { calls++; assert.deepEqual(ids, ["article", "case", "related"]); return { article: "0", case: "9007199254740993", related: "21" }; };
  assert.deepEqual(await createPublishedViewCountReader({ enabled: false, readCounts })(["article"]), {}); assert.equal(calls, 0);
  assert.deepEqual(await createPublishedViewCountReader({ enabled: true, readCounts })(["article", "case", "article", "related"]), { article: "0", case: "9007199254740993", related: "21" }); assert.equal(calls, 1);
});
test("failed reads preserve unavailable instead of inventing zeros and never leak errors", async () => {
  const logs: string[] = [];
  const read = createPublishedViewCountReader({ enabled: true, readCounts: async () => { throw Error("password pg://raw"); }, log: code => logs.push(code) });
  assert.deepEqual(await read(["article", "case"]), { article: null, case: null }); assert.deepEqual(logs, ["content_views_read_failed"]);
});
test("all seven public loaders batch current and related counts once without changing CMS data", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const oldUrl = process.env.DATABASE_URL, oldFlag = process.env.CONTENT_VIEWS_ENABLED;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!; process.env.CONTENT_VIEWS_ENABLED = "true";
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const db = createDb(process.env.TEST_DATABASE_URL!);
  const entries = await db.insert(contentEntries).values([
    { kind: "article", slug: "a", title: "A", bodyMd: "Preserve article", status: "published", payload: { category: "business-automation", relatedArticleSlugs: ["b"] } },
    { kind: "article", slug: "b", title: "B", bodyMd: "Preserve related", status: "published" },
    { kind: "case", slug: "c", title: "C", bodyMd: "Preserve case", status: "published" },
    { kind: "service", slug: "s", title: "S", bodyMd: "Preserve service", status: "published" },
  ]).returning();
  await db.insert(contentRelations).values([{ sourceId: entries[3].id, targetId: entries[0].id, type: "related_article" }, { sourceId: entries[3].id, targetId: entries[2].id, type: "related_case" }]);
  await db.insert(contentViewTotals).values({ entryId: entries[0].id, views: 21n });
  const before = JSON.stringify(await db.select().from(contentEntries));
  const target = getDb() as any; const original = target.select; let calls = 0;
  target.select = function(fields: any) { if (fields?.views === contentViewTotals.views) calls++; return original.call(this, fields); };
  try {
    for (const [module, path, params] of [["home", "/", {}], ["catalog", "/cases/", {}], ["blog-index", "/blog/", {}], ["blog-category", "/blog/category/business-automation/", { category: "business-automation" }], ["blog-post", "/blog/a/", { slug: "a" }], ["case", "/cases/c/", { slug: "c" }], ["content-page", "/services/s/", { slug: "s" }]] as const) {
      calls = 0; const route = await import(`../../routes/${module}`);
      const result = await route.loader({ request: new Request(`https://kordev.team${path}`), params });
      assert.equal(calls, 1, module); assert.match(JSON.stringify(result.data), /"viewCount":"(?:0|21)"/, module);
    }
    assert.equal(JSON.stringify(await db.select().from(contentEntries)), before);
    assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM content_view_receipts`)).rows[0].n, 0);
    await db.execute(sql`DROP TABLE content_view_totals`);
    const route = await import("../../routes/blog-post");
    const result = await route.loader({ request: new Request("https://kordev.team/blog/a/"), params: { slug: "a" }, context: {} });
    assert.equal(result.data.article.viewCount, null); assert.equal(result.data.article.bodyMd, "Preserve article"); assert.equal(result.data.identity.version, 1);
  } finally {
    target.select = original;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldFlag === undefined) delete process.env.CONTENT_VIEWS_ENABLED; else process.env.CONTENT_VIEWS_ENABLED = oldFlag;
  }
});
