import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";

import { adminUsers, contentEntries, contentMediaRefs, contentRelations, contentRevisions, mediaAssets, siteSettings } from "../db/schema";
import type { createDb } from "../db/client";
import { checksum as valueChecksum } from "../content/migration";
import type { MediaService } from "./service";
import { mediaAssetObjectKeys } from "./repository";
import type { PublicMediaStore } from "./store";

type Database = ReturnType<typeof createDb>;
type MigrationService = Pick<MediaService, "upload">;
type Usage = { entryId: string; fieldPath: string; original: string; altText: string; expectedVersion: number };
export type MediaMigrationAsset = {
  sourcePath: string;
  checksum: string;
  byteSize: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  usages: Usage[];
};
export type MediaMigrationReplacement = Usage & { sourcePath: string; checksum: string };
export type MediaMigrationReport = {
  version: 1;
  root: string;
  batchId: string;
  counts: { entries: number; assets: number; replacements: number; external: number; problems: number };
  assets: MediaMigrationAsset[];
  replacements: MediaMigrationReplacement[];
  problems: Array<{ entryId: string; fieldPath: string; value: string; reason: string }>;
  reportChecksum: string;
};

const IMAGE = /\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;
const MEDIA_MIGRATION_PREFIX = "media-migration:";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mimeType(filename: string): MediaMigrationAsset["mimeType"] | null {
  const clean = filename.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  return null;
}

function reportHash(report: Omit<MediaMigrationReport, "reportChecksum">): string {
  return valueChecksum(report);
}

function withoutChecksum(report: MediaMigrationReport): Omit<MediaMigrationReport, "reportChecksum"> {
  const { reportChecksum: _checksum, ...value } = report;
  return value;
}

function collectPayloadImages(value: unknown, prefix = "payload"): Array<{ fieldPath: string; value: string }> {
  if (typeof value === "string") return IMAGE.test(value) ? [{ fieldPath: prefix, value }] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectPayloadImages(item, `${prefix}.${index}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => collectPayloadImages(item, `${prefix}.${key}`));
  return [];
}

async function localFile(root: string, value: string): Promise<{ sourcePath: string; bytes: Buffer; mimeType: MediaMigrationAsset["mimeType"] }> {
  const type = mimeType(value);
  if (!type) throw new Error("unsupported");
  const clean = decodeURIComponent(value.split(/[?#]/)[0]);
  if (clean.includes("\0")) throw new Error("path_invalid");
  const relative = clean.startsWith("/") ? path.join("public", clean.slice(1)) : clean;
  const candidate = path.resolve(root, relative);
  const allowed = ["public", "src/assets", "src/blog", "server/data"].map(directory => path.resolve(root, directory));
  if (!allowed.some(directory => candidate === directory || candidate.startsWith(`${directory}${path.sep}`))) throw new Error("path_outside_allowlist");
  let resolved: string;
  try { resolved = await realpath(candidate); } catch { throw new Error("file_missing"); }
  if (!allowed.some(directory => resolved === directory || resolved.startsWith(`${directory}${path.sep}`))) throw new Error("path_outside_allowlist");
  try { return { sourcePath: path.relative(root, resolved).split(path.sep).join("/"), bytes: await readFile(resolved), mimeType: type }; }
  catch { throw new Error("file_unreadable"); }
}

export async function discoverMediaMigration(rootInput: string, db: Database): Promise<MediaMigrationReport> {
  const root = await realpath(path.resolve(rootInput));
  const entries = await db.select().from(contentEntries).orderBy(contentEntries.id);
  const problems: MediaMigrationReport["problems"] = [];
  const replacements: MediaMigrationReplacement[] = [];
  const assets = new Map<string, MediaMigrationAsset>();
  let external = 0;
  for (const entry of entries) {
    const markdown = [...entry.bodyMd.matchAll(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map((match, index) => ({
      fieldPath: `bodyMd:${index}`, value: match[2], altText: match[1],
    }));
    const payload = collectPayloadImages(entry.payload).map(item => ({ ...item, altText: "" }));
    for (const usage of [...markdown, ...payload]) {
      if (/^https?:\/\//i.test(usage.value)) { external += 1; continue; }
      if (/^media:/i.test(usage.value)) continue;
      try {
        const file = await localFile(root, usage.value);
        if (!file.bytes.length) throw new Error("file_empty");
        const digest = sha256(file.bytes);
        const replacement = {
          entryId: entry.id, fieldPath: usage.fieldPath, original: usage.value, altText: usage.altText,
          expectedVersion: entry.version, sourcePath: file.sourcePath, checksum: digest,
        };
        replacements.push(replacement);
        const asset = assets.get(digest);
        if (asset) asset.usages.push(replacement);
        else assets.set(digest, { sourcePath: file.sourcePath, checksum: digest, byteSize: file.bytes.length, mimeType: file.mimeType, usages: [replacement] });
      } catch (error) {
        problems.push({ entryId: entry.id, fieldPath: usage.fieldPath, value: usage.value,
          reason: error instanceof Error ? error.message : "file_unreadable" });
      }
    }
  }
  const sortedAssets = [...assets.values()].sort((a, b) => a.checksum.localeCompare(b.checksum));
  replacements.sort((a, b) => `${a.entryId}:${a.fieldPath}`.localeCompare(`${b.entryId}:${b.fieldPath}`));
  problems.sort((a, b) => `${a.entryId}:${a.fieldPath}`.localeCompare(`${b.entryId}:${b.fieldPath}`));
  const base = {
    version: 1 as const,
    root,
    batchId: `legacy-media-${valueChecksum({ assets: sortedAssets.map(asset => asset.checksum), replacements })}`,
    counts: {
      entries: new Set(replacements.map(item => item.entryId)).size,
      assets: sortedAssets.length,
      replacements: replacements.length,
      external,
      problems: problems.length,
    },
    assets: sortedAssets,
    replacements,
    problems,
  };
  return { ...base, reportChecksum: reportHash(base) };
}

function replacePayload(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map(item => replacePayload(item, replacements));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePayload(item, replacements)]));
  return value;
}

function migrationKey(report: MediaMigrationReport): string {
  return `${MEDIA_MIGRATION_PREFIX}${valueChecksum(report.batchId)}`;
}

export async function applyMediaMigration(report: MediaMigrationReport, db: Database, service: MigrationService) {
  if (report.reportChecksum !== reportHash(withoutChecksum(report))) throw new Error("media_migration_report_changed");
  if (report.problems.length) throw new Error("media_migration_report_has_problems");
  const key = migrationKey(report);
  const [existingManifest] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
  if (existingManifest) {
    if (existingManifest.value.reportChecksum !== report.reportChecksum) throw new Error("media_migration_manifest_conflict");
    return { applied: 0, unchanged: report.counts.entries };
  }
  const [actor] = await db.select().from(adminUsers).where(eq(adminUsers.active, true)).limit(1);
  if (!actor) throw new Error("media_migration_admin_missing");
  const assetIds = new Map<string, string>();
  for (const asset of report.assets) {
    const bytes = await readFile(path.resolve(report.root, asset.sourcePath));
    if (bytes.length !== asset.byteSize || sha256(bytes) !== asset.checksum) throw new Error("media_migration_source_changed");
    const uploaded = await service.upload({
      bytes,
      declaredMime: asset.mimeType,
      altText: asset.usages.find(usage => usage.altText.trim())?.altText.trim() || "Импортированное изображение",
      decorative: false,
      actorId: actor.id,
    });
    assetIds.set(asset.checksum, uploaded.id);
  }
  const groups = new Map<string, MediaMigrationReplacement[]>();
  for (const replacement of report.replacements) {
    const items = groups.get(replacement.entryId) ?? [];
    items.push(replacement);
    groups.set(replacement.entryId, items);
  }
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(706005)`);
    const [manifest] = await tx.select().from(siteSettings).where(eq(siteSettings.key, key));
    if (manifest) {
      if (manifest.value.reportChecksum !== report.reportChecksum) throw new Error("media_migration_manifest_conflict");
      return { applied: 0, unchanged: report.counts.entries };
    }
    const mappings: Record<string, string> = {};
    for (const [entryId, items] of groups) {
      const [entry] = await tx.select().from(contentEntries).where(eq(contentEntries.id, entryId)).for("update");
      if (!entry || items.some(item => item.expectedVersion !== entry.version)) throw new Error("media_migration_entry_changed");
      const relations = await tx.select({ targetId: contentRelations.targetId, type: contentRelations.type, sortOrder: contentRelations.sortOrder })
        .from(contentRelations).where(eq(contentRelations.sourceId, entryId));
      const existingRefs = await tx.select({ mediaId: contentMediaRefs.mediaId, fieldPath: contentMediaRefs.fieldPath })
        .from(contentMediaRefs).where(eq(contentMediaRefs.entryId, entryId));
      await tx.insert(contentRevisions).values({
        entryId, version: entry.version,
        snapshot: { entry, relations, mediaRefs: existingRefs }, adminUserId: actor.id,
      });
      const replacements = new Map(items.map(item => [item.original, `media:${assetIds.get(item.checksum)}`]));
      let bodyMd = entry.bodyMd;
      for (const [original, replacement] of replacements) bodyMd = bodyMd.split(original).join(replacement);
      const [updated] = await tx.update(contentEntries).set({
        bodyMd,
        payload: replacePayload(entry.payload, replacements) as Record<string, unknown>,
        version: entry.version + 1,
        updatedAt: new Date(),
      }).where(and(eq(contentEntries.id, entryId), eq(contentEntries.version, entry.version))).returning();
      if (!updated) throw new Error("media_migration_entry_changed");
      const refs = items.map(item => ({ entryId, mediaId: assetIds.get(item.checksum)!, fieldPath: item.fieldPath }));
      if (refs.length) await tx.insert(contentMediaRefs).values(refs).onConflictDoNothing();
      for (const item of items) mappings[`${entryId}:${item.fieldPath}`] = assetIds.get(item.checksum)!;
    }
    await tx.insert(siteSettings).values({ key, value: { reportChecksum: report.reportChecksum, batchId: report.batchId, mappings } });
    return { applied: groups.size, unchanged: 0 };
  });
}

export async function verifyMediaMigration(report: MediaMigrationReport, db: Database, store?: Pick<PublicMediaStore, "head">) {
  if (report.reportChecksum !== reportHash(withoutChecksum(report))) throw new Error("media_migration_report_changed");
  const [manifest] = await db.select().from(siteSettings).where(eq(siteSettings.key, migrationKey(report)));
  const mismatches: Array<{ entryId?: string; fieldPath?: string; reason: string }> = [];
  if (!manifest || manifest.value.reportChecksum !== report.reportChecksum) mismatches.push({ reason: "manifest_missing_or_changed" });
  const entryIds = [...new Set(report.replacements.map(item => item.entryId))];
  const entries = entryIds.length ? await db.select().from(contentEntries).where(inArray(contentEntries.id, entryIds)) : [];
  const refs = entryIds.length ? await db.select().from(contentMediaRefs).where(inArray(contentMediaRefs.entryId, entryIds)) : [];
  const mappings = (manifest?.value.mappings ?? {}) as Record<string, string>;
  for (const item of report.replacements) {
    const mediaId = mappings[`${item.entryId}:${item.fieldPath}`];
    const entry = entries.find(row => row.id === item.entryId);
    if (!entry || !mediaId) mismatches.push({ entryId: item.entryId, fieldPath: item.fieldPath, reason: "mapping_missing" });
    else if (!entry.bodyMd.includes(`media:${mediaId}`) && JSON.stringify(entry.payload).includes(`media:${mediaId}`) === false) {
      mismatches.push({ entryId: item.entryId, fieldPath: item.fieldPath, reason: "content_not_rewritten" });
    }
    if (mediaId && !refs.some(ref => ref.entryId === item.entryId && ref.mediaId === mediaId && ref.fieldPath === item.fieldPath)) {
      mismatches.push({ entryId: item.entryId, fieldPath: item.fieldPath, reason: "reference_missing" });
    }
  }
  if (store) {
    const mediaIds = [...new Set(Object.values(mappings))];
    const assets = mediaIds.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds)) : [];
    for (const mediaId of mediaIds) {
      const asset = assets.find(row => row.id === mediaId);
      if (!asset) { mismatches.push({ reason: "media_asset_missing" }); continue; }
      for (const objectKey of mediaAssetObjectKeys(asset)) {
        const object = await store.head(objectKey);
        if (!object.exists || (object.checksum && object.checksum !== asset.checksum)) {
          mismatches.push({ reason: "s3_object_missing_or_changed" });
        }
      }
    }
  }
  return { ok: mismatches.length === 0, counts: report.counts, mismatches };
}
