import { eq, inArray } from "drizzle-orm";

import { getDb, type createDb } from "../db/client";
import { contentMediaRefs, mediaAssets } from "../db/schema";
import { readPublicMediaBaseUrl } from "./config";
import { publicMediaUrl } from "./keys";

type MediaAsset = typeof mediaAssets.$inferSelect;
type PresentationAsset = Pick<MediaAsset, "id" | "objectKey" | "width" | "height" | "altText" | "decorative" | "variants">;

export type ResolvedMediaAsset = {
  id: string;
  src: string;
  srcSet: string;
  sizes: string;
  alt: string;
  decorative: boolean;
  width: number | null;
  height: number | null;
};

export type MediaPresentationMap = Record<string, ResolvedMediaAsset>;

function variants(value: Record<string, unknown>, baseUrl: URL) {
  return Object.values(value).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.objectKey !== "string" || !Number.isInteger(record.width) || Number(record.width) < 1) return [];
    try { return [{ src: publicMediaUrl(baseUrl, record.objectKey), width: Number(record.width) }]; }
    catch { return []; }
  }).sort((left, right) => left.width - right.width);
}

export function resolveMediaAsset(asset: PresentationAsset, publicBaseUrl: URL): ResolvedMediaAsset {
  const resolvedVariants = variants(asset.variants, publicBaseUrl);
  return {
    id: asset.id,
    src: publicMediaUrl(publicBaseUrl, asset.objectKey),
    srcSet: resolvedVariants.map(variant => `${variant.src} ${variant.width}w`).join(", "),
    sizes: "(max-width: 768px) 100vw, 768px",
    alt: asset.decorative ? "" : asset.altText,
    decorative: asset.decorative,
    width: asset.width,
    height: asset.height,
  };
}

export async function loadEntryMediaMaps(
  db: ReturnType<typeof createDb>,
  entryIds: string[],
  publicBaseUrl: URL,
): Promise<Record<string, MediaPresentationMap>> {
  const uniqueIds = [...new Set(entryIds)];
  const result = Object.fromEntries(uniqueIds.map(id => [id, {} as MediaPresentationMap]));
  if (!uniqueIds.length) return result;
  const rows = await db.select({ entryId: contentMediaRefs.entryId, asset: mediaAssets })
    .from(contentMediaRefs)
    .innerJoin(mediaAssets, eq(mediaAssets.id, contentMediaRefs.mediaId))
    .where(inArray(contentMediaRefs.entryId, uniqueIds));
  for (const row of rows) result[row.entryId][row.asset.id] = resolveMediaAsset(row.asset, publicBaseUrl);
  return result;
}

export function getEntryMediaMaps(entryIds: string[]) {
  return loadEntryMediaMaps(getDb(), entryIds, readPublicMediaBaseUrl(process.env));
}

export async function getEntryMediaMap(entryId: string): Promise<MediaPresentationMap> {
  return (await getEntryMediaMaps([entryId]))[entryId] ?? {};
}
