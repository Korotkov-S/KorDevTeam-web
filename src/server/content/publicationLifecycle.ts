import { sql } from "drizzle-orm";
import type { createDb } from "../db/client";
import { seoChanges, seoQueries } from "../db/schema";
import { entryPath } from "../seo/sitemaps";
import { normalizeSeoQuery } from "../seo-monitoring/normalization";
import type { ContentEntry } from "./types";

type Database = ReturnType<typeof createDb>;
export type ContentWriteTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Transition = { before?: ContentEntry; after?: ContentEntry; actorId?: string; actorMcpTokenId?: string; linksChanged?: boolean; mediaChanged?: boolean };

export function referencesDiffer(before: object[], after: object[]): boolean {
  const normalized = (rows: object[]) => rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).sort();
  return JSON.stringify(normalized(before)) !== JSON.stringify(normalized(after));
}

function publicPath(entry: ContentEntry | undefined): string | null {
  return entry?.status === "published" && ["article", "case", "service"].includes(entry.kind) ? entryPath(entry) : null;
}

export async function recordPublicationTransition(tx: ContentWriteTransaction, input: Transition): Promise<Array<typeof seoChanges.$inferSelect>> {
  const { before, after, actorId, linksChanged, mediaChanged } = input;
  const oldPath = publicPath(before), newPath = publicPath(after);
  const events: Array<typeof seoChanges.$inferSelect> = [];
  if (!oldPath && !newPath) return events;
  const appliedAt = new Date();
  const identity = { contentEntryId: (after ?? before)!.id, contentVersion: (after ?? before)!.version, actorAdminUserId: actorId ?? null, actorMcpTokenId: input.actorMcpTokenId ?? null, appliedAt };
  if (oldPath && oldPath !== newPath) {
    events.push(...await tx.insert(seoChanges).values({ ...identity, pagePath: oldPath, type: "technical", summary: `Published URL withdrawn at version ${identity.contentVersion}${after ? "" : " by deletion"}.` }).returning());
  }
  if (!newPath || !after) return events;
  const changed = (keys: Array<keyof ContentEntry>) => before && keys.some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const types: Array<typeof seoChanges.$inferInsert.type> = [];
  if (oldPath && (oldPath !== newPath || changed(["indexable", "manualCanonicalPath"]))) types.push("technical");
  if (!oldPath || changed(["title", "excerpt", "bodyMd", "payload"])) types.push("content");
  if (changed(["seoTitle", "seoDescription"])) types.push("metadata");
  if (mediaChanged || changed(["ogMediaId"])) types.push("structure");
  if (linksChanged) types.push("interlinking");
  events.push(...await tx.insert(seoChanges).values({ ...identity, pagePath: newPath, type: types[0] ?? "other",
    summary: `${oldPath ? "Republished" : "Published"} version ${after.version}${types.length ? `; changed: ${types.join(", ")}` : "; unchanged public fields"}.` }).returning());

  const phrase = after.kind === "article" && after.indexable ? after.payload.primarySeoQuery : undefined;
  if (typeof phrase !== "string") return events;
  const queryText = phrase.trim().replace(/\s+/gu, " ");
  if (!queryText || new TextEncoder().encode(phrase).length > 500) throw new Error("content_validation_error");
  const normalizedQuery = normalizeSeoQuery(queryText);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'seo-query:' + normalizedQuery}))`);
  await tx.insert(seoQueries).values({ queryText, normalizedQuery, targetPath: newPath, origin: "manual", status: "candidate", tracked: false,
    wordstatFrequency: null, frequencyBand: "unclassified", kind: "other", priority: 0 }).onConflictDoNothing({ target: seoQueries.normalizedQuery });
  return events;
}
