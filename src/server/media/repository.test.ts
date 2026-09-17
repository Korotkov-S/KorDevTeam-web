import assert from "node:assert/strict";
import { test } from "node:test";

import { createDb } from "../db/client";
import { contentEntries, contentMediaRefs } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createAdminUser } from "../auth/bootstrap";
import { createMediaRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

databaseTest("repository deduplicates assets and enforces metadata versions", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const admin = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const repository = createMediaRepository(db);
  const input = {
    objectKey: `media/v1/aa/${"a".repeat(64)}/original.png`,
    visibility: "public" as const,
    mimeType: "image/png",
    byteSize: 100,
    checksum: "a".repeat(64),
    width: 10,
    height: 10,
    variants: {},
    altText: "Команда",
    decorative: false,
    processingVersion: 1,
    createdBy: admin.id,
  };

  const first = await repository.insertOrGet(input);
  const second = await repository.insertOrGet(input);
  assert.equal(second.id, first.id);
  const updated = await repository.updateMetadata(first.id, 1, { altText: "Офис", decorative: false });
  assert.equal(updated.version, 2);
  await assert.rejects(
    () => repository.updateMetadata(first.id, 1, { altText: "Старое", decorative: false }),
    /media_version_conflict/,
  );
});

databaseTest("repository refuses referenced deletion and cascades references with content", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const admin = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const repository = createMediaRepository(db);
  const asset = await repository.insertOrGet({
    objectKey: `media/v1/bb/${"b".repeat(64)}/original.png`,
    visibility: "public",
    mimeType: "image/png",
    byteSize: 100,
    checksum: "b".repeat(64),
    width: 10,
    height: 10,
    variants: { "10": { objectKey: `media/v1/bb/${"b".repeat(64)}/10.webp`, width: 10, height: 10, byteSize: 20, mimeType: "image/webp" } },
    altText: "Кейс",
    decorative: false,
    processingVersion: 1,
    createdBy: admin.id,
  });
  const [entry] = await db.insert(contentEntries).values({ kind: "case", slug: "linked-case", title: "Кейс" }).returning();
  await db.insert(contentMediaRefs).values({ entryId: entry.id, mediaId: asset.id, fieldPath: "body_md:0" });

  await assert.rejects(() => repository.deleteUnused(asset.id, 1), /media_in_use/);
  await db.delete(contentEntries);
  const deleted = await repository.deleteUnused(asset.id, 1);
  assert.equal(deleted?.id, asset.id);
  assert.equal(await repository.objectKeyReferenced(asset.objectKey), false);
});
