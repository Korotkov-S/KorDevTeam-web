import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import { buildPagesSitemap, buildBlogSitemap } from "../../src/server/seo/sitemaps";
import type { ContentEntry } from "../../src/server/content/service";

export const expectedStaticDates = {
  "/": "2026-09-12T04:08:04.000Z",
  "/blog/": "2026-09-12T04:08:04.000Z",
  "/services/": "2026-09-12T04:31:38.000Z",
  "/cases/": "2026-09-12T04:31:38.000Z",
  "/journal/": "2026-09-11T19:08:36.000Z",
  "/journal/issue-0/": "2026-09-11T19:08:36.000Z",
  "/video/": "2026-09-11T19:08:36.000Z",
  "/under-metup/video-1/": "2026-09-11T19:08:36.000Z",
  "/under-metup/video-2/": "2026-09-11T19:08:36.000Z",
  "/under-metup/video-3/": "2026-09-11T19:08:36.000Z",
  "/requisites/": "2026-09-12T04:31:38.000Z",
  "/privacy/": "2026-09-12T04:31:38.000Z",
};

test("static sitemap inventory covers every authored indexable route with its actual content commit date", () => {
  const $ = load(buildPagesSitemap([]), { xml: true });
  const actual = Object.fromEntries($("url").toArray().map(node => [new URL($(node).find("loc").text()).pathname, $(node).find("lastmod").text()]));
  assert.deepEqual(actual, expectedStaticDates);
  assert.equal($("url").length, 12);
});

test("each child sitemap accepts 50000 unique URLs and refuses overflow rather than emitting invalid XML", () => {
  const date = new Date("2026-01-02T03:04:05.000Z");
  const entry: ContentEntry = { id: "00000000-0000-4000-8000-000000000001", kind: "article", slug: "article", status: "published", title: "Статья", excerpt: "Описание", bodyMd: "Текст", seoTitle: "Статья", seoDescription: "Описание", manualCanonicalPath: null, indexable: true, ogMediaId: null, payload: {}, version: 2, publishedAt: date, createdAt: date, updatedAt: date };
  const articles = Array.from({ length: 50_000 }, (_, index) => ({ ...entry, slug: `article-${index}` }));
  assert.equal(load(buildBlogSitemap(articles), { xml: true })("url").length, 50_000);
  assert.throws(() => buildBlogSitemap([...articles, { ...entry, slug: "overflow" }]), /sitemap_url_limit_exceeded/);
  const pages = articles.slice(0, 50_000 - 12).map(record => ({ ...record, kind: "page" as const }));
  assert.equal(load(buildPagesSitemap(pages), { xml: true })("url").length, 50_000);
  assert.throws(() => buildPagesSitemap([...pages, { ...entry, kind: "page", slug: "overflow" }]), /sitemap_url_limit_exceeded/);
});

test("blog sitemap emits each non-empty category once with its newest article date", () => {
  const base: ContentEntry = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "article",
    slug: "older-crm",
    status: "published",
    title: "CRM",
    excerpt: "Описание",
    bodyMd: "Текст",
    seoTitle: "CRM",
    seoDescription: "Описание",
    manualCanonicalPath: null,
    indexable: true,
    ogMediaId: null,
    payload: { category: "crm-sales" },
    version: 2,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
  const newerCrm = {
    ...base,
    id: "00000000-0000-4000-8000-000000000002",
    slug: "newer-crm",
    updatedAt: new Date("2026-02-03T04:05:06.000Z"),
  };
  const aiArticle = {
    ...base,
    id: "00000000-0000-4000-8000-000000000003",
    slug: "ai-article",
    payload: { category: "ai-for-business" },
  };
  const sitemap = buildBlogSitemap([base, newerCrm, aiArticle]);

  assert.match(sitemap, /https:\/\/kordev\.team\/blog\/category\/crm-sales\//);
  assert.match(sitemap, new RegExp(newerCrm.updatedAt.toISOString()));
  assert.equal((sitemap.match(/\/blog\/category\/crm-sales\//g) ?? []).length, 1);
  assert.equal((sitemap.match(/\/blog\/category\/ai-for-business\//g) ?? []).length, 1);
});
