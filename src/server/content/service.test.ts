import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { adminUsers, contentEntries, contentRelations, contentRevisions } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { ContentCache } from "./cache";
import { createContentService } from "./service";
import { buildPagesSitemap } from "../seo/sitemaps";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = databaseUrl ? test : test.skip;
const db = databaseUrl ? createDb(databaseUrl) : undefined!;
let adminId: string;
before(async () => {
  if (!databaseUrl) return;
  await resetTestDatabase(databaseUrl);
  [ { id: adminId } ] = await db.insert(adminUsers).values({
    login: "content-admin", passwordDigest: "unused", passwordSalt: "unused",
  }).returning();
});

const draftCommand = () => ({
  kind: "service" as const, slug: `service-${randomUUID()}`, title: "CRM development",
  seoTitle: "CRM development for business", seoDescription: "Build a CRM for your workflow.",
  payload: {
    h1: "CRM development", lead: "A CRM for your workflow", problems: ["Manual work"],
    solutions: ["Automate routine tasks"], integrations: ["Accounting"], technologies: ["TypeScript"],
    processSteps: [{ title: "Discovery", description: "Map workflows" }],
    priceFrom: 100000, priceFactors: ["Integration scope"], timeRange: "From 8 weeks",
    ctaTitle: "Discuss the project", ctaText: "Tell us about your workflow", ctaType: "form" as const,
    results: [{ title: "Automated workflow", description: "Approved result" }],
    guarantees: [{ title: "Support", description: "Agreed support period" }],
  },
});

databaseTest("draft is invisible and publish is immediately visible", async () => {
  const service = createContentService(db);
  const draft = await service.saveDraft(draftCommand(), adminId);
  assert.equal(await service.getPublishedEntry("service", draft.slug), null);
  assert.equal((await service.listPublishedEntries("service")).some(e => e.id === draft.id), false);
  const published = await service.publishEntry(draft.id, draft.version, adminId);
  assert.equal((await service.getPublishedEntry("service", draft.slug))?.version, 2);
  assert.equal((await service.listPublishedEntries("service")).some(e => e.id === draft.id), true);
  assert.ok(published.publishedAt instanceof Date);
});

databaseTest("stale editor cannot overwrite a newer version", async () => {
  const service = createContentService(db);
  const command = draftCommand();
  const draft = await service.saveDraft(command, adminId);
  const changed = await service.saveDraft({ ...command, id: draft.id, expectedVersion: 1, title: "New title" }, adminId);
  await assert.rejects(service.saveDraft({ ...command, id: draft.id, expectedVersion: 1 }, adminId), /content_version_conflict/);
  assert.equal(changed.version, 2);
  assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.id, draft.id)))[0].title, "New title");
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id))).length, 1);
});

databaseTest("concurrent editors produce exactly one winner and one revision", async () => {
  const service = createContentService(db);
  const command = draftCommand();
  const draft = await service.saveDraft(command, adminId);
  const results = await Promise.allSettled(["First", "Second"].map(title =>
    service.saveDraft({ ...command, id: draft.id, expectedVersion: 1, title }, adminId)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const failure = results.find(r => r.status === "rejected");
  assert.ok(failure?.status === "rejected");
  assert.match(failure.reason.message, /content_version_conflict/);
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id))).length, 1);
});

databaseTest("revisions retain the full pre-change snapshot and restore advances version", async () => {
  const service = createContentService(db);
  const command = draftCommand();
  const draft = await service.saveDraft(command, adminId);
  await service.publishEntry(draft.id, 1, adminId);
  await service.saveDraft({ ...command, id: draft.id, expectedVersion: 2, title: "Changed", payload: {} }, adminId);
  const restored = await service.restoreRevision(draft.id, 2, 3, adminId);
  assert.equal(restored.version, 4);
  assert.equal(restored.title, "CRM development");
  assert.equal(restored.status, "published");
  assert.deepEqual(restored.payload, command.payload);
  assert.equal((await service.getPublishedEntry("service", draft.slug))?.version, 4);
  const revisions = await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id));
  assert.deepEqual(revisions.map(r => r.version).sort(), [1, 2, 3]);
  assert.deepEqual(revisions.find(r => r.version === 1)?.snapshot, JSON.parse(JSON.stringify(draft)));
  assert.equal(revisions[0].adminUserId, adminId);
  await assert.rejects(service.restoreRevision(draft.id, 1, 3, adminId), /content_version_conflict/);
  await assert.rejects(service.restoreRevision(draft.id, 99, 4, adminId), /content_revision_not_found/);
});

databaseTest("unpublish removes cached public reads and republish preserves first publication time", async () => {
  const service = createContentService(db);
  const draft = await service.saveDraft(draftCommand(), adminId);
  const published = await service.publishEntry(draft.id, 1, adminId);
  await service.getPublishedEntry("service", draft.slug);
  await service.listPublishedEntries("service");
  const unpublished = await service.unpublishEntry(draft.id, 2, adminId);
  assert.equal(unpublished.status, "draft");
  assert.equal(await service.getPublishedEntry("service", draft.slug), null);
  assert.equal((await service.listPublishedEntries("service")).some(e => e.id === draft.id), false);
  const republished = await service.publishEntry(draft.id, 3, adminId);
  assert.equal(republished.publishedAt?.getTime(), published.publishedAt?.getTime());
});

databaseTest("hard delete rejects stale versions and cascades revisions and both relation directions", async () => {
  const service = createContentService(db);
  const draft = await service.saveDraft(draftCommand(), adminId);
  const other = await service.saveDraft(draftCommand(), adminId);
  await service.publishEntry(draft.id, 1, adminId);
  await db.insert(contentRelations).values([
    { sourceId: other.id, targetId: draft.id, type: "related_service" },
    { sourceId: draft.id, targetId: other.id, type: "related_service" },
  ]);
  await service.getPublishedEntry("service", draft.slug);
  await service.listPublishedEntries("service");
  await assert.rejects(service.hardDeleteEntry(draft.id, 1), /content_version_conflict/);
  assert.equal(await service.hardDeleteEntry(draft.id, 2), true);
  assert.equal(await service.hardDeleteEntry(draft.id, 2), false);
  assert.equal(await service.getPublishedEntry("service", draft.slug), null);
  assert.equal((await service.listPublishedEntries("service")).some(e => e.id === draft.id), false);
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id))).length, 0);
  assert.equal((await db.select().from(contentRelations)).length, 0);
});

databaseTest("writes invalidate old/new slugs, lists, relationship lists and sitemaps only on commit", async () => {
  const cache = new ContentCache(Date.now, 60);
  const service = createContentService(db, cache);
  const command = draftCommand();
  const draft = await service.saveDraft(command, adminId);
  const source = await service.saveDraft(draftCommand(), adminId);
  await db.insert(contentRelations).values({ sourceId: source.id, targetId: draft.id, type: "related_service" });
  await service.publishEntry(draft.id, 1, adminId);
  await service.getPublishedEntry("service", draft.slug);
  await service.listPublishedEntries("service");
  cache.set(`relations:${source.id}:related_service`, [draft]);
  cache.set("sitemaps", [draft]);
  // Invalid actor violates the revision FK after the snapshot insert is attempted.
  await assert.rejects(service.unpublishEntry(draft.id, 2, randomUUID()));
  assert.ok(cache.get(`entry:service:${draft.slug}`));
  assert.ok(cache.get("sitemaps"));
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id))).length, 1);
  const renamed = await service.saveDraft({ ...command, id: draft.id, expectedVersion: 2, slug: `renamed-${randomUUID()}` }, adminId);
  assert.equal(cache.get(`entry:service:${draft.slug}`), undefined);
  assert.equal(cache.get("list:service"), undefined);
  assert.equal(cache.get(`relations:${source.id}:related_service`), undefined);
  assert.equal(cache.get("sitemaps"), undefined);
  assert.equal(await service.getPublishedEntry("service", draft.slug), null);
  await service.publishEntry(renamed.id, 3, adminId);
  assert.equal((await service.getPublishedEntry("service", renamed.slug))?.version, 4);
});

databaseTest("incomplete drafts save but publication requires H1, SEO and service sections", async () => {
  const service = createContentService(db);
  for (const change of [
    { title: "", payload: {} }, { seoTitle: " " }, { seoDescription: " " },
    ...["h1", "lead", "problems", "solutions", "integrations", "technologies", "processSteps", "priceFactors", "ctaTitle", "ctaText", "ctaType", "results", "guarantees", "timeRange"].map(field => ({ payload: { ...draftCommand().payload, [field]: undefined } })),
  ]) {
    const entry = await service.saveDraft({ ...draftCommand(), ...change }, adminId);
    await assert.rejects(service.publishEntry(entry.id, 1, adminId), /content_validation_error/);
    assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, entry.id))).length, 0);
  }
});

databaseTest("draft schemas reject malformed arrays, CTA, metadata and unknown payload fields", async () => {
  const service = createContentService(db);
  for (const payload of [
    { problems: "not an array" }, { solutions: [3] }, { integrations: [{}] }, { technologies: [false] },
    { processSteps: ["step"] }, { priceFactors: [null] }, { results: [{}] }, { guarantees: [1] },
    { ctaType: "javascript" }, { ctaTitle: 1 }, { ctaText: false },
    { priceFrom: -1 }, { timeRange: 3 }, { relatedCases: [] },
  ]) await assert.rejects(service.saveDraft({ ...draftCommand(), payload } as never, adminId), /content_validation_error/);
  for (const change of [{ slug: "Bad Slug" }, { seoTitle: "x".repeat(181) }, { manualCanonicalPath: "/other/" }, { status: "published" }]) {
    await assert.rejects(service.saveDraft({ ...draftCommand(), ...change } as never, adminId), /content_validation_error/);
  }
});

databaseTest("all content kinds save and publish through the same validated boundary", async () => {
  const service = createContentService(db);
  for (const kind of ["case", "article", "page", "faq"] as const) {
    const draft = await service.saveDraft({ kind, slug: `entry-${randomUUID()}`, title: "Heading", seoTitle: "SEO title", seoDescription: "Description", bodyMd: "Body", payload: {} }, adminId);
    await service.publishEntry(draft.id, 1, adminId);
    assert.equal((await service.getPublishedEntry(kind, draft.slug))?.title, "Heading");
  }
});

test("cache expires after 60 seconds, evicts above 500 records, and isolates callers", () => {
  let now = 0;
  const cache = new ContentCache(() => now, 60);
  cache.set("first", { value: 1 });
  const read = cache.get<{ value: number }>("first")!;
  read.value = 99;
  assert.deepEqual(cache.get("first"), { value: 1 });
  now = 59999;
  assert.ok(cache.get("first"));
  now = 60000;
  assert.equal(cache.get("first"), undefined);
  for (let i = 0; i <= 500; i++) cache.set(`record:${i}`, i);
  assert.equal(cache.get("record:0"), undefined);
  assert.equal(cache.get("record:500"), 500);
});

test("a public read in flight cannot repopulate cache with content invalidated during its query", async () => {
  const cache = new ContentCache(Date.now, 60);
  let resolve!: (value: string) => void;
  let calls = 0;
  const pending = cache.read("entry:article:slug", () => {
    calls++;
    return calls === 1 ? new Promise<string>(r => { resolve = r; }) : Promise.resolve("new");
  });
  cache.invalidate(["entry:article:slug"]);
  resolve("old");
  assert.equal(await pending, "new");
  assert.equal(cache.get("entry:article:slug"), "new");
});

databaseTest("independent production slots immediately observe publication changes in entries and sitemap lists", async (t) => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalTtl = process.env.CONTENT_CACHE_TTL_SECONDS;
  process.env.NODE_ENV = "production";
  delete process.env.CONTENT_CACHE_TTL_SECONDS;
  t.after(() => {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalTtl === undefined) delete process.env.CONTENT_CACHE_TTL_SECONDS;
    else process.env.CONTENT_CACHE_TTL_SECONDS = originalTtl;
  });
  const reader = createContentService(db, new ContentCache());
  const writer = createContentService(db, new ContentCache());
  const command = draftCommand();
  const draft = await writer.saveDraft(command, adminId);
  const visible = async (slug: string, version: number | null) => {
    assert.equal((await reader.getPublishedEntry("service", slug))?.version ?? null, version);
    const entries = await reader.listPublishedEntries("service");
    assert.equal(entries.find(e => e.slug === slug)?.version ?? null, version);
    assert.equal(buildPagesSitemap(entries).includes(`/services/${slug}/`), version !== null);
  };
  await visible(draft.slug, null); // Prewarm the inactive slot before a write elsewhere.
  await writer.publishEntry(draft.id, 1, adminId);
  await visible(draft.slug, 2);
  await writer.unpublishEntry(draft.id, 2, adminId);
  await visible(draft.slug, null);
  await writer.publishEntry(draft.id, 3, adminId);
  await visible(draft.slug, 4);
  const renamed = await writer.saveDraft({ ...command, id: draft.id, expectedVersion: 4, slug: `updated-${randomUUID()}` }, adminId);
  await visible(draft.slug, null);
  await visible(renamed.slug, null);
  await writer.publishEntry(renamed.id, 5, adminId);
  await visible(renamed.slug, 6);
});

test("TTL zero bypasses retention and cloning but still retries invalidated in-flight reads", async () => {
  const cache = new ContentCache(Date.now, 0);
  const value = { uncloneable() { return "fresh"; } };
  assert.doesNotThrow(() => cache.set("entry:article:slug", value));
  assert.equal(cache.get("entry:article:slug"), undefined);
  assert.equal(await cache.read("entry:article:slug", async () => value), value);
  assert.equal(cache.get("entry:article:slug"), undefined);
  assert.equal(await cache.read("entry:article:slug", async () => "next"), "next");
  let resolve!: (value: string) => void;
  let calls = 0;
  const pending = cache.read("entry:article:slug", () => ++calls === 1
    ? new Promise<string>(r => { resolve = r; }) : Promise.resolve("current"));
  cache.invalidate(["entry:article:slug"]);
  resolve("stale");
  assert.equal(await pending, "current");
  assert.equal(cache.get("entry:article:slug"), undefined);
});
