import assert from "node:assert/strict";
import { test } from "node:test";

import { createAdminUser } from "../auth/bootstrap";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { ContentCache } from "../content/cache";
import { createContentService } from "../content/service";
import { createAdminContentService } from "./contentService";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

const article = (slug: string) => ({
  kind: "article" as const, slug, title: "Статья", bodyMd: "Текст",
  seoTitle: "SEO заголовок", seoDescription: "Описание", payload: {},
  intent: "draft" as const, relations: [], mediaRefs: [],
});

databaseTest("service publishes, unpublishes, restores and versions settings", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const actor = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  let invalidations = 0;
  const service = createAdminContentService(db, () => { invalidations += 1; });
  const draft = await service.save(article("lifecycle"), actor.id);
  const published = await service.save({ ...article("lifecycle"), id: draft.id, expectedVersion: 1, intent: "publish" }, actor.id);
  assert.equal(published.status, "published");
  const unpublished = await service.unpublish(draft.id, 2, actor.id);
  assert.equal(unpublished.status, "draft");
  const restored = await service.restore(draft.id, 2, 3, actor.id);
  assert.equal(restored.version, 4);
  assert.equal(restored.status, "published");

  const createdSetting = await service.saveSetting("organization", { name: "ИП Коротков" }, 0);
  assert.equal(createdSetting.version, 1);
  await assert.rejects(() => service.saveSetting("organization", { name: "Старое" }, 0), /setting_version_conflict/);
  const updatedSetting = await service.saveSetting("organization", { name: "Коротков А. Е." }, 1);
  assert.equal(updatedSetting.version, 2);
  assert.equal(invalidations, 4);

  assert.equal(await service.hardDelete(draft.id, 4), true);
  assert.equal(await service.hardDelete(draft.id, 4), false);
});

databaseTest("publication rejects incomplete content without changing its version", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const actor = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const service = createAdminContentService(db);
  const draft = await service.save({ ...article("incomplete"), seoTitle: "" }, actor.id);
  await assert.rejects(
    () => service.save({ ...article("incomplete"), id: draft.id, expectedVersion: 1, seoTitle: "", intent: "publish" }, actor.id),
    /content_validation_error/,
  );
  assert.equal((await service.getEditorData(draft.id)).entry.version, 1);
});

databaseTest("admin writes invalidate public entry, list and sitemap caches", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const actor = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const admin = createAdminContentService(db);
  const publicContent = createContentService(db, new ContentCache(Date.now, 60));
  const draft = await admin.save(article("cache-visible"), actor.id);
  assert.equal((await publicContent.listPublishedEntries("article")).length, 0);

  await admin.save({ ...article("cache-visible"), id: draft.id, expectedVersion: 1, intent: "publish" }, actor.id);

  assert.equal((await publicContent.listPublishedEntries("article"))[0]?.id, draft.id);
});
