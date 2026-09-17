import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import { createAdminUser } from "../auth/bootstrap";
import { createDb } from "../db/client";
import { contentEntries, contentMediaRefs, contentRelations, contentRevisions, mediaAssets } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createAdminContentRepository } from "./contentRepository";
import { parseAdminContentCommand } from "./contentSchemas";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

databaseTest("save atomically writes entry, relations, media refs and a complete revision", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const actor = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const repository = createAdminContentRepository(db);
  const initial = await repository.save(parseAdminContentCommand({
    kind: "article", slug: "admin-article", title: "Черновик", bodyMd: "Первый текст",
    seoTitle: "SEO", seoDescription: "Описание", payload: {}, intent: "draft", relations: [], mediaRefs: [],
  }), actor.id);
  const target = await repository.save(parseAdminContentCommand({
    kind: "article", slug: "related-article", title: "Связанный", bodyMd: "Текст",
    seoTitle: "SEO", seoDescription: "Описание", payload: {}, intent: "draft", relations: [], mediaRefs: [],
  }), actor.id);
  const [media] = await db.insert(mediaAssets).values({
    objectKey: `media/v1/${randomUUID()}/original.png`, visibility: "public", mimeType: "image/png",
    byteSize: 10, checksum: randomUUID().replaceAll("-", "").padEnd(64, "0"), width: 2, height: 2,
    altText: "Иллюстрация", decorative: false, createdBy: actor.id,
  }).returning();

  const saved = await repository.save(parseAdminContentCommand({
    id: initial.id, expectedVersion: 1,
    kind: "article", slug: "admin-article", title: "Обновлено", bodyMd: `![Иллюстрация](media:${media.id})`,
    seoTitle: "SEO", seoDescription: "Описание", payload: {}, intent: "draft",
    relations: [{ targetId: target.id, type: "related_article", sortOrder: 0 }],
    mediaRefs: [{ mediaId: media.id, fieldPath: "bodyMd:0" }],
  }), actor.id);

  assert.equal(saved.version, 2);
  assert.equal((await db.select().from(contentRelations).where(eq(contentRelations.sourceId, saved.id))).length, 1);
  assert.equal((await db.select().from(contentMediaRefs).where(eq(contentMediaRefs.entryId, saved.id))).length, 1);
  const [revision] = await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, saved.id));
  assert.equal(revision.version, 1);
  assert.deepEqual(Object.keys(revision.snapshot).sort(), ["entry", "mediaRefs", "relations"]);

  await assert.rejects(() => repository.save(parseAdminContentCommand({
    id: initial.id, expectedVersion: 1,
    kind: "article", slug: "admin-article", title: "Устарело", bodyMd: "",
    seoTitle: "SEO", seoDescription: "Описание", payload: {}, intent: "draft", relations: [], mediaRefs: [],
  }), actor.id), /content_version_conflict/);
  assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.id, saved.id)))[0].title, "Обновлено");
});
