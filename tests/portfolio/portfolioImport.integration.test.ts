import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";
import { load } from "cheerio";

import { createDb } from "../../src/server/db/client";
import { contentEntries } from "../../src/server/db/schema";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { applyPortfolioImport, planPortfolioImport } from "../../src/server/portfolio/importer";
import { loadPortfolioSources } from "../../src/server/portfolio/loader";
import { startTestRuntime } from "../ssr/support/runtime";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseTest = databaseUrl ? test : test.skip;

databaseTest("local portfolio import publishes 23 indexable SSR case routes", { timeout: 120_000 }, async t => {
  await resetTestDatabase(databaseUrl!);
  const db = createDb(databaseUrl!);
  const sources = await loadPortfolioSources();
  const result = await applyPortfolioImport(db, await planPortfolioImport(db, sources));
  assert.equal(result.inserted + result.updated + result.unchanged, 23);

  const entries = await db.select().from(contentEntries).where(eq(contentEntries.kind, "case"));
  assert.equal(entries.length, 23);
  assert.ok(entries.every(entry => entry.status === "published" && entry.indexable));
  assert.equal(new Set(entries.map(entry => entry.seoTitle)).size, 23);
  assert.equal(new Set(entries.map(entry => entry.seoDescription)).size, 23);

  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl! });
  t.after(runtime.close);

  const catalogResponse = await fetch(`${runtime.origin}/cases/?category=mobile`);
  assert.equal(catalogResponse.status, 200);
  const catalog = load(await catalogResponse.text());
  assert.equal(catalog('link[rel="canonical"]').attr("href"), "https://kordev.team/cases/");
  const catalogHrefs = catalog('a[href^="/cases/"]')
    .map((_, element) => catalog(element).attr("href"))
    .get()
    .filter(href => href !== "/cases/");
  const catalogLinks = [...new Set(catalogHrefs)];
  assert.equal(catalogLinks.length, 20);
  assert.deepEqual(catalogLinks.slice(0, 11), [
    "/cases/serviceplus/",
    "/cases/amch/",
    "/cases/dom-krugom/",
    "/cases/jully-bride/",
    "/cases/noodome/",
    "/cases/sims-dynasty-tree/",
    "/cases/stone-product-calculator/",
    "/cases/stroyrem/",
    "/cases/tbi-group-tour-service/",
    "/cases/wowbanner/",
    "/cases/teharmatura-automation/",
  ]);
  for (const hidden of ["inplain", "roost", "siberian-steel"]) {
    assert.equal(catalogLinks.includes(`/cases/${hidden}/`), false);
  }

  for (const source of sources) {
    const pathname = `/cases/${source.slug}/`;
    const response = await fetch(runtime.origin + pathname);
    assert.equal(response.status, 200, source.slug);
    const html = await response.text();
    const document = load(html);
    assert.equal(document("h1").length, 1, source.slug);
    assert.equal(document("h1").text().replace(/\s+/g, " ").trim(), source.payload.h1, source.slug);
    assert.equal(document("title").text(), `${source.seoTitle} | KorDevTeam`, source.slug);
    assert.equal(document('meta[name="description"]').attr("content"), source.seoDescription, source.slug);
    assert.equal(document('meta[name="robots"]').attr("content"), "index, follow", source.slug);
    assert.equal(document('link[rel="canonical"]').attr("href"), `https://kordev.team${pathname}`, source.slug);
    assert.doesNotMatch(html, /projects!A\d|kus_live_|finance@example|бюджет\s+\d/i, source.slug);
  }

  const sitemapResponse = await fetch(`${runtime.origin}/sitemap-pages.xml`);
  assert.equal(sitemapResponse.status, 200);
  const sitemap = load(await sitemapResponse.text(), { xml: true });
  const caseLocations = sitemap("url > loc").map((_, element) => sitemap(element).text()).get().filter(location => location.includes("/cases/") && location !== "https://kordev.team/cases/");
  assert.equal(caseLocations.length, 23);
  assert.deepEqual(new Set(caseLocations), new Set(sources.map(source => `https://kordev.team/cases/${source.slug}/`)));
});
