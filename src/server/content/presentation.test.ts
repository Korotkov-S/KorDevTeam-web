import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { load } from "cheerio";
import "../../i18n";
import { Blog } from "../../components/Blog";
import { articleCard } from "./presentation";
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
