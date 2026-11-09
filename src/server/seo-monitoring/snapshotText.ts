// PostgreSQL JSONB cannot store NUL or isolated UTF-16 surrogates.
export const invalidSnapshotText = /[\u0000\uD800-\uDFFF]/u;

export function snapshotExcerpt(text: string): string {
  return text.slice(0, 300).replace(/[\u0000\uD800-\uDFFF]/gu, "�");
}
