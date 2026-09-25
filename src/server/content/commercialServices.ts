import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { contentEntries, contentRelations, contentRevisions } from "../db/schema";
import { checksum } from "./migration";
import type { ContentDatabase, ContentTransaction } from "./repository";
import { parseContentCommand, validatePublication } from "./types";

export type CommercialServiceSource = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  seoTitle: string;
  seoDescription: string;
  payload: Record<string, unknown>;
  relatedCases: string[];
  relatedArticles: string[];
  faq: Array<{ slug: string; question: string; answer: string }>;
};

const faqSource = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

const commercialServiceSource = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  bodyMd: z.string().trim().min(300),
  seoTitle: z.string().trim().min(1).max(180),
  seoDescription: z.string().trim().min(1).max(320),
  payload: z.record(z.string(), z.unknown()),
  relatedCases: z.array(z.string()).min(2),
  relatedArticles: z.array(z.string()).min(1),
  faq: z.array(faqSource).min(3),
});

const catalogSchema = z.array(commercialServiceSource).min(1);

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) throw new Error(code);
}

export async function loadCommercialServiceSources(
  filename = path.resolve(process.cwd(), "content/services.ru.json"),
): Promise<CommercialServiceSource[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error("commercial_service_source_invalid", { cause: error });
  }
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) throw new Error("commercial_service_source_invalid", { cause: parsed.error });
  assertUnique(parsed.data.map(source => source.slug), "commercial_service_duplicate_slug");
  assertUnique(parsed.data.flatMap(source => source.faq.map(item => item.slug)), "commercial_service_duplicate_faq_slug");
  for (const source of parsed.data) {
    const command = parseContentCommand({
      kind: "service",
      slug: source.slug,
      title: source.title,
      excerpt: source.excerpt,
      bodyMd: source.bodyMd,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      payload: source.payload,
    });
    validatePublication(command as typeof contentEntries.$inferSelect);
  }
  return parsed.data;
}

export async function applyCommercialServiceSources(
  db: ContentDatabase,
  sources: readonly CommercialServiceSource[],
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(706006)`);
    return applyCommercialServiceSourcesInTransaction(tx, sources);
  });
}

export async function applyCommercialServiceSourcesInTransaction(
  tx: ContentTransaction,
  sources: readonly CommercialServiceSource[],
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  const serviceCommands = sources.map(source => parseContentCommand({
    kind: "service",
    slug: source.slug,
    title: source.title,
    excerpt: source.excerpt,
    bodyMd: source.bodyMd,
    seoTitle: source.seoTitle,
    seoDescription: source.seoDescription,
    payload: source.payload,
  }));
  const faqCommands = sources.flatMap(source => source.faq.map(item => parseContentCommand({
    kind: "faq",
    slug: item.slug,
    title: item.question,
    excerpt: item.answer,
    seoTitle: item.question,
    seoDescription: item.answer.slice(0, 320),
    payload: { h1: item.question, question: item.question, answer: item.answer },
  })));
  for (const command of serviceCommands) validatePublication(command as typeof contentEntries.$inferSelect);
  for (const command of faqCommands) validatePublication(command as typeof contentEntries.$inferSelect);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const entryIds = new Map<string, string>();
  const upsert = async (command: (typeof serviceCommands)[number] | (typeof faqCommands)[number]) => {
      const [existing] = await tx.select().from(contentEntries).where(and(
        eq(contentEntries.kind, command.kind),
        eq(contentEntries.slug, command.slug),
      )).for("update");
      const fields = {
        title: command.title,
        excerpt: command.excerpt,
        bodyMd: command.bodyMd,
        seoTitle: command.seoTitle,
        seoDescription: command.seoDescription,
        indexable: command.indexable,
        ogMediaId: command.ogMediaId,
        payload: command.payload,
      };
      if (!existing) {
        const [created] = await tx.insert(contentEntries).values({
          kind: command.kind,
          slug: command.slug,
          ...fields,
          status: "published",
          publishedAt: new Date(),
        }).returning();
        inserted++;
        entryIds.set(`${command.kind}:${command.slug}`, created.id);
        return created;
      }
      const current = {
        title: existing.title,
        excerpt: existing.excerpt,
        bodyMd: existing.bodyMd,
        seoTitle: existing.seoTitle,
        seoDescription: existing.seoDescription,
        indexable: existing.indexable,
        ogMediaId: existing.ogMediaId,
        payload: existing.payload,
      };
      if (existing.status === "published" && checksum(current) === checksum(fields)) {
        unchanged++;
        entryIds.set(`${command.kind}:${command.slug}`, existing.id);
        return existing;
      }
      await tx.insert(contentRevisions).values({
        entryId: existing.id,
        version: existing.version,
        snapshot: { entry: existing },
      }).onConflictDoNothing();
      const [changed] = await tx.update(contentEntries).set({
        ...fields,
        status: "published",
        publishedAt: existing.publishedAt ?? new Date(),
        version: existing.version + 1,
        updatedAt: new Date(),
      }).where(and(eq(contentEntries.id, existing.id), eq(contentEntries.version, existing.version))).returning();
      if (!changed) throw new Error("commercial_service_version_conflict");
      updated++;
      entryIds.set(`${command.kind}:${command.slug}`, changed.id);
      return changed;
  };

  for (const command of serviceCommands) await upsert(command);
  for (const command of faqCommands) await upsert(command);

    const requestedTargets = [...new Set(sources.flatMap(source => [
      ...source.relatedCases.map(slug => `case:${slug}`),
      ...source.relatedArticles.map(slug => `article:${slug}`),
    ]))];
    const targetSlugs = requestedTargets.map(value => value.slice(value.indexOf(":") + 1));
    const targets = targetSlugs.length
      ? await tx.select().from(contentEntries).where(and(
        inArray(contentEntries.slug, targetSlugs),
        eq(contentEntries.status, "published"),
      ))
      : [];
    for (const target of targets) entryIds.set(`${target.kind}:${target.slug}`, target.id);
    for (const key of requestedTargets) if (!entryIds.has(key)) throw new Error(`commercial_service_relation_target_missing:${key}`);

    for (const source of sources) {
      const sourceId = entryIds.get(`service:${source.slug}`)!;
      await tx.delete(contentRelations).where(and(
        eq(contentRelations.sourceId, sourceId),
        inArray(contentRelations.type, ["related_case", "related_article", "related_faq"]),
      ));
      const relations = [
        ...source.relatedCases.map((slug, sortOrder) => ({ sourceId, targetId: entryIds.get(`case:${slug}`)!, type: "related_case" as const, sortOrder })),
        ...source.relatedArticles.map((slug, sortOrder) => ({ sourceId, targetId: entryIds.get(`article:${slug}`)!, type: "related_article" as const, sortOrder })),
        ...source.faq.map((item, sortOrder) => ({ sourceId, targetId: entryIds.get(`faq:${item.slug}`)!, type: "related_faq" as const, sortOrder })),
      ];
      if (relations.length) await tx.insert(contentRelations).values(relations);
    }
  return { inserted, updated, unchanged };
}
