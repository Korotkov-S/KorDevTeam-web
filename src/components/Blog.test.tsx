import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, StaticRouter } from "react-router-dom";

const dom = new JSDOM("<!doctype html><html lang=\"ru\"><body></body></html>", {
  url: "https://kordev.team/blog/",
});
Object.assign(globalThis, {
  React,
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Document: dom.window.Document,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const require = createRequire(import.meta.url);
const { cleanup, render } = require("@testing-library/react");
require("../i18n");
const { Blog } = require("./Blog") as typeof import("./Blog");
afterEach(cleanup);

test("blog cards preserve ordered media and SSR article microdata", () => {
  const markup = renderToStaticMarkup(<StaticRouter location="/blog/"><Blog mode="index" posts={[{
    id: "article-1",
    slug: "multi-image-story",
    title: "История с изображениями",
    excerpt: "Подробный материал.",
    date: "2026-09-18",
    readTime: "7 мин",
    tags: ["Практика"],
    category: "digital-products",
    coverUrl: "/cover.webp",
    imageUrls: ["/inside-1.webp", "inside-2.webp"],
  }]} /></StaticRouter>);
  const ssr = new JSDOM(markup).window.document;

  const blog = ssr.querySelector('[itemscope][itemtype="https://schema.org/Blog"]');
  assert.ok(blog);
  assert.equal(blog.querySelector('meta[itemprop="name"]')?.getAttribute("content"), "Блог");
  assert.ok((blog.querySelector('meta[itemprop="description"]')?.getAttribute("content")?.length ?? 0) > 20);
  const list = blog.querySelector('[itemscope][itemtype="https://schema.org/ItemList"]');
  assert.ok(list);
  const article = list.querySelector('[itemscope][itemtype="https://schema.org/BlogPosting"]');
  assert.ok(article);
  assert.deepEqual(
    [...article.querySelectorAll("img")].map(image => image.getAttribute("src")),
    ["/cover.webp", "/inside-1.webp", "/inside-2.webp"],
  );
  assert.equal(article.querySelector('time[itemprop="datePublished"]')?.getAttribute("datetime"), "2026-09-18T00:00:00.000Z");
  assert.equal(article.querySelector('meta[itemprop="url"]')?.getAttribute("content"), "https://kordev.team/blog/multi-image-story/");
});

test("all repository multi-image articles expose every distinct source image in order", async () => {
  const source = JSON.parse(await readFile("public/content/blog.ru.json", "utf8")) as Array<{
    slug: string; title: string; excerpt: string; date: string; readTime: string; tags: string[];
    category: "business-automation" | "crm-sales" | "digital-products" | "technical-support" | "ai-for-business" | "it-project-management";
    coverUrl: string; imageUrls: string[];
  }>;
  const posts = source.filter(post => post.imageUrls.length > 1).map(post => ({ ...post, id: post.slug }));
  assert.ok(posts.length > 0, "repository must contain at least one multi-image article fixture");
  render(<MemoryRouter initialEntries={["/blog/"]}><Blog mode="index" posts={posts} /></MemoryRouter>);

  for (const post of posts) {
    const canonical = document.querySelector(`meta[itemprop="url"][content="https://kordev.team/blog/${post.slug}/"]`);
    const article = canonical?.closest('article[itemtype="https://schema.org/BlogPosting"]');
    assert.ok(article, post.slug);
    assert.deepEqual(
      [...article.querySelectorAll("img")].map(image => image.getAttribute("src")),
      [...new Set([post.coverUrl, ...post.imageUrls])],
      post.slug,
    );
  }
});

const categoryPosts = [
  ["business-automation", "Автоматизация"],
  ["crm-sales", "CRM"],
  ["digital-products", "Продукты"],
  ["technical-support", "Поддержка"],
  ["ai-for-business", "ИИ"],
  ["it-project-management", "Проекты"],
].map(([category, title], index) => ({
  id: `article-${index}`,
  slug: `article-${index}`,
  title,
  excerpt: `Описание статьи ${index}`,
  date: `2026-09-${String(index + 10).padStart(2, "0")}`,
  readTime: "5 мин",
  tags: ["Практика"],
  category,
}));

test("blog index exposes every category as an SSR link with counts", () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/blog/">
      <Blog mode="index" posts={categoryPosts} />
    </StaticRouter>,
  );
  const ssr = new JSDOM(markup).window.document;

  assert.equal(ssr.querySelectorAll('nav[aria-label="Категории блога"] a').length, 6);
  assert.equal(
    ssr.querySelector('a[href="/blog/category/crm-sales/"] [data-category-count]')?.textContent,
    "1",
  );
});

test("category mode renders all supplied articles without pagination", () => {
  const posts = Array.from({ length: 18 }, (_, index) => ({
    id: `crm-${index}`,
    slug: `crm-${index}`,
    title: `CRM-статья ${index + 1}`,
    excerpt: "Практический материал о CRM.",
    date: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
    readTime: "6 мин",
    tags: ["CRM"],
    category: "crm-sales",
  }));
  const markup = renderToStaticMarkup(
    <StaticRouter location="/blog/category/crm-sales/">
      <Blog
        mode="category"
        posts={posts}
        heading={{
          eyebrow: "Категория блога",
          title: "CRM и управление продажами",
          description: "Материалы о заявках, сделках и повторных касаниях.",
        }}
      />
    </StaticRouter>,
  );
  const ssr = new JSDOM(markup).window.document;

  assert.equal(ssr.querySelectorAll('article[itemtype="https://schema.org/BlogPosting"]').length, 18);
  assert.equal(ssr.querySelector('nav[aria-label="Навигация по страницам"]'), null);
});
