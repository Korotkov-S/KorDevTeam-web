import { and, asc, eq, or, sql } from "drizzle-orm";
import type { createDb } from "../db/client";
import { contentEntries, contentRelations, contentRevisions, siteSettings } from "../db/schema";
import { parseContentCommand, validatePublication } from "./types";
import { matchesImportedEntry, migrationKey, type MigrationRecord } from "./migration";
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
    // Offline, atomic legacy import. Every new record follows draft -> revision -> publication.
    async importLegacyBatch(batchId: string, batchChecksum: string, records: MigrationRecord[]) {
      const commands = records.map(record => {
        const command = parseContentCommand(record.command);
        if (command.id || command.expectedVersion) throw new Error("content_validation_error");
        validatePublication(command as ContentEntry);
        for (const value of Object.values(record.timestamps)) {
          if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("content_validation_error");
        }
        return command;
      });
      return db.transaction(async tx => {
        // Serialize import batches, including different batches targeting the same slugs.
        await tx.execute(sql`select pg_advisory_xact_lock(706004)`);
        const key = migrationKey(batchId);
        const [batch] = await tx.select().from(siteSettings).where(eq(siteSettings.key, key));
        if (batch && batch.value.checksum !== batchChecksum) throw new Error("migration_batch_checksum_conflict");
        let inserted = 0;
        let unchanged = 0;
        const entries: { id: string; source: string; checksum: string; kind: string; slug: string }[] = [];
        for (const [index, command] of commands.entries()) {
          const [existing] = await tx.select().from(contentEntries).where(and(
            eq(contentEntries.kind, command.kind), eq(contentEntries.slug, command.slug),
          )).for("update");
          const timestamps = records[index].timestamps;
          if (existing && !matchesImportedEntry(existing, command, timestamps)) throw new Error("migration_target_collision");
          if (batch && !existing) throw new Error("migration_target_missing");
          let entry = existing;
          if (!entry) {
            const historical = Object.fromEntries(Object.entries(timestamps).map(([key, value]) => [key, new Date(value)]));
            // Migration-only exception: preserve source history; ordinary publication still uses first publish time.
            const [draft] = await tx.insert(contentEntries).values({ ...command, ...historical, publishedAt: null, status: "draft" }).returning();
            await tx.insert(contentRevisions).values({ entryId: draft.id, version: 1, snapshot: draft });
            [entry] = await tx.update(contentEntries).set({ status: "published", version: 2,
              publishedAt: timestamps.publishedAt ? new Date(timestamps.publishedAt) : new Date(),
              updatedAt: timestamps.updatedAt ? new Date(timestamps.updatedAt) : new Date() })
              .where(eq(contentEntries.id, draft.id)).returning();
            inserted++;
          } else { unchanged++; }
          entries.push({ id: entry.id, source: records[index].source, checksum: records[index].checksum, kind: entry.kind, slug: entry.slug });
        }
        if (!batch) await tx.insert(siteSettings).values({ key, value: { batchId, checksum: batchChecksum, entries } });
        return { inserted, unchanged };
      });
    },
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
