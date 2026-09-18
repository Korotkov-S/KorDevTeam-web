import { and, asc, eq } from "drizzle-orm";
import type { createDb } from "../db/client";
import { contentEntries, contentRelations } from "../db/schema";
import type { ContentEntry, RelationType } from "./types";

type ContentDatabase = ReturnType<typeof createDb>;

export async function listPublishedRelations(
  db: ContentDatabase,
  sourceId: string,
  type: RelationType,
): Promise<ContentEntry[]> {
  const rows = await db.select({ entry: contentEntries })
    .from(contentRelations)
    .innerJoin(contentEntries, eq(contentRelations.targetId, contentEntries.id))
    .where(and(
      eq(contentRelations.sourceId, sourceId),
      eq(contentRelations.type, type),
      eq(contentEntries.status, "published"),
    ))
    .orderBy(asc(contentRelations.sortOrder), asc(contentEntries.updatedAt));
  return rows.map(row => row.entry);
}
