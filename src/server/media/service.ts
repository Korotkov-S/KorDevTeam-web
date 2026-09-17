import { z } from "zod";

import type { PublicMediaConfig } from "./config";
import { inspectAndTransformImage, type InspectedImage } from "./inspect";
import { mediaObjectKeys, publicMediaUrl } from "./keys";
import { createMediaRepository, mediaAssetObjectKeys, type DatabaseMediaRepository, type MediaAssetInsert } from "./repository";
import type { PublicMediaStore } from "./store";

export type MediaRepository = Pick<DatabaseMediaRepository,
  "findByFingerprint" | "insertOrGet" | "list" | "updateMetadata" | "deleteUnused" | "objectKeyReferenced">;

type MediaRuntime = { inspect(input: { bytes: Buffer; declaredMime: string }): Promise<InspectedImage>; now(): Date };
const defaultRuntime: MediaRuntime = { inspect: inspectAndTransformImage, now: () => new Date() };

function validateMetadata(altText: string, decorative: boolean) {
  const normalized = altText.trim();
  if (normalized.length > 500 || (!decorative && normalized.length === 0)) throw new Error("media_metadata_invalid");
  return { altText: normalized, decorative };
}

function validateIdentity(value: string): void {
  if (!z.uuid().safeParse(value).success) throw new Error("media_identity_invalid");
}

export function createMediaService(
  repository: MediaRepository,
  store: PublicMediaStore,
  config: PublicMediaConfig,
  injected: Partial<MediaRuntime> = {},
) {
  const runtime = { ...defaultRuntime, ...injected };
  return {
    async upload(input: {
      bytes: Buffer;
      declaredMime: string;
      altText: string;
      decorative: boolean;
      actorId: string;
    }) {
      validateIdentity(input.actorId);
      const metadata = validateMetadata(input.altText, input.decorative);
      const temporaryKey = await store.putTemporary(input.bytes, input.declaredMime);
      const createdKeys: string[] = [];
      let failure: unknown;
      try {
        const inspected = await runtime.inspect({ bytes: input.bytes, declaredMime: input.declaredMime });
        const existing = await repository.findByFingerprint(inspected.checksum, "public", 1);
        if (existing) return existing;
        const keys = mediaObjectKeys(inspected.checksum, inspected.original.mimeType,
          inspected.variants.map(variant => variant.width), config.prefix);
        const finalObjects = [
          { key: keys.original, bytes: inspected.original.bytes, mimeType: inspected.original.mimeType },
          ...inspected.variants.map(variant => ({
            key: keys.variants[String(variant.width)],
            bytes: variant.bytes,
            mimeType: variant.mimeType,
          })),
        ];
        for (const object of finalObjects) {
          const outcome = await store.putFinal({ ...object, checksum: inspected.checksum });
          if (outcome === "created") createdKeys.push(object.key);
        }
        const variants = Object.fromEntries(inspected.variants.map(variant => [String(variant.width), {
          objectKey: keys.variants[String(variant.width)],
          mimeType: variant.mimeType,
          width: variant.width,
          height: variant.height,
          byteSize: variant.bytes.length,
        }]));
        const record: MediaAssetInsert = {
          objectKey: keys.original,
          visibility: "public",
          mimeType: inspected.original.mimeType,
          byteSize: inspected.original.bytes.length,
          checksum: inspected.checksum,
          width: inspected.original.width,
          height: inspected.original.height,
          variants,
          ...metadata,
          processingVersion: 1,
          createdBy: input.actorId,
        };
        return await repository.insertOrGet(record);
      } catch (error) {
        failure = error;
        for (const key of createdKeys.reverse()) {
          try {
            if (!await repository.objectKeyReferenced(key)) await store.delete(key);
          } catch {
            // Preserve a possibly referenced object; the bounded orphan sweep handles safe cleanup.
          }
        }
        throw error;
      } finally {
        try { await store.delete(temporaryKey); }
        catch (cleanupError) { if (!failure) throw cleanupError; }
      }
    },
    async list() {
      return (await repository.list()).map(asset => ({
        ...asset,
        publicUrl: publicMediaUrl(config.publicBaseUrl, asset.objectKey),
      }));
    },
    updateMetadata(id: string, expectedVersion: number, values: { altText: string; decorative: boolean }) {
      validateIdentity(id);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("media_version_invalid");
      return repository.updateMetadata(id, expectedVersion, validateMetadata(values.altText, values.decorative));
    },
    async deleteUnused(id: string, expectedVersion: number) {
      validateIdentity(id);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("media_version_invalid");
      const asset = await repository.deleteUnused(id, expectedVersion);
      if (!asset) return false;
      for (const key of mediaAssetObjectKeys(asset)) await store.delete(key);
      return true;
    },
    async sweepOrphans(cutoff = new Date(runtime.now().getTime() - 24 * 60 * 60_000), limit = 1_000) {
      if (!Number.isFinite(cutoff.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 1_000) {
        throw new Error("media_sweep_invalid");
      }
      let inspected = 0;
      let deleted = 0;
      for await (const object of store.listOlderThan(cutoff)) {
        if (inspected >= limit) break;
        inspected += 1;
        if (!await repository.objectKeyReferenced(object.key)) {
          await store.delete(object.key);
          deleted += 1;
        }
      }
      return { inspected, deleted };
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
