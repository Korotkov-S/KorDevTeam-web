import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import "../i18n";
import type { ContentEntry } from "../server/content/service";
import { BlogCategoryContent, selectPublishedCategory } from "./blog-category";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

function article(index: number, category = "crm-sales"): ContentEntry {
  const date = new Date(`2026-08-${String((index % 28) + 1).padStart(2, "0")}T09:00:00.000Z`);
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: "article",
    slug: `article-${index}`,
    status: "published",
    title: `Статья ${index}`,
    excerpt: "Практическое описание статьи.",
    bodyMd: "Текст статьи.",
    seoTitle: `Статья ${index}`,
    seoDescription: "Практическое описание статьи.",
    indexable: true,
    ogMediaId: null,
    payload: { h1: `Статья ${index}`, category, readTime: "5 мин", tags: ["CRM"] },
    version: 2,
    publishedAt: date,
    createdAt: date,
    updatedAt: date,
    manualCanonicalPath: null,
  };
}

test("category selection returns every published CRM article", () => {
  const result = selectPublishedCategory(
    "crm-sales",
    Array.from({ length: 18 }, (_, index) => article(index)),
  );

  assert.equal(result?.entries.length, 18);
  assert.equal(result?.category.slug, "crm-sales");
});

test("unknown and empty categories resolve to null", () => {
  const entries = [article(1), article(2)];

  assert.equal(selectPublishedCategory("unknown", entries), null);
  assert.equal(selectPublishedCategory("ai-for-business", entries), null);
});

test("category content renders breadcrumbs, one H1 and the profile service link", () => {
  const selected = selectPublishedCategory("crm-sales", [article(1)]);
  assert.ok(selected);
  const markup = renderToStaticMarkup(
    <StaticRouter location="/blog/category/crm-sales/">
      <BlogCategoryContent
        category={selected.category}
        posts={[{
          id: "article-1",
          slug: "article-1",
          title: "Статья 1",
          excerpt: "Практическое описание статьи.",
          date: "2026-08-02T09:00:00.000Z",
          readTime: "5 мин",
          tags: ["CRM"],
          category: "crm-sales",
        }]}
      />
    </StaticRouter>,
  );
  const document = new JSDOM(markup).window.document;

  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/blog/"]')?.textContent, "Блог");
  assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"] [aria-current="page"]')?.textContent, "CRM и управление продажами");
  assert.equal(document.querySelector('a[href="/services/crm-development/"]')?.textContent?.trim(), "Разработка и внедрение CRM →");
});
