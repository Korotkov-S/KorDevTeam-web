import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StaticRouter } from "react-router";
import { ViewCount } from "./ViewCount";
import { CaseCard } from "./CaseCard";
import { ContentCard } from "./ContentCard";
import { HomeCaseMosaic } from "../home/HomeCaseMosaic";
import { BlogCard } from "../BlogCard";
Object.assign(globalThis, { React });
test("accessible Russian labels, exact big integers and unavailable state render without JS", () => {
  for (const [value, label] of [["0", "0 просмотров"], ["1", "1 просмотр"], ["2", "2 просмотра"], ["5", "5 просмотров"], ["11", "11 просмотров"], ["21", "21 просмотр"], ["9007199254740993", "9 007 199 254 740 993 просмотра"], [null, "Просмотры недоступны"]] as const) {
    const doc = new JSDOM(renderToStaticMarkup(<ViewCount value={value} />)).window.document;
    assert.equal(doc.querySelector("span[aria-label]")?.getAttribute("aria-label"), label);
    assert.equal(doc.querySelector("svg")?.getAttribute("aria-hidden"), "true");
    assert.equal(doc.querySelector("[aria-live]"), null);
    if (value === null) assert.equal(doc.querySelector("span[aria-label]")?.textContent, "—");
  }
});
test("case, home mosaic, blog and generic cards show supplied counts; disabled fixtures stay hidden", () => {
  const project = { slug: "a", title: "Case", summary: "Summary", result: null, image: null, tags: [], viewCount: "21" };
  const post = { slug: "a", title: "Article", summary: "Summary", image: null, tags: [], viewCount: "21" };
  const html = renderToStaticMarkup(<StaticRouter location="/"><CaseCard project={project} /><HomeCaseMosaic projects={[project]} /><ContentCard post={post} /><BlogCard post={{ ...post, id: "a", excerpt: "Excerpt", date: "2026-10-21", readTime: "5 мин", category: null }} fallbackSrc="/opengraphlogo.jpeg" actionLabel="Читать" /></StaticRouter>);
  assert.equal(new JSDOM(html).window.document.querySelectorAll('[aria-label="21 просмотр"]').length, 4);
  assert.doesNotMatch(renderToStaticMarkup(<StaticRouter location="/"><CaseCard project={{ ...project, viewCount: undefined }} /></StaticRouter>), /просмотр/);
});
