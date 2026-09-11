import { createHash } from "node:crypto";
import { parseContentCommand, type ContentEntry, type ValidatedContentCommand } from "./types";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const checksum = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export type MigrationTimestamps = { publishedAt?: string; createdAt?: string; updatedAt?: string };
export type MigrationRecord = { source: string; checksum: string; command: ValidatedContentCommand; timestamps: MigrationTimestamps };
export const migrationKey = (batchId: string) => `content-migration:${checksum(batchId)}`;

export function entryCommand(entry: ContentEntry): ValidatedContentCommand {
  const { kind, slug, title, excerpt, bodyMd, seoTitle, seoDescription, indexable, ogMediaId, payload } = entry;
  return parseContentCommand({ kind, slug, title, excerpt, bodyMd, seoTitle, seoDescription, indexable, ogMediaId, payload } as ValidatedContentCommand);
}

export function matchesImportedEntry(entry: ContentEntry, command: ValidatedContentCommand, timestamps: MigrationTimestamps = {}) {
  try {
    return entry.status === "published" && !!entry.publishedAt && !entry.manualCanonicalPath &&
      checksum(entryCommand(entry)) === checksum(command) &&
      Object.entries(timestamps).every(([key, value]) => (entry[key as keyof MigrationTimestamps] as Date | null)?.toISOString() === value);
  } catch { return false; }
}
