import { MAX_MEDIA_BYTES } from "../media/inspect";
import type { MediaService } from "../media/service";
import { decodePage, pageOf } from "./pagination";

export const MAX_MCP_BASE64_CHARS = Math.ceil(MAX_MEDIA_BYTES / 3) * 4;

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type MediaActions = Pick<MediaService, "upload" | "list">;
type PresentedAsset = Awaited<ReturnType<MediaService["list"]>>[number];

export type McpMediaListInput = { query?: string; limit?: number; cursor?: string };
export type McpUploadImageInput = {
  filename: string;
  mimeType: string;
  base64Data: string;
  altText: string;
  decorative: boolean;
};

function present(asset: PresentedAsset) {
  return {
    id: asset.id,
    publicUrl: asset.publicUrl,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
    altText: asset.altText,
    decorative: asset.decorative,
    version: asset.version,
    createdAt: asset.createdAt.toISOString(),
  };
}

function decodeImage(value: string): Buffer {
  if (value.length > MAX_MCP_BASE64_CHARS) throw new Error("media_size_invalid");
  if (!value || !BASE64_PATTERN.test(value)) throw new Error("media_content_invalid");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("media_content_invalid");
  if (bytes.length === 0) throw new Error("media_content_invalid");
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("media_size_invalid");
  return bytes;
}

export function createMcpMediaService(media: MediaActions) {
  return {
    async list(input: McpMediaListInput = {}) {
      const page = decodePage(input.cursor, input.limit);
      const query = input.query?.trim().toLocaleLowerCase("ru-RU") ?? "";
      const assets = (await media.list()).filter(asset =>
        !query || asset.altText.toLocaleLowerCase("ru-RU").includes(query),
      ).map(present);
      return pageOf(assets, page);
    },

    async uploadImage(input: McpUploadImageInput, actorId: string) {
      const filename = input.filename.trim();
      if (!filename || filename.length > 255) throw new Error("media_filename_invalid");
      if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) throw new Error("media_type_invalid");
      const altText = input.altText.trim();
      if (altText.length > 500 || (!input.decorative && !altText)) throw new Error("media_metadata_invalid");
      const bytes = decodeImage(input.base64Data);
      const stored = await media.upload({
        bytes,
        declaredMime: input.mimeType,
        altText,
        decorative: input.decorative,
        actorId,
      });
      const resolved = (await media.list()).find(asset => asset.id === stored.id);
      if (!resolved) throw new Error("media_not_found");
      return present(resolved);
    },
  };
}

export type McpMediaService = ReturnType<typeof createMcpMediaService>;
