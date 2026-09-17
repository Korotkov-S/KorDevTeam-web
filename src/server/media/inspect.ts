import { createHash } from "node:crypto";
import sharp from "sharp";

import type { PublicImageMime } from "./keys";

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MEDIA_WIDTHS = [640, 1280, 1920] as const;

export type InspectedImage = {
  checksum: string;
  original: { bytes: Buffer; mimeType: PublicImageMime; width: number; height: number };
  variants: Array<{ bytes: Buffer; mimeType: "image/webp"; width: number; height: number }>;
};

function actualMime(bytes: Buffer): PublicImageMime | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function stableError(code: string): Error {
  return new Error(code);
}

export async function inspectAndTransformImage(input: { bytes: Buffer; declaredMime: string }): Promise<InspectedImage> {
  if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) throw stableError("media_content_invalid");
  if (input.bytes.length > MAX_MEDIA_BYTES) throw stableError("media_size_invalid");
  const mimeType = actualMime(input.bytes);
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.declaredMime)) throw stableError("media_type_invalid");
  if (!mimeType) throw stableError("media_content_invalid");
  if (mimeType !== input.declaredMime) throw stableError("media_type_invalid");
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(input.bytes, { limitInputPixels: false, failOn: "warning" }).metadata();
  } catch {
    throw stableError("media_content_invalid");
  }
  if (!metadata.width || !metadata.height || !metadata.format) throw stableError("media_content_invalid");
  const rotated = metadata.orientation && metadata.orientation >= 5 && metadata.orientation <= 8;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  if (width * height > MAX_MEDIA_PIXELS) throw stableError("media_pixels_invalid");
  const widths = [...new Set(MEDIA_WIDTHS.map(target => Math.min(target, width)))].sort((a, b) => a - b);
  try {
    const variants = await Promise.all(widths.map(async targetWidth => {
      const output = await sharp(input.bytes, { limitInputPixels: MAX_MEDIA_PIXELS, failOn: "warning" })
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (!output.info.width || !output.info.height) throw stableError("media_content_invalid");
      return {
        bytes: output.data,
        mimeType: "image/webp" as const,
        width: output.info.width,
        height: output.info.height,
      };
    }));
    return {
      checksum: createHash("sha256").update(input.bytes).digest("hex"),
      original: { bytes: Buffer.from(input.bytes), mimeType, width, height },
      variants,
    };
  } catch (error) {
    if (error instanceof Error && /^media_/.test(error.message)) throw error;
    throw stableError("media_content_invalid");
  }
}
