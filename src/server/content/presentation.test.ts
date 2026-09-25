import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { load } from "cheerio";
import "../../i18n";
import { Blog } from "../../components/Blog";
import { articleCard, articlePresentation } from "./presentation";
import type { ContentEntry } from "./service";

function entry(id: string, title: string, publishedAt: string): ContentEntry {
  return { id, kind: "article", slug: id, title, excerpt: "Описание статьи", bodyMd: "Текст статьи", seoTitle: title,
    seoDescription: "Описание статьи", payload: {}, indexable: true, status: "published", version: 2,
    ogMediaId: null, manualCanonicalPath: null, publishedAt: new Date(publishedAt),
    createdAt: new Date(publishedAt), updatedAt: new Date(publishedAt) };
}

test("PostgreSQL article timestamps render newest first with Russian dates and machine-readable times", () => {
  const posts = [
    entry("older", "Альфа — старая", "2025-01-19T08:00:00.000Z"),
    entry("oldest", "Бета — самая старая", "2024-12-01T10:00:00.000Z"),
    entry("newer", "Янтарь — новая", "2025-01-19T15:00:00.000Z"),
  ].map(articleCard);
  // tsx's direct component import uses classic JSX; the application Vite build
  // supplies the automatic runtime. Provide the real React runtime to this harness.
  const host = globalThis as typeof globalThis & { React?: typeof React };
  const previous = host.React;
  host.React = React;
  let html: string;
  try { html = renderToStaticMarkup(createElement(StaticRouter, { location: "/" }, createElement(Blog, { posts, mode: "preview" }))); }
  finally { if (previous) host.React = previous; else delete host.React; }
  const $ = load(html);
  assert.deepEqual($("article").map((_, element) => $(element).find('a[href^="/blog/"]').attr("href")).get(),
    ["/blog/newer/", "/blog/older/", "/blog/oldest/"]);
  assert.deepEqual($("article time").map((_, element) => $(element).attr("datetime")).get(),
    ["2025-01-19T15:00:00.000Z", "2025-01-19T08:00:00.000Z", "2024-12-01T10:00:00.000Z"]);
  assert.match($("article time").first().text(), /^19 января 2025/);
  assert.doesNotMatch($("article time").text(), /T\d\d:|\.000Z/);
});

test("article payload media identifiers resolve only through the supplied media map", () => {
  const mediaId = "00000000-0000-4000-8000-000000000001";
  const media = { [mediaId]: { id: mediaId, src: "https://cdn.example/cover.webp", srcSet: "", sizes: "100vw", alt: "", decorative: true, width: 1200, height: 630 } };
  const value = { ...entry("media-entry", "Материал", "2026-09-17T08:00:00.000Z"), payload: { coverUrl: mediaId, imageUrls: [mediaId, "https://legacy.example/image.jpg"] } };

  const article = articlePresentation(value, media);

  assert.equal(article.coverUrl, "https://cdn.example/cover.webp");
  assert.deepEqual(article.imageUrls, ["https://cdn.example/cover.webp", "https://legacy.example/image.jpg"]);
  assert.equal(articlePresentation({ ...value, payload: { coverUrl: "00000000-0000-4000-8000-000000000099" } }, media).coverUrl, "");
});

test("article cards expose only approved blog category slugs", () => {
  const valid = articleCard({
    ...entry("categorized", "Материал с категорией", "2026-09-18T08:00:00.000Z"),
    payload: { category: "crm-sales" },
  });
  const stale = articleCard({
    ...entry("stale", "Материал со старой категорией", "2026-09-17T08:00:00.000Z"),
    payload: { category: "old-category" },
  });

  assert.equal(valid.category, "crm-sales");
  assert.equal(stale.category, null);
});
