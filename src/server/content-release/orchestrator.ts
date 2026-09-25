import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  applyArticleSourcesInTransaction,
} from "../content/articleSources";
import { applyCommercialServiceSourcesInTransaction } from "../content/commercialServices";
import type { ContentDatabase, ContentTransaction } from "../content/repository";
import {
  contentEntries,
  contentReleaseItems,
  contentReleaseRuns,
} from "../db/schema";
import {
  applyPortfolioImportInTransaction,
  planPortfolioImport,
} from "../portfolio/importer";
import { contentReleaseItemKey } from "./manifest";
import { planContentRelease, recordReleaseState } from "./planner";
import { databaseItemChecksum, desiredDatabaseItemChecksum } from "./state";
import type {
  ApplyReleaseApproval,
  ContentReleaseBundle,
  ContentReleaseManifest,
  ContentReleaseResult,
  ContentReleaseVerification,
  ContentReleaseVerificationIssue,
} from "./types";

function validateApproval(approval: ApplyReleaseApproval, manifest: ContentReleaseManifest): void {
  if (!/^[0-9a-f]{40}$/.test(approval.releaseSha)) throw new Error("content_release_sha_invalid");
  if (!/^[0-9a-f]{64}$/.test(approval.manifestChecksum)) throw new Error("content_release_manifest_checksum_invalid");
  if (!/^[0-9a-f]{64}$/.test(approval.planChecksum)) throw new Error("content_release_plan_checksum_invalid");
  if (approval.manifestChecksum !== manifest.checksum) throw new Error("content_release_manifest_changed");
}

export async function planRelease(
  db: ContentDatabase,
  manifest: ContentReleaseManifest,
) {
  return db.transaction(tx => planContentRelease(tx, manifest));
}

export async function verifyReleaseInTransaction(
  tx: ContentTransaction,
  manifest: ContentReleaseManifest,
  options: { requireOwnership?: boolean } = { requireOwnership: true },
): Promise<ContentReleaseVerification> {
  const requireOwnership = options.requireOwnership ?? true;
  const ownership = requireOwnership ? await tx.select().from(contentReleaseItems) : [];
  const ownedByKey = new Map(ownership.map(row => [
    contentReleaseItemKey(row.kind as "article" | "case" | "service" | "faq", row.slug),
    row,
  ]));
  const manifestKeys = new Set(manifest.items.map(item => item.key));
  const issues: ContentReleaseVerificationIssue[] = [];
  const items: ContentReleaseVerification["items"] = [];

  for (const desired of manifest.items) {
    const candidateSlugs = [...new Set([desired.slug, ...desired.aliases])];
    const candidates = await tx.select().from(contentEntries).where(and(
      eq(contentEntries.kind, desired.kind),
      inArray(contentEntries.slug, candidateSlugs),
    ));
    if (candidates.length === 0) {
      issues.push({ key: desired.key, code: "entry_missing" });
      continue;
    }
    if (candidates.length > 1) {
      issues.push({ key: desired.key, code: "alias_collision" });
      continue;
    }
    const entry = candidates[0];
    if (entry.slug !== desired.slug) issues.push({ key: desired.key, code: "alias_not_migrated" });
    if (entry.status !== "published") issues.push({ key: desired.key, code: "entry_not_published" });
    if (!entry.publishedAt) issues.push({ key: desired.key, code: "published_at_missing" });
    let databaseChecksum: string;
    try {
      databaseChecksum = await databaseItemChecksum(tx, entry, desired);
    } catch (error) {
      issues.push({
        key: desired.key,
        code: error instanceof Error ? error.message : "database_checksum_failed",
      });
      continue;
    }
    items.push({
      key: desired.key,
      entryId: entry.id,
      databaseChecksum,
      databaseVersion: entry.version,
    });
    if (databaseChecksum !== desiredDatabaseItemChecksum(desired)) {
      issues.push({ key: desired.key, code: "database_checksum_mismatch" });
    }
    if (requireOwnership) {
      const owned = ownedByKey.get(desired.key);
      if (!owned) {
        issues.push({ key: desired.key, code: "ownership_missing" });
      } else {
        if (owned.entryId !== entry.id) issues.push({ key: desired.key, code: "ownership_entry_mismatch" });
        if (owned.sourceChecksum !== desired.sourceChecksum) issues.push({ key: desired.key, code: "source_checksum_mismatch" });
        if (owned.databaseChecksum !== databaseChecksum) issues.push({ key: desired.key, code: "ownership_database_checksum_mismatch" });
        if (owned.databaseVersion !== entry.version) issues.push({ key: desired.key, code: "ownership_version_mismatch" });
      }
    }
  }

  if (requireOwnership) {
    for (const owned of ownership) {
      const key = contentReleaseItemKey(owned.kind as "article" | "case" | "service" | "faq", owned.slug);
      if (!manifestKeys.has(key)) issues.push({ key, code: "orphaned_owned" });
    }
  }
  const [latestRun] = requireOwnership
    ? await tx.select().from(contentReleaseRuns).orderBy(desc(contentReleaseRuns.committedAt), desc(contentReleaseRuns.id)).limit(1)
    : [];
  if (requireOwnership) {
    if (!latestRun) issues.push({ key: "$release", code: "release_run_missing" });
    else if (latestRun.manifestChecksum !== manifest.checksum) {
      issues.push({ key: "$release", code: "latest_manifest_checksum_mismatch" });
    }
  }
  const invalidKeys = new Set(issues.map(issue => issue.key));
  return {
    ok: issues.length === 0,
    manifestChecksum: manifest.checksum,
    releaseSha: latestRun?.releaseSha ?? null,
    latestManifestChecksum: latestRun?.manifestChecksum ?? null,
    counts: {
      valid: manifest.items.filter(item => !invalidKeys.has(item.key)).length,
      invalid: invalidKeys.size,
    },
    items,
    issues,
  };
}

export async function verifyRelease(
  db: ContentDatabase,
  manifest: ContentReleaseManifest,
): Promise<ContentReleaseVerification> {
  return db.transaction(tx => verifyReleaseInTransaction(tx, manifest));
}

export async function applyRelease(
  db: ContentDatabase,
  bundle: ContentReleaseBundle,
  approval: ApplyReleaseApproval,
  hooks: { afterPortfolio?: () => void | Promise<void> } = {},
): Promise<ContentReleaseResult> {
  const { manifest, articleSources, portfolioSources, serviceSources } = bundle;
  validateApproval(approval, manifest);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(706027)`);
    const lockedPlan = await planContentRelease(tx, manifest, { forUpdate: true });
    if (lockedPlan.blocked) throw new Error("content_release_blocked");
    if (lockedPlan.planChecksum !== approval.planChecksum) throw new Error("content_release_plan_changed");

    await applyArticleSourcesInTransaction(tx, articleSources, { insertMissing: true });
    const portfolioPlan = await planPortfolioImport(tx, portfolioSources);
    await applyPortfolioImportInTransaction(tx, portfolioPlan);
    await hooks.afterPortfolio?.();
    await applyCommercialServiceSourcesInTransaction(tx, serviceSources);

    const result = {
      inserted: lockedPlan.counts.insert,
      updated: lockedPlan.counts.update,
      unchanged: lockedPlan.counts.unchanged,
    };
    const verification = await verifyReleaseInTransaction(tx, manifest, { requireOwnership: false });
    if (!verification.ok) throw new Error("content_release_post_apply_mismatch");
    await recordReleaseState(tx, {
      releaseSha: approval.releaseSha,
      manifest,
      items: verification.items,
      counts: result,
    });
    const recorded = await verifyReleaseInTransaction(tx, manifest);
    if (!recorded.ok) throw new Error("content_release_post_apply_mismatch");
    return result;
  });
}
