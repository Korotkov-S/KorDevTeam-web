import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { contentEntries, contentRelations, contentMediaRefs, contentRevisions } from "../db/schema";
import { validatePublication, type ContentEntry } from "../content/types";
import { assertTelegramTransition } from "../content/provenance";
import { recordPublicationTransition, referencesDiffer, type ContentWriteTransaction } from "../content/publicationLifecycle";
import type { AdminContentCommand, AdminRelation, AdminMediaRef } from "./contentSchemas";
type Transaction = ContentWriteTransaction;
type RevisionSnapshot = { entry: ContentEntry; relations: AdminRelation[]; mediaRefs: AdminMediaRef[] };

function publicFields(command: AdminContentCommand) {
  const { id: _id, expectedVersion: _expectedVersion, intent: _intent, relations: _relations, mediaRefs: _mediaRefs, ...fields } = command;
  return fields;
}

export async function relatedState(tx: Transaction, entryId: string) {
  const relations = await tx.select({
    targetId: contentRelations.targetId,
    type: contentRelations.type,
    sortOrder: contentRelations.sortOrder,
  }).from(contentRelations).where(eq(contentRelations.sourceId, entryId)).orderBy(asc(contentRelations.sortOrder));
  const mediaRefs = await tx.select({
    mediaId: contentMediaRefs.mediaId,
    fieldPath: contentMediaRefs.fieldPath,
  }).from(contentMediaRefs).where(eq(contentMediaRefs.entryId, entryId)).orderBy(asc(contentMediaRefs.fieldPath));
  return { relations, mediaRefs };
}

export async function writeRelations(tx: Transaction, entryId: string, relations: AdminRelation[], mediaRefs: AdminMediaRef[]) {
  await tx.delete(contentRelations).where(eq(contentRelations.sourceId, entryId));
  await tx.delete(contentMediaRefs).where(eq(contentMediaRefs.entryId, entryId));
  if (relations.length) await tx.insert(contentRelations).values(relations.map(relation => ({ sourceId: entryId, ...relation })));
  if (mediaRefs.length) await tx.insert(contentMediaRefs).values(mediaRefs.map(ref => ({ entryId, ...ref })));
}

export async function saveContentInTransaction(tx: Transaction, command: AdminContentCommand, actor: { adminUserId?: string; mcpTokenId?: string }) {
  if (!z.strictObject({ adminUserId: z.uuid().optional(), mcpTokenId: z.uuid().optional() }).safeParse(actor).success || Object.values(actor).filter(Boolean).length !== 1) throw Error("seo_actor_invalid");
  const fields = publicFields(command);
  if (!command.id) {
    const candidate = { ...fields, status: command.intent === "publish" ? "published" : "draft" } as ContentEntry;
    assertTelegramTransition(undefined, candidate);
    if (command.intent === "publish") validatePublication(candidate);
    const [entry] = await tx.insert(contentEntries).values({
      ...fields,
      status: candidate.status,
      publishedAt: command.intent === "publish" ? new Date() : null,
    }).returning();
    await writeRelations(tx, entry.id, command.relations, command.mediaRefs);
    const publicationChanges = await recordPublicationTransition(tx, { after: entry, actorId: actor.adminUserId, actorMcpTokenId: actor.mcpTokenId });
    return { entry, publicationChanges };
  }
  const [before] = await tx.select().from(contentEntries).where(eq(contentEntries.id, command.id)).for("update");
  if (!before) throw new Error("content_not_found");
  if (before.version !== command.expectedVersion) throw new Error("content_version_conflict");
  if (before.kind !== command.kind) throw new Error("content_validation_error");
  const state = await relatedState(tx, before.id);
  const snapshot: RevisionSnapshot = { entry: before, ...state };
  const next = {
    ...before,
    ...fields,
    status: command.intent === "publish" ? "published" : "draft",
    publishedAt: command.intent === "publish" ? before.publishedAt ?? new Date() : before.publishedAt,
  } as ContentEntry;
  assertTelegramTransition(before, next);
  if (command.intent === "publish") validatePublication(next);
  await tx.insert(contentRevisions).values({
    entryId: before.id,
    version: before.version,
    snapshot: snapshot as unknown as Record<string, unknown>,
    adminUserId: actor.adminUserId ?? null,
  });
  const [entry] = await tx.update(contentEntries).set({
    ...fields,
    status: next.status,
    publishedAt: next.publishedAt,
    version: before.version + 1,
    updatedAt: new Date(),
  }).where(and(eq(contentEntries.id, before.id), eq(contentEntries.version, before.version))).returning();
  if (!entry) throw new Error("content_version_conflict");
  await writeRelations(tx, entry.id, command.relations, command.mediaRefs);
  const publicationChanges = await recordPublicationTransition(tx, { before, after: entry, actorId: actor.adminUserId, actorMcpTokenId: actor.mcpTokenId,
    linksChanged: referencesDiffer(state.relations, command.relations), mediaChanged: referencesDiffer(state.mediaRefs, command.mediaRefs) });
  return { entry, publicationChanges };
}
