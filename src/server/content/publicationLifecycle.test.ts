import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { adminUsers, contentEntries, contentRelations, contentRevisions, mediaAssets, seoChanges, seoQueries } from "../db/schema";
import { createAdminContentRepository } from "../admin/contentRepository";
import { parseAdminContentCommand } from "../admin/contentSchemas";
import { createContentService } from "./service";
import { createContentRepository } from "./repository";
import { parseContentCommand, type ContentEntry, type SaveContentCommand } from "./types";
import { createSeoRepository } from "../seo-monitoring/repository";
import { createPageControlRepository } from "../seo-monitoring/pageControlRepository";
import { buildBlogSitemap } from "../seo/sitemaps";

const url = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = url ? test : test.skip;
const article = (slug: string, payload: Record<string, unknown> = {}): SaveContentCommand => ({ kind: "article", slug, title: "Практика", bodyMd: "Процесс", seoTitle: "Практика", seoDescription: "Описание", indexable: true, payload });
const asCommand = (e: ContentEntry): SaveContentCommand => ({ kind: e.kind, slug: e.slug, title: e.title, excerpt: e.excerpt, bodyMd: e.bodyMd,
  seoTitle: e.seoTitle, seoDescription: e.seoDescription, indexable: e.indexable, ogMediaId: e.ogMediaId, payload: e.payload });
async function fixture() {
  await resetTestDatabase(url); const db = createDb(url);
  const [actor] = await db.insert(adminUsers).values({ login: "publication-owner", passwordDigest: "unused", passwordSalt: "unused" }).returning();
  const admin = createAdminContentRepository(db), service = createContentService(db), generic = createContentRepository(db);
  const publish = (input: SaveContentCommand) => admin.save(parseAdminContentCommand({ ...input, intent: "publish", relations: [], mediaRefs: [] }), actor.id);
  const adapters = [
    { name: "admin", draft: (input: SaveContentCommand) => admin.save(parseAdminContentCommand({ ...input, intent: "draft", relations: [], mediaRefs: [] }), actor.id),
      publish: (entry: ContentEntry) => publish({ ...asCommand(entry), id: entry.id, expectedVersion: entry.version }),
      edit: (entry: ContentEntry, fields: Partial<ContentEntry>) => publish({ ...asCommand(entry), id: entry.id, expectedVersion: entry.version, ...fields } as SaveContentCommand),
      withdraw: (e: ContentEntry) => admin.unpublish(e.id, e.version, actor.id), restore: (e: ContentEntry, v: number) => admin.restore(e.id, v, e.version, actor.id), remove: (e: ContentEntry) => admin.hardDelete(e.id, e.version) },
    { name: "generic", draft: (input: SaveContentCommand) => service.saveDraft(input, actor.id), publish: (e: ContentEntry) => service.publishEntry(e.id, e.version, actor.id),
      edit: async (e: ContentEntry, fields: Partial<ContentEntry>) => (await generic.update(e.id, e.version, actor.id, () => fields)).after!,
      withdraw: (e: ContentEntry) => service.unpublishEntry(e.id, e.version, actor.id), restore: (e: ContentEntry, v: number) => service.restoreRevision(e.id, v, e.version, actor.id), remove: (e: ContentEntry) => service.hardDeleteEntry(e.id, e.version) },
  ];
  const events = (id: string) => db.select().from(seoChanges).where(eq(seoChanges.contentEntryId, id));
  return { db, actor, admin, service, generic, publish, adapters, events };
}

databaseTest("both repositories record exact published versions, not original publication dates", async () => {
  const { db, adapters, actor, events } = await fixture();
  for (const a of adapters) {
    const draft = await a.draft(article(`${a.name}-version`));
    assert.equal((await events(draft.id)).length, 0);
    const published = await a.publish(draft);
    let rows = await events(draft.id);
    assert.equal(rows.length, 1); assert.equal(rows[0].contentVersion, 2);
    assert.equal(rows[0].pagePath, `/blog/${a.name}-version/`); assert.equal(rows[0].actorAdminUserId, actor.id);
    const old = new Date("2001-01-01T00:00:00Z");
    await db.update(contentEntries).set({ publishedAt: old }).where(eq(contentEntries.id, published.id));
    const changed = await a.edit({ ...published, publishedAt: old }, { bodyMd: "Новый процесс" });
    rows = await events(draft.id);
    assert.equal(rows.length, 2);
    const latest = rows.find(r => r.contentVersion === 3)!;
    assert.equal(latest.type, "content"); assert.ok(latest.appliedAt.getTime() > old.getTime());
    assert.equal(changed.publishedAt?.toISOString(), "2001-01-01T00:00:00.000Z");
    const metadata = await a.edit(changed, { seoTitle: "Новый SEO заголовок" });
    assert.equal((await events(draft.id)).find(r => r.contentVersion === metadata.version)!.type, "metadata");
    const noOp = await a.publish(metadata);
    assert.equal((await events(draft.id)).length, 4);
    assert.match((await events(draft.id)).find(r => r.contentVersion === noOp.version)!.summary, /version|верси/i);
    assert.equal(noOp.publishedAt?.toISOString(), "2001-01-01T00:00:00.000Z");
  }
});

databaseTest("direct publication, withdrawal, slug replacement, restore and deletion keep truthful paths", async () => {
  const { db, publish, adapters, events } = await fixture();
  const initial = await publish(article("direct-create"));
  assert.equal((await events(initial.id))[0]?.contentVersion, 1);
  for (const a of adapters) {
    let live = await a.publish(await a.draft(article(`${a.name}-old`)));
    live = await a.edit(live, { slug: `${a.name}-new` });
    let rows = await events(live.id);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.filter(r => r.contentVersion === 3).map(r => r.pagePath).sort(), [`/blog/${a.name}-new/`, `/blog/${a.name}-old/`]);
    assert.equal(rows.find(r => r.pagePath === `/blog/${a.name}-old/` && r.contentVersion === 3)!.type, "technical");
    const withdrawn = await a.withdraw(live);
    assert.equal((await events(live.id)).find(r => r.contentVersion === 4)!.type, "technical");
    const restored = await a.restore(withdrawn, 3);
    rows = await events(live.id); assert.equal(rows.length, 5);
    assert.equal(rows.find(r => r.contentVersion === restored.version)!.pagePath, `/blog/${a.name}-new/`);
    await a.remove(restored);
    const deletedEvents = await db.select().from(seoChanges).where(and(eq(seoChanges.pagePath, `/blog/${a.name}-new/`), eq(seoChanges.contentVersion, restored.version)));
    assert.equal(deletedEvents.length, 2); assert.ok(deletedEvents.every(r => r.contentEntryId === null));
    assert.ok(deletedEvents.some(r => r.type === "technical" && r.actorAdminUserId === null));
  }
});

databaseTest("draft-only changes and FAQ publication create no independent page events", async () => {
  const { adapters, db } = await fixture();
  for (const a of adapters) {
    const d = await a.draft(article(`${a.name}-draft`));
    await a.draft({ ...asCommand(d), id: d.id, expectedVersion: d.version, title: "Черновик изменён" });
  }
  const { admin, actor } = { admin: createAdminContentRepository(db), actor: (await db.select().from(adminUsers))[0] };
  await admin.save(parseAdminContentCommand({ kind: "faq", slug: "question", title: "Вопрос", seoTitle: "Вопрос", seoDescription: "Ответ", payload: {}, intent: "publish", relations: [], mediaRefs: [] }), actor.id);
  assert.equal((await db.select().from(seoChanges)).length, 0);
});

databaseTest("relations and media changes are recorded after the exact content transaction", async () => {
  const { db, admin, publish, actor, events } = await fixture();
  const live = await publish(article("links-and-media"));
  const target = await publish(article("linked-target"));
  const links = await admin.save(parseAdminContentCommand({ ...article(live.slug), id: live.id, expectedVersion: 1, intent: "publish", relations: [{ targetId: target.id, type: "related_article", sortOrder: 0 }], mediaRefs: [] }), actor.id);
  const linkedEvent = (await events(live.id)).find(r => r.contentVersion === 2);
  assert.ok(linkedEvent, "the published relation change must have an exact version event");
  assert.equal(linkedEvent.type, "interlinking");
  const [media] = await db.insert(mediaAssets).values({ objectKey: `media/v1/${randomUUID()}/original.png`, visibility: "public", mimeType: "image/png", byteSize: 10, checksum: "a".repeat(64), width: 2, height: 2, altText: "Процесс", decorative: false, createdBy: actor.id }).returning();
  await admin.save(parseAdminContentCommand({ ...article(live.slug), id: live.id, expectedVersion: links.version, intent: "publish", relations: [{ targetId: target.id, type: "related_article", sortOrder: 0 }], mediaRefs: [{ mediaId: media.id, fieldPath: "bodyMd:0" }] }), actor.id);
  assert.equal((await events(live.id)).find(r => r.contentVersion === 3)!.type, "structure");
});

databaseTest("published explicit phrases become only unconfirmed candidates, preserving existing assignments", async () => {
  const { db, publish, adapters, service } = await fixture();
  const query = "  Разработка   CRM  ";
  const live = await publish(article("candidate-page", { primarySeoQuery: query, wordstatFrequency: 9999, wordstatFrequencyStatus: "confirmed" }));
  const [candidate] = await db.select().from(seoQueries);
  assert.ok(candidate); assert.equal(candidate.normalizedQuery, "разработка crm"); assert.equal(candidate.targetPath, "/blog/candidate-page/");
  assert.equal(candidate.status, "candidate"); assert.equal(candidate.tracked, false); assert.equal(candidate.wordstatFrequency, null); assert.equal(candidate.frequencyBand, "unclassified");
  const [assigned] = await db.insert(seoQueries).values({ queryText: "Другой запрос", normalizedQuery: "другой запрос", targetPath: "/services/another/", status: "active", tracked: true, wordstatFrequency: 123, frequencyBand: "medium", priority: 5 }).returning();
  await publish(article("do-not-retarget", { primarySeoQuery: "Другой запрос" }));
  assert.deepEqual((await db.select().from(seoQueries).where(eq(seoQueries.id, assigned.id)))[0], assigned);
  for (const a of adapters) {
    const d = await a.draft(article(`${a.name}-candidate-draft`, { primarySeoQuery: `${a.name} draft phrase` }));
    assert.equal((await db.select().from(seoQueries).where(eq(seoQueries.normalizedQuery, `${a.name} draft phrase`))).length, 0);
    await a.publish(d);
    assert.equal((await db.select().from(seoQueries).where(eq(seoQueries.normalizedQuery, `${a.name} draft phrase`))).length, 1);
  }
  await publish({ ...article("noindex-phrase", { primarySeoQuery: "Не включать" }), indexable: false });
  assert.equal((await db.select().from(seoQueries).where(eq(seoQueries.normalizedQuery, "не включать"))).length, 0);
  const registry = await createPageControlRepository(db).listPages({ limit: 100, cursor: null });
  assert.equal(registry.items.find(p => p.id === live.id)!.keywords.length, 0, "a candidate is not active tracking");
  assert.match(buildBlogSitemap(await service.listPublishedEntries("article")), /https:\/\/kordev.team\/blog\/candidate-page\//);
  assert.doesNotMatch(buildBlogSitemap(await service.listPublishedEntries("article")), /noindex-phrase/);
});

test("primary phrase respects the existing 500 UTF8 byte query limit", () => {
  assert.throws(() => parseContentCommand(article("oversized-query", { primarySeoQuery: "я".repeat(251) })), /content_validation_error/);
  assert.equal(parseContentCommand(article("bounded-query", { primarySeoQuery: "я".repeat(250) })).payload.primarySeoQuery, "я".repeat(250));
});

databaseTest("published cases and services enter the same journal without invented keyword candidates", async () => {
  const { db, publish, events } = await fixture();
  const casePage = await publish({ kind: "case", slug: "new-case", title: "Реальный кейс", seoTitle: "Кейс", seoDescription: "Результат", payload: {} });
  const service = await publish({ kind: "service", slug: "new-service", title: "Услуга", seoTitle: "Услуга", seoDescription: "Описание", payload: {
    h1: "Услуга", lead: "Процесс", problems: ["Рутина"], solutions: ["Автоматизация"], integrations: ["CRM"], technologies: ["TypeScript"],
    processSteps: [{ title: "Анализ", description: "Процесс" }], priceFactors: ["Объём"], timeRange: "По плану", ctaTitle: "Обсудить", ctaText: "Задача", ctaType: "form",
    results: [{ title: "Результат", description: "Согласованный" }], guarantees: [{ title: "Поддержка", description: "По договору" }],
  } });
  assert.equal((await events(casePage.id))[0].pagePath, "/cases/new-case/");
  assert.equal((await events(service.id))[0].pagePath, "/services/new-service/");
  assert.equal((await db.select().from(seoQueries)).length, 0);
});

databaseTest("concurrent stale publication has one version event and no stale journal residue", async () => {
  const { adapters, events } = await fixture();
  for (const a of adapters) {
    const draft = await a.draft(article(`${a.name}-concurrent`));
    const results = await Promise.allSettled([a.publish(draft), a.publish(draft)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await events(draft.id)).length, 1);
  }
});

databaseTest("journal failure rolls back publication, revision, relations and candidate state", async () => {
  const { db, adapters, admin, actor, publish } = await fixture();
  const target = await publish(article("rollback-target"));
  await db.execute(sql`CREATE FUNCTION reject_publication_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture journal failure'; END $$`);
  await db.execute(sql`CREATE TRIGGER reject_publication_journal BEFORE INSERT ON seo_changes FOR EACH ROW EXECUTE FUNCTION reject_publication_journal()`);
  for (const a of adapters) {
    const draft = await a.draft(article(`${a.name}-rollback`, { primarySeoQuery: `${a.name} rollback phrase` }));
    await assert.rejects(() => a.publish(draft));
    assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.id, draft.id)))[0].status, "draft");
    assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, draft.id))).length, 0);
    assert.equal((await db.select().from(seoQueries).where(eq(seoQueries.normalizedQuery, `${a.name} rollback phrase`))).length, 0);
  }
  const draft = await adapters[0].draft(article("rollback-relations"));
  await assert.rejects(() => admin.save(parseAdminContentCommand({ ...article(draft.slug), id: draft.id, expectedVersion: 1, intent: "publish", relations: [{ targetId: target.id, type: "related_article", sortOrder: 0 }], mediaRefs: [] }), actor.id));
  assert.equal((await db.select().from(contentRelations).where(eq(contentRelations.sourceId, draft.id))).length, 0);
  assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.id, draft.id)))[0].version, 1);
});

databaseTest("candidate insert failure rolls back the journal and publication in the same transaction", async () => {
  const { db, adapters, events } = await fixture();
  await db.execute(sql`CREATE FUNCTION reject_publication_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture candidate failure'; END $$`);
  await db.execute(sql`CREATE TRIGGER reject_publication_candidate BEFORE INSERT ON seo_queries FOR EACH ROW EXECUTE FUNCTION reject_publication_candidate()`);
  for (const a of adapters) {
    const draft = await a.draft(article(`${a.name}-candidate-failure`, { primarySeoQuery: `${a.name} fail phrase` }));
    await assert.rejects(() => a.publish(draft));
    assert.equal((await events(draft.id)).length, 0);
    const [current] = await db.select().from(contentEntries).where(eq(contentEntries.id, draft.id));
    assert.equal(current.version, 1); assert.equal(current.status, "draft");
  }
});

databaseTest("publication and manual candidate creation serialize without overwriting either winner", async () => {
  const { db, publish } = await fixture();
  const manual = { queryText: "Общий запрос", normalizedQuery: "общий запрос", targetPath: "/services/manual/", wordstatFrequency: 321, frequencyBand: "medium" as const, kind: "commercial" as const, priority: 3 };
  const results = await Promise.allSettled([createSeoRepository(db).createCandidate(manual), publish(article("racing-publication", { primarySeoQuery: "Общий запрос" }))]);
  assert.equal(results[1].status, "fulfilled");
  const rows = await db.select().from(seoQueries).where(eq(seoQueries.normalizedQuery, "общий запрос"));
  assert.equal(rows.length, 1); assert.equal(rows[0].status, "candidate"); assert.equal(rows[0].tracked, false);
  if (results[0].status === "fulfilled") { assert.equal(rows[0].targetPath, "/services/manual/"); assert.equal(rows[0].wordstatFrequency, 321); }
  else { assert.match(results[0].reason.message, /seo_query_exists/); assert.equal(rows[0].targetPath, "/blog/racing-publication/"); assert.equal(rows[0].wordstatFrequency, null); }
});
