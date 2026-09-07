import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPaginationItems,
  getBlogPageHref,
  normalizeBlogPage,
  parseBlogDate,
  resolvePrerenderMeta,
  sortBlogPostsByDate,
} from "../src/lib/blogPresentation.mjs";

test("sortBlogPostsByDate shows the newest localized publication first", () => {
  const posts = [
    { slug: "june", date: "19 июня 2026" },
    { slug: "missing", date: "" },
    { slug: "july", date: "July 10, 2026" },
    { slug: "early-july", date: "7 июля 2026" },
  ];

  assert.deepEqual(
    sortBlogPostsByDate(posts).map((post) => post.slug),
    ["july", "early-july", "june", "missing"],
  );
  assert.deepEqual(posts.map((post) => post.slug), [
    "june",
    "missing",
    "july",
    "early-july",
  ]);
});

test("parseBlogDate rejects an invalid or missing publication date", () => {
  assert.equal(parseBlogDate("2026-07-10"), Date.UTC(2026, 6, 10));
  assert.equal(parseBlogDate("10 июля 2026"), Date.UTC(2026, 6, 10));
  assert.equal(parseBlogDate("July 10, 2026"), Date.UTC(2026, 6, 10));
  assert.equal(parseBlogDate(""), null);
  assert.equal(parseBlogDate("Введение"), null);
});

test("buildPaginationItems keeps long pagination compact around the active page", () => {
  assert.deepEqual(buildPaginationItems(6, 14), [
    1,
    "ellipsis-start",
    5,
    6,
    7,
    "ellipsis-end",
    14,
  ]);
  assert.deepEqual(buildPaginationItems(1, 14), [
    1,
    2,
    3,
    4,
    5,
    "ellipsis-end",
    14,
  ]);
  assert.deepEqual(buildPaginationItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("blog page URLs are shareable and invalid query values are clamped", () => {
  assert.equal(getBlogPageHref(1), "/blog/");
  assert.equal(getBlogPageHref(6), "/blog/?page=6");
  assert.equal(normalizeBlogPage("6", 7), 6);
  assert.equal(normalizeBlogPage("0", 7), 1);
  assert.equal(normalizeBlogPage("not-a-page", 7), 1);
  assert.equal(normalizeBlogPage("99", 7), 7);
});

test("resolvePrerenderMeta never replaces a known article title with Blog", () => {
  const fallback = {
    title: "Blog",
    excerpt: "Fallback excerpt",
    date: "",
    readTime: "2 мин",
    tags: [],
  };

  assert.deepEqual(
    resolvePrerenderMeta(
      {
        title: "ИИ в бизнесе: рабочий инструмент без магической кнопки",
        seoTitle: "ИИ в бизнесе",
        description: "Рабочий сценарий использования ИИ.",
      },
      fallback,
    ),
    {
      ...fallback,
      title: "ИИ в бизнесе: рабочий инструмент без магической кнопки",
      seoTitle: "ИИ в бизнесе",
      excerpt: "Рабочий сценарий использования ИИ.",
    },
  );

  assert.equal(
    resolvePrerenderMeta(
      { seoTitle: "Корректный заголовок", description: "Описание" },
      fallback,
    ).title,
    "Корректный заголовок",
  );
});
