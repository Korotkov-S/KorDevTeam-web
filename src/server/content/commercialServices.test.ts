import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { contentEntries } from "../db/schema";
import {
  applyCommercialServiceSources,
  applyCommercialServiceSourcesInTransaction,
  loadCommercialServiceSources,
} from "./commercialServices";
import { listPublishedRelations } from "./relations";
import { loadPortfolioSources } from "../portfolio/loader";

test("service source loading preserves CMS Markdown bytes for exact release reconciliation", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "kordev-service-source-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const catalog = JSON.parse(await readFile("content/services.ru.json", "utf8"));
  const source = catalog[0];
  source.bodyMd = `\n${source.bodyMd.trim()}\n`;
  const filename = path.join(directory, "services.json");
  await writeFile(filename, JSON.stringify([source]));
  const [loaded] = await loadCommercialServiceSources(filename);
  assert.equal(loaded.bodyMd, source.bodyMd);
  source.bodyMd = " ".repeat(300);
  await writeFile(filename, JSON.stringify([source]));
  await assert.rejects(loadCommercialServiceSources(filename), /commercial_service_source_invalid/);
});

test("service catalog keeps published internal case and article links resolvable", async () => {
  const services = await loadCommercialServiceSources();
  const cases = await loadPortfolioSources(path.resolve("content/portfolio/cases"));
  const caseSlugs = new Set(cases.map(item => item.slug));
  const articles = JSON.parse(await readFile("public/content/blog.ru.json", "utf8"));
  const articleSlugs = new Set(articles.map((item: { slug: string }) => item.slug));
  for (const source of services) {
    assert.ok(source.relatedCases.length >= 2);
    assert.ok(source.relatedArticles.length >= 1);
    assert.equal(new Set(source.relatedCases).size, source.relatedCases.length);
    for (const slug of source.relatedCases) assert.ok(caseSlugs.has(slug), slug);
    for (const slug of source.relatedArticles) assert.ok(articleSlugs.has(slug), slug);
    assert.ok(source.faq.length >= 3);
  }
});

test("support package amount agrees with hourly rate and hours", async () => {
  const sources = await loadCommercialServiceSources();
  const support = sources.find(source => source.slug === "additional-service")!;
  assert.equal(support.payload.pricePackageHours, 20);
  assert.equal(support.payload.priceHourlyRate, 2000);
  assert.equal(support.payload.priceFrom, 40000);
  assert.equal(support.payload.priceFrom, Number(support.payload.pricePackageHours) * Number(support.payload.priceHourlyRate));
  assert.match(JSON.stringify(support), /Kanban/);
  assert.match(JSON.stringify(support), /MCP/);
});

test("published AI examples exclude unrelated Random Coffee", async () => {
  const ai = (await loadCommercialServiceSources()).find(source => source.slug === "ai-automation")!;
  assert.deepEqual(ai.relatedCases, ["nisli", "teharmatura-automation"]);
  assert.doesNotMatch(ai.bodyMd, /Random Coffee/);
});

test("web service evidence retains WoWBanner and opens existing project screenshots", async () => {
  const web = (await loadCommercialServiceSources()).find(source => source.slug === "web-services")!;
  assert.ok(web.relatedCases.includes("wowbanner"));
  assert.match(web.bodyMd, /WoWBanner/);
  const screenshots = [...web.bodyMd.matchAll(/!\[[^\]]*\]\((https:\/\/[^)]+)\)/g)].map(match => new URL(match[1]));
  assert.ok(screenshots.length >= 3);
  for (const url of screenshots) {
    assert.equal(url.origin, "https://kordev.team");
    assert.ok(url.pathname.startsWith("/projects/portfolio/"));
  }
});

test("commercial service sync publishes researched content and ordered internal links idempotently", async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const sources = await loadCommercialServiceSources();
  const faqCount = sources.reduce((total, source) => total + source.faq.length, 0);

  await db.insert(contentEntries).values(sources.map(source => ({
    kind: "service" as const,
    slug: source.slug,
    title: `Старое название ${source.slug}`,
    seoTitle: "Общий SEO-заголовок",
    seoDescription: "Общее описание.",
    status: "published" as const,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    payload: {},
  })));

  const targets = new Map<string, "case" | "article">();
  for (const source of sources) {
    for (const slug of source.relatedCases) targets.set(slug, "case");
    for (const slug of source.relatedArticles) targets.set(slug, "article");
  }
  await db.insert(contentEntries).values([...targets].map(([slug, kind]) => ({
    kind,
    slug,
    title: slug,
    seoTitle: slug,
    seoDescription: `${slug} description`,
    status: "published" as const,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    payload: {},
  })));

  assert.deepEqual(await applyCommercialServiceSources(db, sources), {
    inserted: faqCount,
    updated: sources.length,
    unchanged: 0,
  });
  const [crm] = await db.select().from(contentEntries).where(and(
    eq(contentEntries.kind, "service"),
    eq(contentEntries.slug, "crm-development"),
  ));
  assert.equal(crm.title, "Разработка CRM-системы на заказ");
  assert.match(crm.seoDescription, /CRM.+бизнес/i);
  assert.equal(crm.version, 2);
  assert.ok(Array.isArray(crm.payload.readiness) && crm.payload.readiness.length >= 4);
  assert.ok(String(crm.bodyMd).length > 300);
  assert.deepEqual(
    (await listPublishedRelations(db, crm.id, "related_case")).map(entry => entry.slug),
    ["krasotula-crm", "wowbanner", "tbi-group-tour-service"],
  );
  assert.equal((await listPublishedRelations(db, crm.id, "related_faq")).length, 10);

  assert.deepEqual(await applyCommercialServiceSources(db, sources), {
    inserted: 0,
    updated: 0,
    unchanged: sources.length + faqCount,
  });
  const [unchangedCrm] = await db.select().from(contentEntries).where(and(
    eq(contentEntries.kind, "service"),
    eq(contentEntries.slug, "crm-development"),
  ));
  assert.equal(unchangedCrm.version, 2);
});

test("commercial service transaction writer rolls back with its caller", async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const [source] = await loadCommercialServiceSources();
  const targets = new Map<string, "case" | "article">();
  for (const slug of source.relatedCases) targets.set(slug, "case");
  for (const slug of source.relatedArticles) targets.set(slug, "article");
  await db.insert(contentEntries).values([...targets].map(([slug, kind]) => ({
    kind,
    slug,
    title: slug,
    seoTitle: slug,
    seoDescription: `${slug} description`,
    status: "published" as const,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    payload: {},
  })));

  await assert.rejects(db.transaction(async tx => {
    await applyCommercialServiceSourcesInTransaction(tx, [source]);
    throw new Error("rollback_outer_transaction");
  }), /rollback_outer_transaction/);

  assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.kind, "service"))).length, 0);
  assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.kind, "faq"))).length, 0);
});
