import { and, asc, eq, or } from "drizzle-orm";
import type { createDb } from "../db/client";
import { contentEntries, contentRelations, contentRevisions } from "../db/schema";
import type { ContentEntry, ContentKind, ValidatedContentCommand } from "./types";

export type ContentDatabase = ReturnType<typeof createDb>;
type Transaction = Parameters<Parameters<ContentDatabase["transaction"]>[0]>[0];
export type WriteResult = { before?: ContentEntry; after?: ContentEntry; relatedSourceIds: string[]; relatedKinds: ContentKind[] };

async function references(tx: Transaction, id: string) {
  const rows = await tx.select({ sourceId: contentRelations.sourceId, kind: contentEntries.kind })
    .from(contentRelations).innerJoin(contentEntries, eq(contentRelations.sourceId, contentEntries.id))
    .where(or(eq(contentRelations.targetId, id), eq(contentRelations.sourceId, id)));
  return { relatedSourceIds: rows.map(row => row.sourceId), relatedKinds: rows.map(row => row.kind) };
}

export function createContentRepository(db: ContentDatabase) {
  return {
    async getPublishedEntry(kind: ContentKind, slug: string) {
      const [entry] = await db.select().from(contentEntries).where(and(
        eq(contentEntries.kind, kind), eq(contentEntries.slug, slug), eq(contentEntries.status, "published"),
      ));
      return entry ?? null;
    },
    listPublishedEntries(kind: ContentKind) {
      return db.select().from(contentEntries).where(and(eq(contentEntries.kind, kind), eq(contentEntries.status, "published")))
        .orderBy(asc(contentEntries.slug));
    },
    async insert(command: ValidatedContentCommand): Promise<WriteResult> {
      return db.transaction(async tx => {
        const { id: _id, expectedVersion: _version, ...fields } = command;
        const [after] = await tx.insert(contentEntries).values({ ...fields, status: "draft" }).returning();
        return { after, relatedSourceIds: [], relatedKinds: [] };
      });
    },
    async update(
      id: string, expectedVersion: number, actorId: string,
      change: (current: ContentEntry, revision?: ContentEntry) => Partial<ContentEntry>,
      revisionVersion?: number,
    ): Promise<WriteResult> {
      return db.transaction(async tx => {
        const [before] = await tx.select().from(contentEntries).where(eq(contentEntries.id, id)).for("update");
        if (!before) throw new Error("content_not_found");
        if (before.version !== expectedVersion) throw new Error("content_version_conflict");
        let revision: ContentEntry | undefined;
        if (revisionVersion !== undefined) {
          const [row] = await tx.select().from(contentRevisions).where(and(
            eq(contentRevisions.entryId, id), eq(contentRevisions.version, revisionVersion),
          ));
          if (!row) throw new Error("content_revision_not_found");
          // JSON snapshots serialize timestamps; restore them before validation/use.
          revision = { ...row.snapshot,
            createdAt: new Date(row.snapshot.createdAt as string),
            updatedAt: new Date(row.snapshot.updatedAt as string),
            publishedAt: row.snapshot.publishedAt ? new Date(row.snapshot.publishedAt as string) : null,
          } as ContentEntry;
        }
        const fields = change(before, revision);
        await tx.insert(contentRevisions).values({ entryId: id, version: before.version, snapshot: before, adminUserId: actorId });
        const [after] = await tx.update(contentEntries).set({ ...fields, version: before.version + 1, updatedAt: new Date() })
          .where(and(eq(contentEntries.id, id), eq(contentEntries.version, expectedVersion))).returning();
        if (!after) throw new Error("content_version_conflict");
        return { before, after, ...await references(tx, id) };
      });
    },
    async delete(id: string, expectedVersion: number): Promise<WriteResult | null> {
      return db.transaction(async tx => {
        const [before] = await tx.select().from(contentEntries).where(eq(contentEntries.id, id)).for("update");
        if (!before) return null;
        if (before.version !== expectedVersion) throw new Error("content_version_conflict");
        const related = await references(tx, id);
        const deleted = await tx.delete(contentEntries).where(and(
          eq(contentEntries.id, id), eq(contentEntries.version, expectedVersion),
        )).returning({ id: contentEntries.id });
        if (deleted.length !== 1) throw new Error("content_version_conflict");
        return { before, ...related };
      });
    },
  };
}
