import { MissingPrivateObjectError, type PrivateAttachmentStore } from "./objectStore";
import type { LeadRepository } from "./repository";

const DEFAULT_LIMIT = 100;
const ORPHAN_MINIMUM_AGE_MS = 2 * 60 * 60_000;

export type RetentionReport = {
  deletedLeads: number;
  deletedObjects: number;
  deletedOrphans: number;
  deletedRateLimits: number;
  failures: number;
};

export type RetentionLogRecord = {
  event: "lead_retention_item_failed" | "lead_retention_completed";
  leadId?: string;
  errorCode?: "storage_error" | "repository_error";
  deletedLeads?: number;
  deletedObjects?: number;
  deletedOrphans?: number;
  deletedRateLimits?: number;
  failures?: number;
};

export type RetentionOptions = {
  repository: Pick<LeadRepository, "findExpiredLeads" | "attachmentKeyExists" | "deleteLeadAfterObject" | "deleteExpiredRateLimits">;
  store: Pick<PrivateAttachmentStore, "deleteForRetention" | "listOlderThan">;
  clock: { now(): Date };
  limit?: number;
  logger?: { write(record: RetentionLogRecord): void };
};

function batchLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_LIMIT) throw new Error("lead_retention_limit_invalid");
  return limit;
}

function failed(report: RetentionReport, options: RetentionOptions, errorCode: "storage_error" | "repository_error", leadId?: string): void {
  report.failures += 1;
  options.logger?.write({ event: "lead_retention_item_failed", errorCode, ...(leadId ? { leadId } : {}) });
}

async function deleteExpiredLeads(options: RetentionOptions, report: RetentionReport, limit: number): Promise<void> {
  let leads;
  try { leads = await options.repository.findExpiredLeads(limit); }
  catch { failed(report, options, "repository_error"); return; }

  for (const lead of leads.slice(0, limit)) {
    if (lead.objectKey) {
      try {
        const result = await options.store.deleteForRetention(lead.objectKey);
        if (result === "deleted") report.deletedObjects += 1;
      } catch (error) {
        if (!(error instanceof MissingPrivateObjectError)) {
          failed(report, options, "storage_error", lead.id);
          continue;
        }
      }
    }
    try {
      if (await options.repository.deleteLeadAfterObject(lead.id)) report.deletedLeads += 1;
      else failed(report, options, "repository_error", lead.id);
    } catch {
      failed(report, options, "repository_error", lead.id);
    }
  }
}

async function deleteOrphans(options: RetentionOptions, report: RetentionReport, limit: number, cutoff: Date): Promise<void> {
  let actions = 0;
  try {
    for await (const object of options.store.listOlderThan(cutoff)) {
      if (!(object.lastModified < cutoff)) continue;
      actions += 1;
      let referenced: boolean;
      try { referenced = await options.repository.attachmentKeyExists(object.key); }
      catch { failed(report, options, "repository_error"); if (actions >= limit) break; continue; }
      if (referenced) { if (actions >= limit) break; continue; }
      try {
        if (await options.store.deleteForRetention(object.key) === "deleted") report.deletedOrphans += 1;
      } catch (error) {
        if (!(error instanceof MissingPrivateObjectError)) failed(report, options, "storage_error");
      }
      if (actions >= limit) break;
    }
  } catch {
    failed(report, options, "storage_error");
  }
}

async function deleteExpiredRateLimits(options: RetentionOptions, report: RetentionReport, limit: number): Promise<void> {
  try {
    report.deletedRateLimits = await options.repository.deleteExpiredRateLimits(limit);
  } catch {
    failed(report, options, "repository_error");
  }
}

export async function runLeadRetention(options: RetentionOptions): Promise<RetentionReport> {
  const limit = batchLimit(options.limit);
  const now = options.clock.now();
  if (!Number.isFinite(+now)) throw new Error("lead_retention_clock_invalid");
  const report: RetentionReport = { deletedLeads: 0, deletedObjects: 0, deletedOrphans: 0, deletedRateLimits: 0, failures: 0 };
  await deleteExpiredLeads(options, report, limit);
  await deleteOrphans(options, report, limit, new Date(+now - ORPHAN_MINIMUM_AGE_MS));
  await deleteExpiredRateLimits(options, report, limit);
  options.logger?.write({ event: "lead_retention_completed", ...report });
  return report;
}
