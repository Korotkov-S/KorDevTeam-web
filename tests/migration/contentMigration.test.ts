import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { test, type TestContext } from "node:test";
import { eq } from "drizzle-orm";
import { importLegacyContent } from "../../scripts/migrate-content-to-postgres";
import { verifyContentMigration } from "../../scripts/verify-content-migration";
import { createDb } from "../../src/server/db/client";
import { contentEntries, contentRevisions, siteSettings } from "../../src/server/db/schema";
import { resetTestDatabase } from "../../src/server/db/testDatabase";

const require = createRequire(import.meta.url);
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-migration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "public/blog"), { recursive: true });
  await mkdir(path.join(root, "public/content"), { recursive: true });
  await writeFile(path.join(root, "public/blog/first.md"), "# Первая статья\n\nРусский текст статьи.");
  await writeFile(path.join(root, "public/blog/second.md"), "# Вторая статья\n\nЕщё один текст.");
  await writeFile(path.join(root, "public/blog/first.en.md"), "# English article\n\nEnglish content.");
  await writeFile(path.join(root, "public/content/projects.ru.json"), JSON.stringify([
    { id: "My_Project", title: "Русский проект", description: "Описание проекта", fullDescription: "Решение задачи" },
  ]));
  await writeFile(path.join(root, "public/content/projects.en.json"), JSON.stringify([{ id: "english", title: "English" }]));
  return root;
}

test("Russian fallback selection excludes English and produces deterministic canonical checksums", async t => {
  const fixtureRoot = await fixture(t);
  const first = await importLegacyContent({ fixtureRoot, dryRun: true });
  const second = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.deepEqual(first.counts, { articles: 2, cases: 1 });
  assert.equal(first.records.some(r => r.source.includes(".en.")), false);
  assert.equal(first.records.find(r => r.command.kind === "case")?.command.slug, "my-project");
  assert.deepEqual(first.collisions, []);
  assert.deepEqual(first.invalidRecords, []);
  assert.deepEqual(first.checksums, second.checksums);
  assert.match(first.checksums.batch, /^[a-f0-9]{64}$/);
  await writeFile(path.join(fixtureRoot, "public/content/projects.ru.json"), '[{"fullDescription":"Решение задачи","description":"Описание проекта","title":"Русский проект","id":"My_Project"}]');
  assert.deepEqual((await importLegacyContent({ fixtureRoot, dryRun: true })).checksums, first.checksums);
});

test("SQL.js Russian rows take precedence with missing records filled from files; source bytes stay unchanged", async t => {
  const fixtureRoot = await fixture(t);
  const SQL = await require("sql.js")();
  await writeFile(path.join(fixtureRoot, "public/content/blog.ru.json"), JSON.stringify([
    { slug: "first", lang: "ru", imageUrls: ["/detail.jpg"], seoTitle: "SEO из индекса" },
  ]));
  const legacy = new SQL.Database();
  legacy.run("CREATE TABLE posts (slug TEXT, lang TEXT, title TEXT, content_md TEXT, tags_json TEXT, cover_url TEXT, date_text TEXT, read_time_text TEXT, updated_at_ms INTEGER)");
  legacy.run("INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["first", "ru", "Из базы", "Русский текст из базы", '["CRM"]', "/old.jpg", "1 января 2025", "2 мин", 1735776000000]);
  legacy.run("INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ["english-only", "en", "English", "English", "[]", "", "", "", 0]);
  const dbPath = path.join(fixtureRoot, "server/data/content.sqlite");
  await mkdir(path.dirname(dbPath), { recursive: true });
  await writeFile(dbPath, legacy.export());
  const before = createHash("sha256").update(await readFile(dbPath)).digest("hex");
  const result = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.deepEqual(result.counts, { articles: 2, cases: 1 });
  assert.equal(result.records.find(r => r.command.slug === "first")?.command.title, "Из базы");
  const first = result.records.find(r => r.command.slug === "first")!;
  assert.equal(first.command.payload.coverUrl, "/old.jpg");
  assert.equal(first.command.payload.readTime, "2 мин");
  assert.deepEqual(first.command.payload.imageUrls, ["/old.jpg", "/detail.jpg"]);
  assert.equal(first.command.seoTitle, "SEO из индекса");
  assert.equal(first.timestamps.publishedAt, "2025-01-01T00:00:00.000Z");
  assert.equal(first.timestamps.updatedAt, "2025-01-02T00:00:00.000Z");
  assert.equal(result.records.some(r => r.command.slug === "english-only"), false);
  assert.equal(createHash("sha256").update(await readFile(dbPath)).digest("hex"), before);
  legacy.run("UPDATE posts SET cover_url = '/changed.jpg' WHERE lang = 'ru'");
  await writeFile(dbPath, legacy.export());
  legacy.close();
  const changed = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.notEqual(changed.checksums.batch, result.checksums.batch);
});

test("normalization collisions and malformed records are data errors with machine-readable CLI output", async t => {
  const fixtureRoot = await fixture(t);
  await writeFile(path.join(fixtureRoot, "public/content/projects.ru.json"), JSON.stringify([
    { id: "My_Project", title: "Один", description: "Текст" },
    { id: "my-project", title: "Два", description: "Текст" },
    { id: "invalid", title: "", description: "" },
  ]));
  const result = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.equal(result.collisions.length, 1);
  assert.equal(result.invalidRecords.length, 1);
  const cli = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate-content-to-postgres.ts", "--dry-run", "--root", fixtureRoot], { encoding: "utf8" });
  assert.equal(cli.status, 2, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).collisions.length, 1);
});

test("CLI distinguishes runtime failures from data errors without leaking connection secrets", async () => {
  const cli = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate-content-to-postgres.ts", "--unknown"], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(cli.stdout).ok, false);
  assert.ok(cli.stderr.length > 0);
});

test("fallback articles preserve Russian index SEO and Markdown tags", async t => {
  const fixtureRoot = await fixture(t);
  await writeFile(path.join(fixtureRoot, "public/blog/first.md"), "# Первая статья\n\nРусский текст.\n\n**Теги**: CRM, Разработка");
  await writeFile(path.join(fixtureRoot, "public/content/blog.ru.json"), JSON.stringify([
    { slug: "first", lang: "ru", seoTitle: "SEO заголовок", excerpt: "Описание из индекса", coverUrl: "/cover.jpg", imageUrls: ["/cover.jpg", "/detail.jpg"], readTime: "3 мин", date: "1 января 2025", updatedDate: "2 января 2025" },
  ]));
  const result = await importLegacyContent({ fixtureRoot, dryRun: true });
  const first = result.records.find(r => r.command.slug === "first")!;
  assert.equal(first.command.seoTitle, "SEO заголовок");
  assert.equal(first.command.seoDescription, "Описание из индекса");
  assert.deepEqual(first.command.payload.tags, ["CRM", "Разработка"]);
  assert.deepEqual(first.command.payload.imageUrls, ["/cover.jpg", "/detail.jpg"]);
  assert.equal(first.command.payload.readTime, "3 мин");
  assert.equal(first.timestamps.publishedAt, "2025-01-01T00:00:00.000Z");
  assert.equal(first.timestamps.updatedAt, "2025-01-02T00:00:00.000Z");
});

test("legacy SEO helpers return Russian metadata for unsupported language input", async () => {
  const { getSeoTitle } = await import("../../scripts/seo-descriptions.mjs");
  assert.equal(getSeoTitle("wordpress-optimization", "Fallback", "en"), "Оптимизация WordPress-сайта");
});

test("Markdown fallback removes frontmatter from presentation while checksumming raw metadata", async t => {
  const fixtureRoot = await fixture(t);
  const source = path.join(fixtureRoot, "public/blog/first.md");
  await writeFile(source, "---\ntitle: Заголовок\ninternalNote: source-marker-one\n---\n\n# Заголовок\n\nТолько текст статьи.");
  const first = await importLegacyContent({ fixtureRoot, dryRun: true });
  const article = first.records.find(r => r.command.slug === "first")!;
  assert.equal(article.command.bodyMd.trim(), "# Заголовок\n\nТолько текст статьи.");
  assert.equal(article.command.excerpt, "Только текст статьи.");
  assert.equal(article.command.seoDescription, "Только текст статьи.");
  await writeFile(source, "---\ntitle: Заголовок\ninternalNote: source-marker-two\n---\n\n# Заголовок\n\nТолько текст статьи.");
  const second = await importLegacyContent({ fixtureRoot, dryRun: true });
  const changed = second.records.find(r => r.command.slug === "first")!;
  assert.deepEqual(changed.command, article.command);
  assert.notEqual(changed.checksum, article.checksum);
  assert.notEqual(second.checksums.batch, first.checksums.batch);
});

test("migration validates compatibility media metadata instead of silently dropping invalid shapes", async t => {
  const fixtureRoot = await fixture(t);
  await writeFile(path.join(fixtureRoot, "public/content/blog.ru.json"), JSON.stringify([
    { slug: "first", lang: "ru", imageUrls: "not-an-array" },
  ]));
  const result = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.equal(result.ok, false);
  assert.equal(result.invalidRecords.length, 1);
});

test("Russian runtime ignores English browser preference and unsupported language changes", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => "en" }, navigator: { language: "en-US" } } as unknown as Window & typeof globalThis;
  const { default: i18n, i18nReady } = await import("../../src/i18n");
  await i18nReady;
  globalThis.window = previousWindow;
  assert.equal(i18n.resolvedLanguage, "ru");
  await i18n.changeLanguage("en");
  assert.equal(i18n.resolvedLanguage, "ru");
  assert.equal(i18n.hasResourceBundle("en", "translation"), false);
});

test("legacy project labels normalize punctuation to valid case slugs", async t => {
  const fixtureRoot = await fixture(t);
  await writeFile(path.join(fixtureRoot, "public/content/projects.ru.json"), JSON.stringify([
    { id: "Media & Entertainment", title: "Медиа", description: "Медиа-проект" },
  ]));
  const result = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.deepEqual(result.invalidRecords, []);
  assert.equal(result.records.find(r => r.command.kind === "case")?.command.slug, "media-entertainment");
});

test("legacy content handlers resolve English requests to Russian files", async t => {
  const fixtureRoot = await fixture(t);
  const { safeLang } = require("../../server/db");
  const { createSectionHandler } = require("../../server/utils/sectionFileHandler");
  assert.equal(safeLang("en"), "ru");
  const handler = createSectionHandler({ relDir: "public/blog", readRoots: [fixtureRoot], writeRoots: [fixtureRoot] });
  const result = await handler.read("first", "en");
  assert.match(result.content, /Первая статья/);
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test("real import is atomic, published with revisions, idempotent, and verification detects drift", { skip: !databaseUrl }, async t => {
  await resetTestDatabase(databaseUrl!);
  const db = createDb(databaseUrl!);
  const fixtureRoot = await fixture(t);
  await writeFile(path.join(fixtureRoot, "public/content/blog.ru.json"), JSON.stringify([
    { slug: "first", lang: "ru", coverUrl: "/cover.jpg", imageUrls: ["/cover.jpg"], readTime: "3 мин", date: "1 января 2025", updatedDate: "2 января 2025" },
  ]));
  const first = await importLegacyContent({ fixtureRoot, db, batchId: "fixture-1" });
  const second = await importLegacyContent({ fixtureRoot, db, batchId: "fixture-1" });
  assert.equal(first.inserted, 3);
  assert.equal(second.inserted, 0);
  assert.equal(second.unchanged, 3);
  const entries = await db.select().from(contentEntries);
  assert.equal(entries.length, 3);
  assert.ok(entries.every(e => e.status === "published" && e.version === 2 && e.publishedAt));
  const historical = entries.find(e => e.slug === "first")!;
  assert.equal(historical.publishedAt?.toISOString(), "2025-01-01T00:00:00.000Z");
  assert.equal(historical.updatedAt.toISOString(), "2025-01-02T00:00:00.000Z");
  assert.equal(historical.createdAt.toISOString(), "2025-01-01T00:00:00.000Z");
  assert.equal(historical.payload.coverUrl, "/cover.jpg");
  assert.equal((await db.select().from(contentRevisions)).length, 3);
  assert.equal((await verifyContentMigration({ fixtureRoot, db, batchId: "fixture-1" })).ok, true);
  await db.update(contentEntries).set({ updatedAt: new Date("2025-02-01") }).where(eq(contentEntries.id, historical.id));
  assert.equal((await verifyContentMigration({ fixtureRoot, db, batchId: "fixture-1" })).ok, false);
  await db.update(contentEntries).set({ updatedAt: new Date("2025-01-02") }).where(eq(contentEntries.id, historical.id));
  await writeFile(path.join(fixtureRoot, "public/blog/first.md"), "# Изменено\n\nНовый текст");
  await assert.rejects(importLegacyContent({ fixtureRoot, db, batchId: "fixture-1" }), /migration_batch_checksum_conflict/);
  assert.equal((await db.select().from(contentEntries)).length, 3);
  await writeFile(path.join(fixtureRoot, "public/blog/aaa-new.md"), "# Новый материал\n\nНовый текст");
  await assert.rejects(importLegacyContent({ fixtureRoot, db, batchId: "conflicting-batch" }), /migration_target_collision/);
  assert.equal((await db.select().from(contentEntries)).length, 3, "earlier inserts roll back with the collision");
  assert.equal((await db.select().from(contentRevisions)).length, 3);
  await db.update(contentEntries).set({ title: "Изменено вручную" }).where(eq(contentEntries.id, entries[0].id));
  const verification = await verifyContentMigration({ fixtureRoot, db, batchId: "fixture-1" });
  assert.equal(verification.ok, false);
  assert.ok(verification.mismatches.length > 0);
  assert.equal((await db.select().from(siteSettings)).length, 1);
});
