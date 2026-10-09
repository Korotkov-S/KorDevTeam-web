import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import type { createDb } from "../db/client";
import {
  contentEntries,
  contentMediaRefs,
  contentRelations,
  contentRevisions,
  siteSettings,
} from "../db/schema";
import { parseContentCommand, validatePublication, type ContentEntry, type ContentKind } from "../content/types";
import type { AdminContentCommand, AdminMediaRef, AdminRelation } from "./contentSchemas";
import { assertTelegramTransition, safeContentWriteError } from "../content/provenance";
import { recordPublicationTransition, referencesDiffer } from "../content/publicationLifecycle";
import { relatedState, writeRelations, saveContentInTransaction } from "./contentWrite";

export type AdminContentDatabase = ReturnType<typeof createDb>;
type Transaction = Parameters<Parameters<AdminContentDatabase["transaction"]>[0]>[0];
type RevisionSnapshot = { entry: ContentEntry; relations: AdminRelation[]; mediaRefs: AdminMediaRef[] };


function decodeSnapshot(value: Record<string, unknown>, fallback: RevisionSnapshot): RevisionSnapshot {
  const structured = value.entry && typeof value.entry === "object" && !Array.isArray(value.entry);
  const entryValue = (structured ? value.entry : value) as Record<string, unknown>;
  const entry = {
    ...entryValue,
    createdAt: new Date(entryValue.createdAt as string),
    updatedAt: new Date(entryValue.updatedAt as string),
    publishedAt: entryValue.publishedAt ? new Date(entryValue.publishedAt as string) : null,
  } as ContentEntry;
  return {
    entry,
    relations: structured && Array.isArray(value.relations) ? value.relations as AdminRelation[] : fallback.relations,
    mediaRefs: structured && Array.isArray(value.mediaRefs) ? value.mediaRefs as AdminMediaRef[] : fallback.mediaRefs,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export function createAdminContentRepository(db: AdminContentDatabase) {
  const repository = {
    async list(input: { kind?: ContentKind; status?: "draft" | "published"; q?: string } = {}) {
      const conditions = [
        input.kind ? eq(contentEntries.kind, input.kind) : undefined,
        input.status ? eq(contentEntries.status, input.status) : undefined,
        input.q ? or(ilike(contentEntries.title, `%${input.q}%`), ilike(contentEntries.slug, `%${input.q}%`)) : undefined,
      ].filter(Boolean) as Parameters<typeof and>;
      return db.select().from(contentEntries).where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(contentEntries.updatedAt), asc(contentEntries.slug));
    },
    async getEditorData(id: string) {
      const [entry] = await db.select().from(contentEntries).where(eq(contentEntries.id, id));
      if (!entry) throw new Error("content_not_found");
      const state = await relatedState(db as unknown as Transaction, id);
      const revisions = await db.select().from(contentRevisions).where(eq(contentRevisions.entryId, id))
        .orderBy(desc(contentRevisions.version));
      return { entry, ...state, revisions };
    },
    async save(command: AdminContentCommand, actorId: string) {
      try { return await db.transaction(async tx => (await saveContentInTransaction(tx, command, { adminUserId: actorId })).entry); }
      catch (error) { throw safeContentWriteError(error); }
    },
    async unpublish(id: string, expectedVersion: number, actorId: string) {
      return db.transaction(async tx => {
        const [before] = await tx.select().from(contentEntries).where(eq(contentEntries.id, id)).for("update");
        if (!before) throw new Error("content_not_found");
        if (before.version !== expectedVersion) throw new Error("content_version_conflict");
        const state = await relatedState(tx, id);
        await tx.insert(contentRevisions).values({
          entryId: id, version: before.version,
          snapshot: { entry: before, ...state } as unknown as Record<string, unknown>, adminUserId: actorId,
        });
        const [entry] = await tx.update(contentEntries).set({
          status: "draft", version: before.version + 1, updatedAt: new Date(),
        }).where(and(eq(contentEntries.id, id), eq(contentEntries.version, expectedVersion))).returning();
        if (!entry) throw new Error("content_version_conflict");
        await recordPublicationTransition(tx, { before, after: entry, actorId });
        return entry;
      });
    },
    async restore(id: string, revisionVersion: number, expectedVersion: number, actorId: string) {
      return db.transaction(async tx => {
        const [before] = await tx.select().from(contentEntries).where(eq(contentEntries.id, id)).for("update");
        if (!before) throw new Error("content_not_found");
        if (before.version !== expectedVersion) throw new Error("content_version_conflict");
        const [revision] = await tx.select().from(contentRevisions).where(and(
          eq(contentRevisions.entryId, id), eq(contentRevisions.version, revisionVersion),
        ));
        if (!revision) throw new Error("content_revision_not_found");
        const currentState = await relatedState(tx, id);
        const restored = decodeSnapshot(revision.snapshot, { entry: before, ...currentState });
        const parsed = parseContentCommand({
          kind: restored.entry.kind,
          slug: restored.entry.slug,
          title: restored.entry.title,
          excerpt: restored.entry.excerpt,
          bodyMd: restored.entry.bodyMd,
          seoTitle: restored.entry.seoTitle,
          seoDescription: restored.entry.seoDescription,
          indexable: restored.entry.indexable,
          ogMediaId: restored.entry.ogMediaId,
          payload: restored.entry.payload,
        });
        if (parsed.kind !== before.kind) throw new Error("content_validation_error");
        assertTelegramTransition(before, { ...restored.entry, ...parsed });
        if (restored.entry.status === "published") validatePublication(restored.entry);
        await tx.insert(contentRevisions).values({
          entryId: id, version: before.version,
          snapshot: { entry: before, ...currentState } as unknown as Record<string, unknown>, adminUserId: actorId,
        });
        const [entry] = await tx.update(contentEntries).set({
          ...parsed,
          status: restored.entry.status,
          publishedAt: before.publishedAt ?? restored.entry.publishedAt,
          version: before.version + 1,
          updatedAt: new Date(),
        }).where(and(eq(contentEntries.id, id), eq(contentEntries.version, expectedVersion))).returning();
        if (!entry) throw new Error("content_version_conflict");
        await writeRelations(tx, id, restored.relations, restored.mediaRefs);
        await recordPublicationTransition(tx, { before, after: entry, actorId,
          linksChanged: referencesDiffer(currentState.relations, restored.relations), mediaChanged: referencesDiffer(currentState.mediaRefs, restored.mediaRefs) });
        return entry;
      }).catch(error => { throw safeContentWriteError(error); });
    },
    async hardDelete(id: string, expectedVersion: number) {
      return db.transaction(async tx => {
        const [before] = await tx.select().from(contentEntries).where(eq(contentEntries.id, id)).for("update");
        if (!before) return false;
        if (before.version !== expectedVersion) throw new Error("content_version_conflict");
        await recordPublicationTransition(tx, { before });
        const rows = await tx.delete(contentEntries).where(and(
          eq(contentEntries.id, id), eq(contentEntries.version, expectedVersion),
        )).returning({ id: contentEntries.id });
        if (rows.length !== 1) throw new Error("content_version_conflict");
        return true;
      });
    },
    listSettings() {
      return db.select().from(siteSettings).orderBy(asc(siteSettings.key));
    },
    async saveSetting(key: string, value: Record<string, unknown>, expectedVersion: number) {
      if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(key) || !Number.isInteger(expectedVersion) || expectedVersion < 0 ||
          !value || typeof value !== "object" || Array.isArray(value)) throw new Error("setting_validation_error");
      return db.transaction(async tx => {
        const [current] = await tx.select().from(siteSettings).where(eq(siteSettings.key, key)).for("update");
        if (!current) {
          if (expectedVersion !== 0) throw new Error("setting_version_conflict");
          try {
            const [created] = await tx.insert(siteSettings).values({ key, value }).returning();
            return created;
          } catch (error) {
            if (isUniqueViolation(error)) throw new Error("setting_version_conflict");
            throw error;
          }
        }
        if (current.version !== expectedVersion) throw new Error("setting_version_conflict");
        const [updated] = await tx.update(siteSettings).set({
          value, version: current.version + 1, updatedAt: new Date(),
        }).where(and(eq(siteSettings.id, current.id), eq(siteSettings.version, expectedVersion))).returning();
        if (!updated) throw new Error("setting_version_conflict");
        return updated;
      });
    },
  };
  return repository;
}

export type AdminContentRepository = ReturnType<typeof createAdminContentRepository>;
