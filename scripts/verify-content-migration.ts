import path from "node:path";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { getDb } from "../src/server/db/client";
import { contentEntries, siteSettings } from "../src/server/db/schema";
import { matchesImportedEntry, migrationKey } from "../src/server/content/migration";
import { importLegacyContent, cliOptions, runCli, type MigrationOptions } from "./migrate-content-to-postgres";

export async function verifyContentMigration(options: MigrationOptions = {}) {
  const db = options.db ?? getDb();
  const source = await importLegacyContent({ ...options, db: undefined, dryRun: true });
  const [batch] = await db.select().from(siteSettings).where(eq(siteSettings.key, migrationKey(source.batchId)));
  const existing = await db.select().from(contentEntries);
  const mismatches: { source: string; reason: string }[] = [];
  if (!batch) mismatches.push({ source: source.batchId, reason: "batch_missing" });
  else if (batch.value.checksum !== source.checksums.batch) mismatches.push({ source: source.batchId, reason: "source_checksum_changed" });
  const manifest = (batch?.value.entries ?? []) as { id: string; source: string; checksum: string }[];
  for (const record of source.records) {
    const entry = existing.find(e => e.kind === record.command.kind && e.slug === record.command.slug);
    const expected = manifest.find(e => e.source === record.source);
    if (!entry) mismatches.push({ source: record.source, reason: "entry_missing" });
    else if (!matchesImportedEntry(entry, record.command, record.timestamps)) mismatches.push({ source: record.source, reason: "entry_changed" });
    if (batch && (!expected || expected.id !== entry?.id || expected.checksum !== record.checksum)) mismatches.push({ source: record.source, reason: "manifest_mismatch" });
  }
  if (batch && manifest.length !== source.records.length) mismatches.push({ source: source.batchId, reason: "record_count_mismatch" });
  return { ok: source.ok && mismatches.length === 0, batchId: source.batchId, counts: source.counts,
    collisions: source.collisions, invalidRecords: source.invalidRecords, checksums: source.checksums, mismatches };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runCli(() => verifyContentMigration(cliOptions(process.argv.slice(2))));
}
