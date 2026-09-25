import { and, eq, inArray, or } from "drizzle-orm";

import { checksum } from "../content/migration";
import type { ContentTransaction } from "../content/repository";
import {
  contentEntries,
  contentReleaseItems,
  contentReleaseRuns,
} from "../db/schema";
import { contentReleaseItemKey } from "./manifest";
import { databaseItemChecksum, desiredDatabaseItemChecksum } from "./state";
import type {
  ContentReleaseAction,
  ContentReleaseItem,
  ContentReleaseManifest,
  ContentReleasePlan,
  ContentReleasePlanItem,
} from "./types";

export type ContentReleaseCurrent = {
  entryId: string;
  version: number;
  databaseChecksum: string;
  desiredDatabaseChecksum: string;
};

export type ContentReleaseOwned = {
  entryId: string;
  databaseVersion: number;
  databaseChecksum: string;
  sourceChecksum: string;
};

export function classifyContentReleaseItem(input: {
  desired: ContentReleaseItem;
  current: ContentReleaseCurrent | null;
  owned: ContentReleaseOwned | null;
}): Exclude<ContentReleaseAction, "orphaned-owned"> {
  const { desired, current, owned } = input;
  if (!current) return owned ? "conflict" : "insert";
  if (!owned) {
    return current.databaseChecksum === current.desiredDatabaseChecksum
      ? "unchanged"
      : "unowned-conflict";
  }
  if (
    current.entryId !== owned.entryId
    || current.version !== owned.databaseVersion
    || current.databaseChecksum !== owned.databaseChecksum
  ) return "conflict";
  return desired.sourceChecksum === owned.sourceChecksum ? "unchanged" : "update";
}

function emptyActionCounts(): Record<ContentReleaseAction, number> {
  return {
    insert: 0,
    update: 0,
    unchanged: 0,
    conflict: 0,
    "unowned-conflict": 0,
    "orphaned-owned": 0,
  };
}

export async function planContentRelease(
  tx: ContentTransaction,
  manifest: ContentReleaseManifest,
  options: { forUpdate?: boolean } = {},
): Promise<ContentReleasePlan> {
  const ownershipQuery = tx.select().from(contentReleaseItems);
  const ownership = options.forUpdate
    ? await ownershipQuery.for("update")
    : await ownershipQuery;
  const ownedByKey = new Map(ownership.map(row => [contentReleaseItemKey(row.kind as ContentReleaseItem["kind"], row.slug), row]));
  const items: ContentReleasePlanItem[] = [];

  for (const desired of manifest.items) {
    const candidateSlugs = [...new Set([desired.slug, ...desired.aliases])];
    const candidateQuery = tx.select().from(contentEntries).where(and(
      eq(contentEntries.kind, desired.kind),
      inArray(contentEntries.slug, candidateSlugs),
    ));
    const candidates = options.forUpdate
      ? await candidateQuery.for("update")
      : await candidateQuery;
    const ownedRow = ownedByKey.get(desired.key) ?? null;
    ownedByKey.delete(desired.key);

    if (candidates.length > 1) {
      items.push({
        key: desired.key,
        action: "conflict",
        entryId: null,
        expectedVersion: null,
        expectedDatabaseChecksum: null,
        desiredSourceChecksum: desired.sourceChecksum,
      });
      continue;
    }

    const entry = candidates[0] ?? null;
    const currentDatabaseChecksum = entry
      ? await databaseItemChecksum(tx, entry, desired)
      : null;
    const current: ContentReleaseCurrent | null = entry && currentDatabaseChecksum
      ? {
        entryId: entry.id,
        version: entry.version,
        databaseChecksum: currentDatabaseChecksum,
        desiredDatabaseChecksum: desiredDatabaseItemChecksum(desired),
      }
      : null;
    const owned: ContentReleaseOwned | null = ownedRow
      ? {
        entryId: ownedRow.entryId,
        databaseVersion: ownedRow.databaseVersion,
        databaseChecksum: ownedRow.databaseChecksum,
        sourceChecksum: ownedRow.sourceChecksum,
      }
      : null;
    items.push({
      key: desired.key,
      action: classifyContentReleaseItem({ desired, current, owned }),
      entryId: entry?.id ?? null,
      expectedVersion: entry?.version ?? null,
      expectedDatabaseChecksum: currentDatabaseChecksum,
      desiredSourceChecksum: desired.sourceChecksum,
    });
  }

  for (const [key, owned] of ownedByKey) {
    items.push({
      key,
      action: "orphaned-owned",
      entryId: owned.entryId,
      expectedVersion: owned.databaseVersion,
      expectedDatabaseChecksum: owned.databaseChecksum,
      desiredSourceChecksum: null,
    });
  }

  items.sort((left, right) => left.key.localeCompare(right.key, "en"));
  const counts = emptyActionCounts();
  for (const item of items) counts[item.action]++;
  const blocked = counts.conflict > 0
    || counts["unowned-conflict"] > 0
    || counts["orphaned-owned"] > 0;
  const body = { manifestChecksum: manifest.checksum, blocked, counts, items };
  return { ...body, planChecksum: checksum(body) };
}

export type RecordReleaseStateInput = {
  releaseSha: string;
  manifest: ContentReleaseManifest;
  counts: { inserted: number; updated: number; unchanged: number };
  items: Array<{
    key: string;
    entryId: string;
    databaseChecksum: string;
    databaseVersion: number;
  }>;
};

export async function recordReleaseState(
  tx: ContentTransaction,
  input: RecordReleaseStateInput,
): Promise<{ releaseId: string }> {
  await tx.insert(contentReleaseRuns).values({
    releaseSha: input.releaseSha,
    manifestChecksum: input.manifest.checksum,
    insertedCount: input.counts.inserted,
    updatedCount: input.counts.updated,
    unchangedCount: input.counts.unchanged,
  }).onConflictDoNothing();
  const [run] = await tx.select().from(contentReleaseRuns).where(and(
    eq(contentReleaseRuns.releaseSha, input.releaseSha),
    eq(contentReleaseRuns.manifestChecksum, input.manifest.checksum),
  ));
  if (!run) throw new Error("content_release_run_missing");

  const verifiedByKey = new Map(input.items.map(item => [item.key, item]));
  for (const desired of input.manifest.items) {
    const verified = verifiedByKey.get(desired.key);
    if (!verified) throw new Error(`content_release_verification_missing:${desired.key}`);
    const [existing] = await tx.select().from(contentReleaseItems).where(or(
      eq(contentReleaseItems.entryId, verified.entryId),
      and(eq(contentReleaseItems.kind, desired.kind), eq(contentReleaseItems.slug, desired.slug)),
    )).for("update");
    const next = {
      entryId: verified.entryId,
      kind: desired.kind,
      slug: desired.slug,
      releaseId: run.id,
      sourceChecksum: desired.sourceChecksum,
      databaseChecksum: verified.databaseChecksum,
      databaseVersion: verified.databaseVersion,
    };
    if (
      existing
      && existing.entryId === next.entryId
      && existing.kind === next.kind
      && existing.slug === next.slug
      && existing.releaseId === next.releaseId
      && existing.sourceChecksum === next.sourceChecksum
      && existing.databaseChecksum === next.databaseChecksum
      && existing.databaseVersion === next.databaseVersion
    ) continue;
    await tx.insert(contentReleaseItems).values(next).onConflictDoUpdate({
      target: contentReleaseItems.entryId,
      set: {
        kind: next.kind,
        slug: next.slug,
        releaseId: next.releaseId,
        sourceChecksum: next.sourceChecksum,
        databaseChecksum: next.databaseChecksum,
        databaseVersion: next.databaseVersion,
        updatedAt: new Date(),
      },
    });
  }
  return { releaseId: run.id };
}
