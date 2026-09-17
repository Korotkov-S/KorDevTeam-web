const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type PublicImageMime = keyof typeof MIME_EXTENSIONS;

function invalid(): never {
  throw new Error("media_key_invalid");
}

export function mediaObjectKeys(
  checksum: string,
  mimeType: string,
  widths: readonly number[],
  prefix: string,
): { original: string; variants: Record<string, string> } {
  if (!/^[0-9a-f]{64}$/.test(checksum) || !(mimeType in MIME_EXTENSIONS) ||
      !/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/.test(prefix)) invalid();
  const uniqueWidths = [...new Set(widths)];
  if (uniqueWidths.length !== widths.length || uniqueWidths.some(width => !Number.isInteger(width) || width < 1 || width > 20_000)) invalid();
  const root = `${prefix}/v1/${checksum.slice(0, 2)}/${checksum}`;
  return {
    original: `${root}/original.${MIME_EXTENSIONS[mimeType as PublicImageMime]}`,
    variants: Object.fromEntries(uniqueWidths.map(width => [String(width), `${root}/${width}.webp`])),
  };
}

export function publicMediaUrl(baseUrl: URL, objectKey: string): string {
  if (!/^([a-z0-9][a-z0-9_-]*\/)+[a-z0-9][a-z0-9._-]*$/.test(objectKey) || objectKey.includes("..")) invalid();
  return new URL(objectKey, baseUrl).href;
}
