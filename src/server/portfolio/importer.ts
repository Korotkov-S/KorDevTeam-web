import { createHash } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { ContentDatabase } from "../content/repository";
import type { ContentEntry, ValidatedContentCommand } from "../content/types";
import { contentEntries, contentMediaRefs, contentRelations, contentRevisions } from "../db/schema";
import { toPortfolioCommand, validatePortfolioSources } from "./loader";
import type { PortfolioCaseSource } from "./schema";

export type PortfolioImportItem = {
  action: "insert" | "update" | "unchanged";
  command: ValidatedContentCommand;
  existingId: string | null;
  expectedVersion: number | null;
  legacySlugs: string[];
};

export type PortfolioImportResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  published: number;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function portfolioCommandChecksum(command: ValidatedContentCommand): string {
  return createHash("sha256").update(JSON.stringify(canonical(command))).digest("hex");
}

function commandFields(command: ValidatedContentCommand) {
  const { id: _id, expectedVersion: _expectedVersion, ...fields } = command;
  return fields;
}

function entryCommand(entry: ContentEntry): ValidatedContentCommand {
  return toPortfolioCommand({
    schemaVersion: 1,
    slug: entry.slug,
    legacySlugs: [],
    title: entry.title,
    excerpt: entry.excerpt,
    bodyMd: entry.bodyMd,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    indexable: entry.indexable,
    categories: ["web-service"],
    payload: entry.payload,
    evidence: [{ kind: "repository", locator: "postgres", supports: ["scope"] }],
  });
}

function matchesCommand(entry: ContentEntry, command: ValidatedContentCommand): boolean {
  return portfolioCommandChecksum(entryCommand(entry)) === portfolioCommandChecksum(command);
}

export function assertPortfolioDatabaseAllowed(
  databaseUrl: string,
  options: { cliProduction: boolean; envProduction: boolean },
): void {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("portfolio_database_url_invalid");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("portfolio_database_url_invalid");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(url.hostname) && !(options.cliProduction && options.envProduction)) {
    throw new Error("portfolio_remote_database_forbidden");
  }
}

export async function planPortfolioImport(
  db: ContentDatabase,
  records: readonly PortfolioCaseSource[],
): Promise<PortfolioImportItem[]> {
  const validated = validatePortfolioSources(records);
  const existing = await db.select().from(contentEntries).where(eq(contentEntries.kind, "case"));
  const claimedIds = new Set<string>();
  return validated.map(record => {
    const command = toPortfolioCommand(record);
    const canonicalEntry = existing.find(entry => entry.slug === record.slug);
    const legacyEntries = existing.filter(entry => record.legacySlugs.includes(entry.slug));
    if ((canonicalEntry && legacyEntries.length) || legacyEntries.length > 1) {
      throw new Error("portfolio_slug_collision");
    }
    const current = canonicalEntry ?? legacyEntries[0] ?? null;
    if (current && claimedIds.has(current.id)) throw new Error("portfolio_slug_collision");
    if (current) claimedIds.add(current.id);
    const unchanged = current !== null
      && current.slug === command.slug
      && current.status === "published"
      && matchesCommand(current, command);
    return {
      action: current ? (unchanged ? "unchanged" : "update") : "insert",
      command,
      existingId: current?.id ?? null,
      expectedVersion: current?.version ?? null,
      legacySlugs: [...record.legacySlugs],
    };
  });
}

export async function applyPortfolioImport(
  db: ContentDatabase,
  plan: readonly PortfolioImportItem[],
): Promise<PortfolioImportResult> {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(706026)`);
    const result: PortfolioImportResult = { inserted: 0, updated: 0, unchanged: 0, published: 0 };
    for (const item of plan) {
      const candidateSlugs = [...new Set([item.command.slug, ...item.legacySlugs])];
      const candidates = await tx.select().from(contentEntries).where(and(
        eq(contentEntries.kind, "case"),
        inArray(contentEntries.slug, candidateSlugs),
      )).for("update");
      if (candidates.length > 1) throw new Error("portfolio_slug_collision");

      if (item.action === "insert") {
        if (candidates.length) throw new Error("portfolio_version_conflict");
        const fields = commandFields(item.command);
        await tx.insert(contentEntries).values({
          ...fields,
          status: "published",
          version: 1,
          publishedAt: new Date(),
        });
        result.inserted++;
        result.published++;
        continue;
      }

      const current = candidates[0];
      if (!current || current.id !== item.existingId || current.version !== item.expectedVersion) {
        throw new Error("portfolio_version_conflict");
      }
      if (item.action === "unchanged") {
        if (current.slug !== item.command.slug || current.status !== "published" || !matchesCommand(current, item.command)) {
          throw new Error("portfolio_version_conflict");
        }
        result.unchanged++;
        continue;
      }

      const relations = await tx.select({
        targetId: contentRelations.targetId,
        type: contentRelations.type,
        sortOrder: contentRelations.sortOrder,
      }).from(contentRelations).where(eq(contentRelations.sourceId, current.id));
      const mediaRefs = await tx.select({
        mediaId: contentMediaRefs.mediaId,
        fieldPath: contentMediaRefs.fieldPath,
      }).from(contentMediaRefs).where(eq(contentMediaRefs.entryId, current.id));
      await tx.insert(contentRevisions).values({
        entryId: current.id,
        version: current.version,
        snapshot: { entry: current, relations, mediaRefs },
      });
      const fields = commandFields(item.command);
      const [updated] = await tx.update(contentEntries).set({
        ...fields,
        status: "published",
        version: current.version + 1,
        publishedAt: current.publishedAt ?? new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(contentEntries.id, current.id),
        eq(contentEntries.version, item.expectedVersion!),
      )).returning({ id: contentEntries.id });
      if (!updated) throw new Error("portfolio_version_conflict");
      result.updated++;
      if (current.status !== "published") result.published++;
    }
    return result;
  });
}
