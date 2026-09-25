import { and, eq, inArray } from "drizzle-orm";

import { checksum } from "../content/migration";
import type { ContentTransaction } from "../content/repository";
import type { ContentEntry } from "../content/types";
import { contentEntries, contentRelations } from "../db/schema";
import type { ContentReleaseItem, ContentReleaseRelation } from "./types";

const managedRelationTypes: ContentReleaseRelation["type"][] = [
  "related_case",
  "related_article",
  "related_faq",
];

function relationOrder(left: ContentReleaseRelation, right: ContentReleaseRelation): number {
  return left.type.localeCompare(right.type, "en")
    || left.sortOrder - right.sortOrder
    || left.targetKey.localeCompare(right.targetKey, "en");
}

function managedEntryState(
  entry: Pick<ContentEntry,
    | "kind"
    | "slug"
    | "status"
    | "title"
    | "excerpt"
    | "bodyMd"
    | "seoTitle"
    | "seoDescription"
    | "indexable"
    | "ogMediaId"
    | "payload"
  >,
  relations: readonly ContentReleaseRelation[],
) {
  return {
    kind: entry.kind,
    slug: entry.slug,
    status: entry.status,
    title: entry.title,
    excerpt: entry.excerpt,
    bodyMd: entry.bodyMd,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    indexable: entry.indexable,
    ogMediaId: entry.ogMediaId,
    payload: entry.payload,
    relations,
  };
}

export function desiredDatabaseItemChecksum(item: ContentReleaseItem): string {
  return checksum(managedEntryState({
    kind: item.kind,
    slug: item.slug,
    status: "published",
    title: item.command.title,
    excerpt: item.command.excerpt,
    bodyMd: item.command.bodyMd,
    seoTitle: item.command.seoTitle,
    seoDescription: item.command.seoDescription,
    indexable: item.command.indexable,
    ogMediaId: item.command.ogMediaId,
    payload: item.command.payload,
  }, [...item.relations].sort(relationOrder)));
}

export async function databaseItemChecksum(
  tx: ContentTransaction,
  entry: ContentEntry,
  manifestItem: ContentReleaseItem,
): Promise<string> {
  if (entry.status === "published" && !entry.publishedAt) {
    throw new Error("content_release_published_at_missing");
  }
  const rows = manifestItem.kind === "service"
    ? await tx.select({
      type: contentRelations.type,
      sortOrder: contentRelations.sortOrder,
      targetKind: contentEntries.kind,
      targetSlug: contentEntries.slug,
    }).from(contentRelations)
      .innerJoin(contentEntries, eq(contentRelations.targetId, contentEntries.id))
      .where(and(
        eq(contentRelations.sourceId, entry.id),
        inArray(contentRelations.type, managedRelationTypes),
      ))
    : [];
  const relations = rows.map(row => ({
    type: row.type as ContentReleaseRelation["type"],
    targetKey: `${row.targetKind}:${row.targetSlug}` as ContentReleaseRelation["targetKey"],
    sortOrder: row.sortOrder,
  })).sort(relationOrder);
  return checksum(managedEntryState(entry, relations));
}
