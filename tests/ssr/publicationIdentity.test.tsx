import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { createDb } from "../../src/server/db/client";
import { contentEntries } from "../../src/server/db/schema";
import { startTestRuntime } from "./support/runtime";
import { PublishedContentIdentity } from "../../src/components/PublishedContentIdentity";
test("published_identity_is_server_owned_without_duplicate_semantic_tags", () => {
  const html = renderToStaticMarkup(<PublishedContentIdentity id="10000000-0000-4000-8000-000000000001" version={4}><article><h1>Практика</h1></article></PublishedContentIdentity>);
  assert.match(html, /data-kordev-content-version="4"/); assert.equal((html.match(/<article/g) ?? []).length, 1); assert.equal((html.match(/<h1/g) ?? []).length, 1);
});
const url = process.env.TEST_DATABASE_URL ?? "";
(url ? test : test.skip)("actual_article_case_service_ssr_identity_matches_presented_entry_not_payload", async t => {
  await resetTestDatabase(url); const db = createDb(url);
  const entries = await db.insert(contentEntries).values((["article", "case", "service", "page"] as const).map((kind, i) => ({
    kind, slug: `identity-${kind}`, status: "published" as const, title: `Практика ${kind}`, seoTitle: "Практика", seoDescription: "Описание", bodyMd: "Практический шаг", version: i + 3,
    payload: { h1: `Заголовок ${kind}`, lead: "Практика", "data-kordev-content-version": 999 }, publishedAt: new Date(),
  }))).returning();
  const runtime = await startTestRuntime({ DATABASE_URL: url }); t.after(runtime.close);
  for (const entry of entries) {
    const path = entry.kind === "article" ? `/blog/${entry.slug}/` : entry.kind === "case" ? `/cases/${entry.slug}/` : entry.kind === "service" ? `/services/${entry.slug}/` : `/${entry.slug}/`;
    const response = await fetch(runtime.origin + path); assert.equal(response.status, 200);
    const $ = load(await response.text()), marker = $("[data-kordev-content-entry-id]");
    assert.equal(marker.length, entry.kind === "page" ? 0 : 1);
    if (entry.kind !== "page") { assert.equal(marker.attr("data-kordev-content-entry-id"), entry.id); assert.equal(marker.attr("data-kordev-content-version"), String(entry.version)); assert.equal(marker.find("h1").text(), entry.payload.h1); }
  }
});
