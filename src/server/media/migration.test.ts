import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import { createAdminUser } from "../auth/bootstrap";
import { createDb } from "../db/client";
import { contentEntries, contentMediaRefs, contentRevisions, mediaAssets } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { applyMediaMigration, discoverMediaMigration, verifyMediaMigration } from "./migration";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

databaseTest("dry-run is deterministic, deduplicates files and never mutates data or storage", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const root = await mkdtemp(path.join(tmpdir(), "kordev-media-migration-"));
  await mkdir(path.join(root, "public", "images"), { recursive: true });
  await writeFile(path.join(root, "public", "images", "same.png"), png);
  const [entry] = await db.insert(contentEntries).values({
    kind: "article", slug: "media-migration", title: "Материал",
    bodyMd: "![Первое](/images/same.png)\n\n![Второе](/images/same.png)\n\n![Внешнее](https://example.com/external.jpg)\n\n![Плохой путь](../../secret.png)",
    payload: { coverUrl: "/images/same.png" },
  }).returning();
  const before = await db.select().from(contentEntries).where(eq(contentEntries.id, entry.id));

  const first = await discoverMediaMigration(root, db);
  const second = await discoverMediaMigration(root, db);

  assert.equal(first.reportChecksum, second.reportChecksum);
  assert.equal(first.assets.length, 1);
  assert.equal(first.replacements.length, 3);
  assert.equal(first.counts.external, 1);
  assert.equal(first.counts.problems, 1);
  assert.equal(first.problems[0].reason, "path_outside_allowlist");
  assert.deepEqual(await db.select().from(contentEntries).where(eq(contentEntries.id, entry.id)), before);
  assert.equal((await db.select().from(mediaAssets)).length, 0);
});

databaseTest("apply validates the report, writes one revision and resumes idempotently", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const actor = await createAdminUser(db, { login: "owner", password: "очень-длинный-пароль-2026" });
  const root = await mkdtemp(path.join(tmpdir(), "kordev-media-apply-"));
  await mkdir(path.join(root, "public", "images"), { recursive: true });
  await writeFile(path.join(root, "public", "images", "photo.png"), png);
  const [entry] = await db.insert(contentEntries).values({
    kind: "article", slug: "apply-media", title: "Материал", bodyMd: "![Фото](/images/photo.png)", payload: {},
  }).returning();
  const report = await discoverMediaMigration(root, db);
  let uploads = 0;
  const service = {
    async upload(input: { altText: string }) {
      uploads += 1;
      const [asset] = await db.insert(mediaAssets).values({
        objectKey: `media/v1/${uploads}/original.png`, visibility: "public", mimeType: "image/png",
        byteSize: png.length, checksum: `${uploads}`.padStart(64, "0"), width: 1, height: 1,
        altText: input.altText, decorative: false, createdBy: actor.id,
      }).returning();
      return asset;
    },
  };

  await assert.rejects(() => applyMediaMigration({ ...report, reportChecksum: "0".repeat(64) }, db, service as never), /media_migration_report_changed/);
  const applied = await applyMediaMigration(report, db, service as never);
  assert.equal(applied.applied, 1);
  const [updated] = await db.select().from(contentEntries).where(eq(contentEntries.id, entry.id));
  assert.match(updated.bodyMd, /media:[0-9a-f-]{36}/);
  assert.equal(updated.version, 2);
  assert.equal((await db.select().from(contentMediaRefs).where(eq(contentMediaRefs.entryId, entry.id))).length, 1);
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, entry.id))).length, 1);
  assert.equal((await verifyMediaMigration(report, db)).ok, true);

  const resumed = await applyMediaMigration(report, db, service as never);
  assert.deepEqual(resumed, { applied: 0, unchanged: 1 });
  assert.equal(uploads, 1);
});
