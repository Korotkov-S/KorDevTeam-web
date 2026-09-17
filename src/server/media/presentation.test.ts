import assert from "node:assert/strict";
import { test } from "node:test";

import { createAdminUser } from "../auth/bootstrap";
import { createDb } from "../db/client";
import { contentEntries, contentMediaRefs, mediaAssets } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { loadEntryMediaMaps, resolveMediaAsset } from "./presentation";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;

test("resolves immutable media variants into a deterministic CDN srcset", () => {
  const resolved = resolveMediaAsset({
    id: "00000000-0000-4000-8000-000000000001",
    objectKey: "media/v1/aa/hash/original.png",
    mimeType: "image/png",
    width: 1600,
    height: 900,
    altText: "Команда & офис",
    decorative: false,
    variants: {
      "1280": { objectKey: "media/v1/aa/hash/1280.webp", width: 1280, height: 720 },
      "640": { objectKey: "media/v1/aa/hash/640.webp", width: 640, height: 360 },
    },
  } as never, new URL("https://cdn.example/assets/"));

  assert.equal(resolved.src, "https://cdn.example/assets/media/v1/aa/hash/original.png");
  assert.equal(resolved.srcSet, "https://cdn.example/assets/media/v1/aa/hash/640.webp 640w, https://cdn.example/assets/media/v1/aa/hash/1280.webp 1280w");
  assert.equal(resolved.alt, "Команда & офис");
  assert.equal(resolved.width, 1600);
});

databaseTest("loads media for multiple entries with one batched reference query", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const actor = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const entries = await db.insert(contentEntries).values([
    { kind: "article", slug: "first-media-entry", title: "Первая" },
    { kind: "page", slug: "second-media-entry", title: "Вторая" },
  ]).returning();
  const assets = await db.insert(mediaAssets).values(["a", "b"].map((letter, index) => ({
    objectKey: `media/v1/${letter.repeat(2)}/${letter.repeat(64)}/original.png`,
    visibility: "public" as const, mimeType: "image/png", byteSize: 10,
    checksum: letter.repeat(64), width: 10, height: 10, altText: `Изображение ${index + 1}`,
    createdBy: actor.id,
  }))).returning();
  await db.insert(contentMediaRefs).values(entries.map((entry, index) => ({
    entryId: entry.id, mediaId: assets[index].id, fieldPath: "bodyMd:0",
  })));

  const maps = await loadEntryMediaMaps(db, entries.map(entry => entry.id), new URL("https://cdn.example/"));

  assert.equal(maps[entries[0].id][assets[0].id].alt, "Изображение 1");
  assert.equal(maps[entries[1].id][assets[1].id].alt, "Изображение 2");
});
