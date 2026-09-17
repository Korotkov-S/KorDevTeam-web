import { and, desc, eq, sql } from "drizzle-orm";

import type { createDb } from "../db/client";
import { contentEntries, contentMediaRefs, mediaAssets } from "../db/schema";

export type MediaDatabase = ReturnType<typeof createDb>;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type MediaAssetInsert = Omit<typeof mediaAssets.$inferInsert, "id" | "createdAt" | "updatedAt" | "version">;

function variantKeys(value: Record<string, unknown>): string[] {
  return Object.values(value).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const key = (item as Record<string, unknown>).objectKey;
    return typeof key === "string" ? [key] : [];
  });
}

export function mediaAssetObjectKeys(asset: Pick<MediaAsset, "objectKey" | "variants">): string[] {
  return [asset.objectKey, ...variantKeys(asset.variants)];
}

export function createMediaRepository(db: MediaDatabase) {
  return {
    async findByFingerprint(checksum: string, visibility: "public" | "private", processingVersion: number) {
      const [asset] = await db.select().from(mediaAssets).where(and(
        eq(mediaAssets.checksum, checksum),
        eq(mediaAssets.visibility, visibility),
        eq(mediaAssets.processingVersion, processingVersion),
      )).limit(1);
      return asset ?? null;
    },
    async insertOrGet(input: MediaAssetInsert) {
      const [inserted] = await db.insert(mediaAssets).values(input).onConflictDoNothing({
        target: [mediaAssets.checksum, mediaAssets.visibility, mediaAssets.processingVersion],
      }).returning();
      if (inserted) return inserted;
      const [existing] = await db.select().from(mediaAssets).where(and(
        eq(mediaAssets.checksum, input.checksum),
        eq(mediaAssets.visibility, input.visibility ?? "private"),
        eq(mediaAssets.processingVersion, input.processingVersion ?? 1),
      )).limit(1);
      if (!existing) throw new Error("media_insert_conflict");
      return existing;
    },
    async list() {
      const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.visibility, "public"))
        .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id));
      return Promise.all(assets.map(async asset => {
        const [references] = await db.select({ count: sql<number>`count(*)::int` }).from(contentMediaRefs)
          .where(eq(contentMediaRefs.mediaId, asset.id));
        const [ogReferences] = await db.select({ count: sql<number>`count(*)::int` }).from(contentEntries)
          .where(eq(contentEntries.ogMediaId, asset.id));
        return { ...asset, usageCount: (references?.count ?? 0) + (ogReferences?.count ?? 0) };
      }));
    },
    async updateMetadata(id: string, expectedVersion: number, values: { altText: string; decorative: boolean }) {
      return db.transaction(async tx => {
        const [current] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id)).for("update");
        if (!current) throw new Error("media_not_found");
        if (current.version !== expectedVersion) throw new Error("media_version_conflict");
        const [updated] = await tx.update(mediaAssets).set({
          ...values,
          version: current.version + 1,
          updatedAt: new Date(),
        }).where(and(eq(mediaAssets.id, id), eq(mediaAssets.version, expectedVersion))).returning();
        if (!updated) throw new Error("media_version_conflict");
        return updated;
      });
    },
    async deleteUnused(id: string, expectedVersion: number) {
      return db.transaction(async tx => {
        const [current] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id)).for("update");
        if (!current) return null;
        if (current.version !== expectedVersion) throw new Error("media_version_conflict");
        const [references] = await tx.select({ count: sql<number>`count(*)::int` }).from(contentMediaRefs)
          .where(eq(contentMediaRefs.mediaId, id));
        const [ogReferences] = await tx.select({ count: sql<number>`count(*)::int` }).from(contentEntries)
          .where(eq(contentEntries.ogMediaId, id));
        if ((references?.count ?? 0) + (ogReferences?.count ?? 0) > 0) throw new Error("media_in_use");
        const [deleted] = await tx.delete(mediaAssets).where(and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.version, expectedVersion),
        )).returning();
        if (!deleted) throw new Error("media_version_conflict");
        return deleted;
      });
    },
    async objectKeyReferenced(key: string) {
      const rows = await db.select({ objectKey: mediaAssets.objectKey, variants: mediaAssets.variants }).from(mediaAssets);
      return rows.some(asset => mediaAssetObjectKeys(asset).includes(key));
    },
  };
}

export type DatabaseMediaRepository = ReturnType<typeof createMediaRepository>;
