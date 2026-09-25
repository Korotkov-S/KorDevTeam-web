import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { contentEntries, contentRevisions } from "../db/schema";
import { BLOG_CATEGORY_SLUGS, type BlogCategorySlug } from "../../lib/blogCategories";
import { parseBlogDate } from "../../lib/blogPresentation.mjs";
import { checksum } from "./migration";
import type { ContentDatabase, ContentTransaction } from "./repository";
import { parseContentCommand, validatePublication } from "./types";

export type ArticleSource = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  seoTitle: string;
  seoDescription: string;
  publishedAt: Date;
  updatedAt: Date;
  payload: {
    h1: string;
    author: string;
    tags: string[];
    coverUrl: string;
    imageUrls: string[];
    readTime: string;
    category: BlogCategorySlug;
    relatedArticleSlugs: string[];
  };
};

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonempty = z.string().trim().min(1);
const articleCatalogItem = z.object({
  slug,
  lang: z.string().optional(),
  category: z.enum(BLOG_CATEGORY_SLUGS),
  relatedArticleSlugs: z.array(slug).length(3),
}).passthrough();
const articleMetadata = articleCatalogItem.extend({
  title: nonempty,
  excerpt: nonempty,
  seoTitle: nonempty.max(180),
  seoDescription: nonempty.max(320),
  readTime: nonempty,
  tags: z.array(nonempty).min(1),
  date: nonempty,
  updatedDate: nonempty,
  coverUrl: z.string().default(""),
  imageUrls: z.array(z.string()).default([]),
}).passthrough();

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) throw new Error(code);
}

function articleCommand(source: ArticleSource) {
  return parseContentCommand({
    kind: "article",
    slug: source.slug,
    title: source.title,
    excerpt: source.excerpt,
    bodyMd: source.bodyMd,
    seoTitle: source.seoTitle,
    seoDescription: source.seoDescription,
    payload: source.payload,
  });
}

async function readMetadata(root: string): Promise<z.output<typeof articleCatalogItem>[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
    const parsed = z.array(articleCatalogItem).safeParse(raw);
    if (!parsed.success) throw parsed.error;
    const russian = parsed.data.filter(item => item.lang === undefined || item.lang === "ru");
    assertUnique(russian.map(item => item.slug), "article_source_duplicate_slug");
    const catalogSlugs = new Set(russian.map(item => item.slug));
    for (const item of russian) {
      const related = item.relatedArticleSlugs;
      if (
        related.includes(item.slug)
        || new Set(related).size !== related.length
        || related.some(target => !catalogSlugs.has(target))
      ) throw new Error("article_source_invalid");
    }
    for (const category of BLOG_CATEGORY_SLUGS) {
      if (!russian.some(item => item.category === category)) throw new Error("article_source_invalid");
    }
    return russian;
  } catch (error) {
    if (error instanceof Error && error.message === "article_source_duplicate_slug") throw error;
    throw new Error("article_source_invalid", { cause: error });
  }
}

async function readMarkdown(root: string, articleSlug: string): Promise<string> {
  try {
    return (await readFile(path.join(root, "public", "blog", `${articleSlug}.md`), "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("article_source_markdown_missing", { cause: error });
    }
    throw new Error("article_source_invalid", { cause: error });
  }
}

export async function loadArticleSources(
  slugs: readonly string[],
  root = process.cwd(),
): Promise<ArticleSource[]> {
  if (!z.array(slug).min(1).safeParse(slugs).success) throw new Error("article_source_invalid");
  assertUnique(slugs, "article_source_invalid");
  const metadata = await readMetadata(root);
  const metadataBySlug = new Map(metadata.map(item => [item.slug, item]));

  return Promise.all(slugs.map(async articleSlug => {
    const catalogItem = metadataBySlug.get(articleSlug);
    if (!catalogItem) throw new Error("article_source_unknown_slug");
    const parsedItem = articleMetadata.safeParse(catalogItem);
    if (!parsedItem.success) throw new Error("article_source_invalid", { cause: parsedItem.error });
    const item = parsedItem.data;
    const publishedTimestamp = parseBlogDate(item.date);
    const updatedTimestamp = parseBlogDate(item.updatedDate);
    if (publishedTimestamp === null || updatedTimestamp === null) throw new Error("article_source_invalid");
    const bodyMd = await readMarkdown(root, articleSlug);
    const h1 = bodyMd.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!h1 || h1 !== item.title) throw new Error("article_source_invalid");
    const source: ArticleSource = {
      slug: item.slug,
      title: item.title,
      excerpt: item.excerpt,
      bodyMd,
      seoTitle: item.seoTitle,
      seoDescription: item.seoDescription,
      publishedAt: new Date(publishedTimestamp),
      updatedAt: new Date(updatedTimestamp),
      payload: {
        h1,
        author: "Геннадий Коротков",
        tags: item.tags,
        coverUrl: item.coverUrl,
        imageUrls: item.imageUrls,
        readTime: item.readTime,
        category: item.category,
        relatedArticleSlugs: item.relatedArticleSlugs,
      },
    };
    const command = articleCommand(source);
    validatePublication(command as typeof contentEntries.$inferSelect);
    return source;
  }));
}

export async function loadAllArticleSources(root = process.cwd()): Promise<ArticleSource[]> {
  const metadata = await readMetadata(root);
  return loadArticleSources(metadata.map(item => item.slug), root);
}

export async function applyArticleSourcesInTransaction(
  tx: ContentTransaction,
  sources: readonly ArticleSource[],
  options: { insertMissing: boolean } = { insertMissing: false },
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  const commands = sources.map(articleCommand);
  for (const command of commands) validatePublication(command as typeof contentEntries.$inferSelect);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [index, command] of commands.entries()) {
    const source = sources[index];
    const [existing] = await tx.select().from(contentEntries).where(and(
      eq(contentEntries.kind, "article"),
      eq(contentEntries.slug, command.slug),
    )).for("update");

    const fields = {
      title: command.title,
      excerpt: command.excerpt,
      bodyMd: command.bodyMd,
      seoTitle: command.seoTitle,
      seoDescription: command.seoDescription,
      payload: command.payload,
    };
    if (!existing) {
      if (!options.insertMissing) throw new Error("article_source_target_missing");
      const [draft] = await tx.insert(contentEntries).values({
        kind: "article",
        slug: command.slug,
        ...fields,
        status: "draft",
        version: 1,
        createdAt: source.publishedAt,
        updatedAt: source.updatedAt,
        publishedAt: null,
      }).returning();
      await tx.insert(contentRevisions).values({
        entryId: draft.id,
        version: 1,
        snapshot: { entry: draft },
      });
      const [published] = await tx.update(contentEntries).set({
        status: "published",
        version: 2,
        publishedAt: source.publishedAt,
        updatedAt: source.updatedAt,
      }).where(and(
        eq(contentEntries.id, draft.id),
        eq(contentEntries.version, 1),
      )).returning();
      if (!published) throw new Error("article_source_version_conflict");
      inserted++;
      continue;
    }

    const current = {
      title: existing.title,
      excerpt: existing.excerpt,
      bodyMd: existing.bodyMd,
      seoTitle: existing.seoTitle,
      seoDescription: existing.seoDescription,
      payload: existing.payload,
    };
    if (checksum(current) === checksum(fields)) {
      unchanged++;
      continue;
    }

    await tx.insert(contentRevisions).values({
      entryId: existing.id,
      version: existing.version,
      snapshot: { entry: existing },
    }).onConflictDoNothing();
    const [changed] = await tx.update(contentEntries).set({
      ...fields,
      version: existing.version + 1,
      updatedAt: new Date(),
    }).where(and(
      eq(contentEntries.id, existing.id),
      eq(contentEntries.version, existing.version),
    )).returning();
    if (!changed) throw new Error("article_source_version_conflict");
    updated++;
  }

  return { inserted, updated, unchanged };
}

export async function applyArticleSources(
  db: ContentDatabase,
  sources: readonly ArticleSource[],
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(706007)`);
    return applyArticleSourcesInTransaction(tx, sources);
  });
}
