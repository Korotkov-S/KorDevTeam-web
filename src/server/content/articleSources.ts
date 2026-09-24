import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { createDb } from "../db/client";
import { contentEntries, contentRevisions } from "../db/schema";
import { checksum } from "./migration";
import { parseContentCommand, validatePublication } from "./types";

export type ArticleSource = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  seoTitle: string;
  seoDescription: string;
  payload: {
    h1: string;
    author: string;
    tags: string[];
    coverUrl: string;
    imageUrls: string[];
    readTime: string;
  };
};

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonempty = z.string().trim().min(1);
const articleMetadata = z.object({
  slug,
  lang: z.string().optional(),
  title: nonempty,
  excerpt: nonempty,
  seoTitle: nonempty.max(180),
  seoDescription: nonempty.max(320),
  readTime: nonempty,
  tags: z.array(nonempty).min(1),
  coverUrl: z.string().default(""),
  imageUrls: z.array(z.string()).default([]),
}).passthrough();
const articleCatalogItem = z.object({
  slug,
  lang: z.string().optional(),
}).passthrough();

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) throw new Error(code);
}

async function readMetadata(root: string): Promise<z.output<typeof articleCatalogItem>[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(root, "public", "content", "blog.ru.json"), "utf8"));
    const parsed = z.array(articleCatalogItem).safeParse(raw);
    if (!parsed.success) throw parsed.error;
    const russian = parsed.data.filter(item => item.lang === undefined || item.lang === "ru");
    assertUnique(russian.map(item => item.slug), "article_source_duplicate_slug");
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
      payload: {
        h1,
        author: "Геннадий Коротков",
        tags: item.tags,
        coverUrl: item.coverUrl,
        imageUrls: item.imageUrls,
        readTime: item.readTime,
      },
    };
    const command = parseContentCommand({ kind: "article", ...source });
    validatePublication(command as typeof contentEntries.$inferSelect);
    return source;
  }));
}

export async function applyArticleSources(
  db: ReturnType<typeof createDb>,
  sources: readonly ArticleSource[],
): Promise<{ updated: number; unchanged: number }> {
  const commands = sources.map(source => parseContentCommand({ kind: "article", ...source }));
  for (const command of commands) validatePublication(command as typeof contentEntries.$inferSelect);

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(706007)`);
    let updated = 0;
    let unchanged = 0;

    for (const command of commands) {
      const [existing] = await tx.select().from(contentEntries).where(and(
        eq(contentEntries.kind, "article"),
        eq(contentEntries.slug, command.slug),
      )).for("update");
      if (!existing) throw new Error("article_source_target_missing");

      const fields = {
        title: command.title,
        excerpt: command.excerpt,
        bodyMd: command.bodyMd,
        seoTitle: command.seoTitle,
        seoDescription: command.seoDescription,
        payload: command.payload,
      };
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

    return { updated, unchanged };
  });
}
