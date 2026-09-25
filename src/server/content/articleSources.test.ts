import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import {
  contentEntries,
  contentMediaRefs,
  contentRelations,
  contentRevisions,
  mediaAssets,
} from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { applyArticleSources, loadArticleSources, type ArticleSource } from "./articleSources";

type Metadata = Record<string, unknown>;

const taxonomySeeds: Metadata[] = [
  {
    slug: "related-one",
    lang: "ru",
    category: "crm-sales",
    relatedArticleSlugs: ["process-description", "related-two", "related-three"],
  },
  {
    slug: "related-two",
    lang: "ru",
    category: "digital-products",
    relatedArticleSlugs: ["process-description", "related-one", "related-three"],
  },
  {
    slug: "related-three",
    lang: "ru",
    category: "technical-support",
    relatedArticleSlugs: ["process-description", "related-one", "related-two"],
  },
  {
    slug: "ai-seed",
    lang: "ru",
    category: "ai-for-business",
    relatedArticleSlugs: ["process-description", "related-one", "related-two"],
  },
  {
    slug: "project-seed",
    lang: "ru",
    category: "it-project-management",
    relatedArticleSlugs: ["process-description", "related-one", "related-two"],
  },
];

async function articleFixture(
  metadata: Metadata[],
  markdown?: string,
  options: { completeTaxonomy?: boolean } = {},
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "kordev-article-source-"));
  await mkdir(path.join(root, "public", "content"), { recursive: true });
  await mkdir(path.join(root, "public", "blog"), { recursive: true });
  const slugs = new Set(metadata.map(item => item.slug));
  const completedMetadata = options.completeTaxonomy === false
    ? metadata
    : [...metadata, ...taxonomySeeds.filter(item => !slugs.has(item.slug))];
  await writeFile(path.join(root, "public", "content", "blog.ru.json"), JSON.stringify(completedMetadata), "utf8");
  if (markdown !== undefined && typeof metadata[0]?.slug === "string") {
    await writeFile(path.join(root, "public", "blog", `${metadata[0].slug}.md`), markdown, "utf8");
  }
  return root;
}

const validMetadata = {
  slug: "process-description",
  lang: "ru",
  title: "Описание бизнес-процессов",
  seoTitle: "Описание бизнес-процессов перед автоматизацией",
  seoDescription: "Пошагово описываем процесс AS IS и готовим требования к автоматизации.",
  excerpt: "Практическая инструкция для владельца процесса.",
  date: "9 июля 2026",
  updatedDate: "24 сентября 2026",
  readTime: "9 мин",
  tags: ["Бизнес-процессы"],
  coverUrl: "/cover.webp",
  imageUrls: ["/cover.webp"],
  category: "business-automation",
  relatedArticleSlugs: ["related-one", "related-two", "related-three"],
};

test("article source loader combines curated metadata with the matching markdown body", async t => {
  const root = await articleFixture(
    [validMetadata],
    "# Описание бизнес-процессов\n\nПолный практический текст статьи.",
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const [source] = await loadArticleSources(["process-description"], root);

  assert.equal(source.slug, "process-description");
  assert.equal(source.title, "Описание бизнес-процессов");
  assert.equal(source.bodyMd, "# Описание бизнес-процессов\n\nПолный практический текст статьи.");
  assert.equal(source.seoDescription, validMetadata.seoDescription);
  assert.equal(source.payload.h1, "Описание бизнес-процессов");
  assert.equal(source.payload.author, "Геннадий Коротков");
  assert.deepEqual(source.payload.tags, ["Бизнес-процессы"]);
  assert.equal(source.payload.coverUrl, "/cover.webp");
  assert.equal(source.payload.category, "business-automation");
  assert.deepEqual(source.payload.relatedArticleSlugs, ["related-one", "related-two", "related-three"]);
});

test("article source loader validates full fields only for requested legacy-catalog records", async t => {
  const root = await articleFixture(
    [validMetadata, {
      slug: "unrelated-legacy-article",
      lang: "ru",
      title: "Старая статья",
      excerpt: "Старое описание без отдельного SEO-поля.",
      seoTitle: "Старая статья",
      readTime: "3 мин",
      tags: [],
      category: "crm-sales",
      relatedArticleSlugs: ["process-description", "related-two", "related-three"],
    }],
    "# Описание бизнес-процессов\n\nПолный практический текст статьи.",
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const [source] = await loadArticleSources(["process-description"], root);

  assert.equal(source.slug, "process-description");
  assert.equal(source.seoDescription, validMetadata.seoDescription);
});

test("article source loader rejects an unknown requested slug", async t => {
  const root = await articleFixture(
    [validMetadata],
    "# Описание бизнес-процессов\n\nПолный практический текст статьи.",
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(loadArticleSources(["missing-article"], root), /article_source_unknown_slug/);
});

test("article source loader rejects duplicate metadata slugs", async t => {
  const root = await articleFixture(
    [validMetadata, validMetadata],
    "# Описание бизнес-процессов\n\nПолный практический текст статьи.",
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(loadArticleSources(["process-description"], root), /article_source_duplicate_slug/);
});

test("article source loader rejects a missing markdown file", async t => {
  const root = await articleFixture([validMetadata]);
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(loadArticleSources(["process-description"], root), /article_source_markdown_missing/);
});

test("article source loader rejects metadata that disagrees with the markdown H1", async t => {
  const root = await articleFixture(
    [validMetadata],
    "# Другой заголовок\n\nПолный практический текст статьи.",
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(loadArticleSources(["process-description"], root), /article_source_invalid/);
});

for (const [name, taxonomy] of Object.entries({
  "unknown category": { category: "unknown", relatedArticleSlugs: ["related-one", "related-two", "related-three"] },
  "self relation": { category: "business-automation", relatedArticleSlugs: ["process-description", "related-two", "related-three"] },
  "duplicate relation": { category: "business-automation", relatedArticleSlugs: ["related-one", "related-one", "related-three"] },
  "missing relation target": { category: "business-automation", relatedArticleSlugs: ["related-one", "missing", "related-three"] },
})) {
  test(`article source loader rejects ${name}`, async t => {
    const root = await articleFixture(
      [{ ...validMetadata, ...taxonomy }],
      "# Описание бизнес-процессов\n\nПолный практический текст статьи.",
    );
    t.after(() => rm(root, { recursive: true, force: true }));

    await assert.rejects(loadArticleSources(["process-description"], root), /article_source_invalid/);
  });
}

test("article source loader rejects a catalog that leaves an approved category empty", async t => {
  const root = await articleFixture(
    [validMetadata, ...taxonomySeeds.filter(item => item.category !== "ai-for-business")],
    "# Описание бизнес-процессов\n\nПолный практический текст статьи.",
    { completeTaxonomy: false },
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(loadArticleSources(["process-description"], root), /article_source_invalid/);
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const updatedSource: ArticleSource = {
  slug: "process-description",
  title: "Описание бизнес-процессов",
  excerpt: "Практическая инструкция для владельца процесса.",
  bodyMd: "# Описание бизнес-процессов\n\nНовый полный практический текст статьи.",
  seoTitle: "Описание бизнес-процессов перед автоматизацией",
  seoDescription: "Пошагово описываем процесс AS IS и готовим требования к автоматизации.",
  payload: {
    h1: "Описание бизнес-процессов",
    author: "Геннадий Коротков",
    tags: ["Бизнес-процессы"],
    coverUrl: "/cover.webp",
    imageUrls: ["/cover.webp"],
    readTime: "9 мин",
    category: "business-automation",
    relatedArticleSlugs: ["related-one", "related-two", "related-three"],
  },
};

test("article sync updates only the requested article while preserving publication history and references", { skip: !databaseUrl }, async () => {
  await resetTestDatabase(databaseUrl!);
  const db = createDb(databaseUrl!);
  const publishedAt = new Date("2026-07-09T09:00:00.000Z");
  const [before] = await db.insert(contentEntries).values({
    kind: "article",
    slug: updatedSource.slug,
    status: "published",
    title: "Старый заголовок",
    excerpt: "Старое описание",
    bodyMd: "# Старый заголовок\n\nСтарый текст.",
    seoTitle: "Старый SEO-заголовок",
    seoDescription: "Старое SEO-описание",
    payload: { h1: "Старый заголовок", tags: ["Старый тег"] },
    publishedAt,
  }).returning();
  const [untouched] = await db.insert(contentEntries).values({
    kind: "article",
    slug: "other-article",
    status: "published",
    title: "Не менять",
    excerpt: "Другой материал",
    bodyMd: "# Не менять\n\nДругой текст.",
    seoTitle: "Не менять",
    seoDescription: "Другой материал",
    payload: { h1: "Не менять" },
    publishedAt,
  }).returning();
  const [related] = await db.insert(contentEntries).values({
    kind: "case",
    slug: "related-case",
    status: "published",
    title: "Связанный кейс",
    excerpt: "Описание кейса",
    bodyMd: "Описание кейса",
    seoTitle: "Связанный кейс",
    seoDescription: "Описание кейса",
    payload: { h1: "Связанный кейс" },
    publishedAt,
  }).returning();
  await db.insert(contentRelations).values({ sourceId: before.id, targetId: related.id, type: "related_case", sortOrder: 0 });
  const [media] = await db.insert(mediaAssets).values({
    objectKey: "articles/process-description/cover.webp",
    visibility: "public",
    mimeType: "image/webp",
    byteSize: 1200,
    checksum: "article-source-cover",
    width: 1200,
    height: 630,
    altText: "Схема процесса",
  }).returning();
  await db.insert(contentMediaRefs).values({ entryId: before.id, mediaId: media.id, fieldPath: "payload.coverUrl" });

  assert.deepEqual(await applyArticleSources(db, [updatedSource]), { updated: 1, unchanged: 0 });

  const [changed] = await db.select().from(contentEntries).where(eq(contentEntries.id, before.id));
  const [otherAfter] = await db.select().from(contentEntries).where(eq(contentEntries.id, untouched.id));
  assert.equal(changed.title, updatedSource.title);
  assert.equal(changed.bodyMd, updatedSource.bodyMd);
  assert.equal(changed.publishedAt?.toISOString(), publishedAt.toISOString());
  assert.equal(changed.version, before.version + 1);
  assert.equal(otherAfter.title, untouched.title);
  assert.equal((await db.select().from(contentRelations).where(eq(contentRelations.sourceId, before.id))).length, 1);
  assert.equal((await db.select().from(contentMediaRefs).where(eq(contentMediaRefs.entryId, before.id))).length, 1);
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, before.id))).length, 1);

  assert.deepEqual(await applyArticleSources(db, [updatedSource]), { updated: 0, unchanged: 1 });
  assert.equal((await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, before.id))).length, 1);
});

test("article sync rejects a source whose published target is missing", { skip: !databaseUrl }, async () => {
  await resetTestDatabase(databaseUrl!);
  const db = createDb(databaseUrl!);

  await assert.rejects(applyArticleSources(db, [updatedSource]), /article_source_target_missing/);
  assert.equal((await db.select().from(contentEntries)).length, 0);
});
