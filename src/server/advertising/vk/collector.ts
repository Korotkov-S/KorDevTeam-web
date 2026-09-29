import { randomUUID } from "node:crypto";

import type {
  VkAdsAdRecord,
  VkAdsCheckpoint,
  VkAdsCreativeVersionRecord,
  VkAdsDailyMetricRecord,
  VkAdsObjectKind,
  VkAdsSyncMode,
  VkAdsSyncReport,
} from "./contracts";
import type { PrivateVkCreativeStore } from "./creativeStore";
import { dailyLookbackWindow, moscowCalendarDate, splitDateWindows } from "./dateWindows";
import { VkAdsError, type VkAdsErrorCode } from "./errors";
import type { VkAdsLockFactory } from "./locks";
import type { VkAdsProvider } from "./provider";
import type { VkAdsRepository } from "./repository";

const pageSize = 250;
const statisticsWindowDays = 31;
const objectKinds: VkAdsObjectKind[] = ["campaign", "ad_group", "ad"];

type CollectorDependencies = {
  provider: VkAdsProvider;
  repository: VkAdsRepository;
  store: Pick<PrivateVkCreativeStore, "checkReady" | "putImage">;
  locks: Pick<VkAdsLockFactory, "tryAcquireSyncLease">;
  now(): Date;
  afterPageCommitted?: (context: { phase: string; offset: number }) => void | Promise<void>;
};

type ActiveRun = { id: string; correlationId: string };

function errorCode(error: unknown): VkAdsErrorCode {
  return error instanceof VkAdsError ? error.code : "ads_vk_unavailable";
}

function invalid(): never {
  throw new VkAdsError("ads_vk_contract_invalid");
}

function nextKind(kind: VkAdsObjectKind): VkAdsObjectKind | null {
  const index = objectKinds.indexOf(kind);
  return objectKinds[index + 1] ?? null;
}

function minusOneDay(value: Date | null): string | undefined {
  if (!value) return undefined;
  return new Date(value.getTime() - 86_400_000).toISOString();
}

function validateNextOffset(current: number, next: number | null): void {
  if (next !== null && (!Number.isSafeInteger(next) || next <= current)) invalid();
}

function duplicateIds<T extends { externalId: string }>(seen: Set<string>, items: T[]): void {
  for (const item of items) {
    if (seen.has(item.externalId)) invalid();
    seen.add(item.externalId);
  }
}

function entityCheckpoint(phase: "campaigns" | "ad_groups" | "ads", offset: number): VkAdsCheckpoint {
  return { schemaVersion: 1, phase, offset };
}

function statisticsCheckpoint(
  kind: VkAdsObjectKind,
  dateFrom: string,
  dateTo: string,
  nextDate: string,
): VkAdsCheckpoint {
  return { schemaVersion: 1, phase: "statistics", objectKind: kind, dateFrom, dateTo, nextDate };
}

function observedRecord<T extends Record<string, unknown>>(source: T, observedAt: string): T & {
  fingerprint: string;
  firstSeenAt: string;
  lastSeenAt: string;
  inactiveAt: null;
} {
  return { ...source, fingerprint: "", firstSeenAt: observedAt, lastSeenAt: observedAt, inactiveAt: null };
}

async function currentCounters(repository: VkAdsRepository): Promise<Record<string, number>> {
  return (await repository.getSyncStatusRow())?.counters ?? {};
}

export function createVkAdsCollector(dependencies: CollectorDependencies) {
  const notifyCommit = async (phase: string, offset: number) => {
    await dependencies.afterPageCommitted?.({ phase, offset });
  };

  const finish = async (
    run: ActiveRun,
    mode: Exclude<VkAdsSyncMode, "check">,
    status: "succeeded" | "partial" | "failed",
    code: VkAdsErrorCode | null,
    coveredDateFrom: string | null,
    coveredDateTo: string | null,
  ): Promise<VkAdsSyncReport> => {
    await dependencies.repository.finishRun(run.id, {
      status,
      errorCode: code,
      coveredDateFrom,
      coveredDateTo,
    });
    return {
      mode,
      status,
      errorCode: code,
      correlationId: run.correlationId,
      counters: await currentCounters(dependencies.repository),
      coveredDateFrom,
      coveredDateTo,
    };
  };

  const prepareCreative = async (
    ad: Awaited<ReturnType<VkAdsProvider["listAds"]>>["items"][number],
    observedAt: string,
    imageKeys: Map<string, string>,
  ): Promise<VkAdsCreativeVersionRecord> => {
    let imageSha256: string | null = null;
    let imageObjectKey: string | null = null;
    if (ad.creative.mediaKind === "image" && ad.creative.imageSourceUrl) {
      const downloaded = await dependencies.provider.downloadCreativeImage(new URL(ad.creative.imageSourceUrl));
      imageSha256 = downloaded.sha256;
      imageObjectKey = imageKeys.get(downloaded.sha256) ?? await dependencies.repository.findStoredImageBySha256(downloaded.sha256);
      if (!imageObjectKey) {
        imageObjectKey = (await dependencies.store.putImage(downloaded)).objectKey;
      }
      imageKeys.set(downloaded.sha256, imageObjectKey);
    }
    return {
      ...ad.creative,
      adExternalId: ad.externalId,
      accountExternalId: ad.accountExternalId,
      fingerprint: "",
      imageSha256,
      imageObjectKey,
      activeFrom: ad.sourceUpdatedAt ?? observedAt,
      activeTo: null,
    };
  };

  const runStatistics = async (
    run: ActiveRun,
    checkpoint: Extract<VkAdsCheckpoint, { phase: "statistics" }>,
    observedAt: string,
  ): Promise<void> => {
    let kind: VkAdsObjectKind | null = checkpoint.objectKind;
    let resumeDate = checkpoint.nextDate;
    while (kind) {
      const ids = await dependencies.repository.listExternalIds(kind);
      const windows = splitDateWindows(checkpoint.dateFrom, checkpoint.dateTo, statisticsWindowDays)
        .filter((window) => window.dateFrom >= resumeDate);
      for (let index = 0; index < windows.length; index += 1) {
        const window = windows[index];
        const source = ids.length === 0
          ? []
          : await dependencies.provider.getDailyStatistics(kind, ids, window.dateFrom, window.dateTo);
        const metricKeys = new Set<string>();
        for (const metric of source) {
          const key = `${metric.objectKind}\0${metric.externalId}\0${metric.metricDate}`;
          if (metricKeys.has(key)) invalid();
          metricKeys.add(key);
        }
        const metrics: VkAdsDailyMetricRecord[] = source.map((metric) => ({
          ...metric,
          fingerprint: "",
          collectedAt: observedAt,
        }));
        const followingWindow = windows[index + 1];
        const followingKind = nextKind(kind);
        const nextCheckpoint = followingWindow
          ? statisticsCheckpoint(kind, checkpoint.dateFrom, checkpoint.dateTo, followingWindow.dateFrom)
          : followingKind
            ? statisticsCheckpoint(followingKind, checkpoint.dateFrom, checkpoint.dateTo, checkpoint.dateFrom)
            : null;
        await dependencies.repository.storeMetricWindow({
          runId: run.id,
          items: metrics,
          checkpoint: nextCheckpoint,
          counters: { metrics: metrics.length, statisticWindows: 1 },
          stage: nextCheckpoint ? "statistics" : "complete",
        });
        await notifyCommit(`statistics:${kind}`, index);
      }
      kind = nextKind(kind);
      resumeDate = checkpoint.dateFrom;
    }
  };

  const runSync = async (mode: "backfill" | "daily"): Promise<VkAdsSyncReport> => {
    const observed = dependencies.now();
    if (!(observed instanceof Date) || !Number.isFinite(observed.getTime())) invalid();
    const observedAt = observed.toISOString();
    let run: ActiveRun;
    let checkpoint: VkAdsCheckpoint;
    if (mode === "backfill") {
      const resumable = await dependencies.repository.findResumableBackfill();
      if (resumable) {
        run = resumable.status === "partial"
          ? await dependencies.repository.resumeBackfillRun(resumable.id)
          : { id: resumable.id, correlationId: resumable.correlationId };
        if (resumable.stage === "complete" && resumable.checkpoint === null) {
          return finish(run, mode, "succeeded", null, resumable.coveredDateFrom ?? null, resumable.coveredDateTo ?? null);
        }
        checkpoint = resumable.checkpoint ?? entityCheckpoint("campaigns", 0);
      } else {
        checkpoint = entityCheckpoint("campaigns", 0);
        run = await dependencies.repository.startRun({ mode, stage: "campaigns", checkpoint });
      }
    } else {
      checkpoint = entityCheckpoint("campaigns", 0);
      run = await dependencies.repository.startRun({ mode, stage: "campaigns", checkpoint });
    }

    let committed = Object.values(await currentCounters(dependencies.repository)).reduce((sum, value) => sum + value, 0);
    let coveredDateFrom: string | null = null;
    let coveredDateTo: string | null = null;
    try {
      const account = await dependencies.provider.checkAccount();
      await dependencies.repository.storeAccount(observedRecord(account, observedAt));

      const groupSince = mode === "daily" ? minusOneDay(await dependencies.repository.getLatestSourceUpdate("ad_group")) : undefined;
      const adSince = mode === "daily" ? minusOneDay(await dependencies.repository.getLatestSourceUpdate("ad")) : undefined;

      if (checkpoint.phase === "campaigns") {
        const seen = new Set<string>();
        let offset = checkpoint.offset;
        while (true) {
          const page = await dependencies.provider.listCampaigns({ offset, limit: pageSize });
          validateNextOffset(offset, page.nextOffset);
          duplicateIds(seen, page.items);
          const next = page.nextOffset === null ? entityCheckpoint("ad_groups", 0) : entityCheckpoint("campaigns", page.nextOffset);
          await dependencies.repository.storeCampaignPage({
            runId: run.id,
            items: page.items.map((item) => observedRecord(item, observedAt)),
            checkpoint: next,
            counters: { campaigns: page.items.length, entityPages: 1 },
            stage: next.phase,
          });
          committed += page.items.length + 1;
          await notifyCommit("campaigns", offset);
          if (page.nextOffset === null) { checkpoint = next; break; }
          offset = page.nextOffset;
        }
      }

      if (checkpoint.phase === "ad_groups") {
        const seen = new Set<string>();
        let offset = checkpoint.offset;
        while (true) {
          const page = await dependencies.provider.listAdGroups({ offset, limit: pageSize }, groupSince);
          validateNextOffset(offset, page.nextOffset);
          duplicateIds(seen, page.items);
          const next = page.nextOffset === null ? entityCheckpoint("ads", 0) : entityCheckpoint("ad_groups", page.nextOffset);
          await dependencies.repository.storeAdGroupPage({
            runId: run.id,
            items: page.items.map((item) => observedRecord(item, observedAt)),
            checkpoint: next,
            counters: { adGroups: page.items.length, entityPages: 1 },
            stage: next.phase,
          });
          committed += page.items.length + 1;
          await notifyCommit("ad_groups", offset);
          if (page.nextOffset === null) { checkpoint = next; break; }
          offset = page.nextOffset;
        }
      }

      if (checkpoint.phase === "ads") {
        const seen = new Set<string>();
        const imageKeys = new Map<string, string>();
        let offset = checkpoint.offset;
        while (true) {
          const page = await dependencies.provider.listAds({ offset, limit: pageSize }, adSince);
          validateNextOffset(offset, page.nextOffset);
          duplicateIds(seen, page.items);
          const creatives: VkAdsCreativeVersionRecord[] = [];
          for (const ad of page.items) creatives.push(await prepareCreative(ad, observedAt, imageKeys));

          let next: VkAdsCheckpoint | null;
          if (page.nextOffset !== null) {
            next = entityCheckpoint("ads", page.nextOffset);
          } else if (mode === "daily") {
            const window = dailyLookbackWindow(observed);
            next = statisticsCheckpoint("campaign", window.dateFrom, window.dateTo, window.dateFrom);
          } else {
            next = null;
          }
          if (page.nextOffset === null && mode === "backfill") {
            const earliest = await dependencies.repository.getEarliestCampaignCreatedAt();
            if (earliest) {
              const dateFrom = moscowCalendarDate(earliest);
              const dateTo = moscowCalendarDate(observed);
              splitDateWindows(dateFrom, dateTo, statisticsWindowDays);
              next = statisticsCheckpoint("campaign", dateFrom, dateTo, dateFrom);
            } else {
              next = null;
            }
          }
          const ads: VkAdsAdRecord[] = page.items.map(({ creative: _creative, ...item }) => observedRecord(item, observedAt));
          await dependencies.repository.storeAdPage({
            runId: run.id,
            items: ads,
            creatives,
            checkpoint: next,
            counters: { ads: ads.length, creatives: creatives.length, entityPages: 1 },
            stage: next ? next.phase : "entities_complete",
          });
          committed += ads.length + creatives.length + 1;
          await notifyCommit("ads", offset);
          if (page.nextOffset === null) {
            if (!next) return finish(run, mode, "partial", "ads_vk_sync_partial", null, null);
            checkpoint = next;
            break;
          }
          offset = page.nextOffset;
        }
      }

      if (checkpoint.phase !== "statistics") invalid();
      coveredDateFrom = checkpoint.dateFrom;
      coveredDateTo = checkpoint.dateTo;
      await runStatistics(run, checkpoint, observedAt);
      return finish(run, mode, "succeeded", null, coveredDateFrom, coveredDateTo);
    } catch (error) {
      const code = errorCode(error);
      return finish(run, mode, committed > 0 ? "partial" : "failed", code, coveredDateFrom, coveredDateTo);
    }
  };

  return {
    async run(mode: VkAdsSyncMode): Promise<VkAdsSyncReport> {
      const correlationId = randomUUID();
      let lease;
      try {
        lease = await dependencies.locks.tryAcquireSyncLease();
      } catch {
        return { mode, status: "failed", errorCode: "ads_vk_unavailable", correlationId, counters: {}, coveredDateFrom: null, coveredDateTo: null };
      }
      if (!lease) {
        return { mode, status: "failed", errorCode: "ads_vk_sync_locked", correlationId, counters: {}, coveredDateFrom: null, coveredDateTo: null };
      }
      let report: VkAdsSyncReport;
      try {
        if (mode === "check") {
          await dependencies.repository.checkReady();
          await dependencies.provider.checkAccount();
          await dependencies.store.checkReady();
          report = { mode, status: "succeeded", errorCode: null, correlationId, counters: {}, coveredDateFrom: null, coveredDateTo: null };
        } else {
          report = await runSync(mode);
        }
      } catch (error) {
        report = { mode, status: "failed", errorCode: errorCode(error), correlationId, counters: {}, coveredDateFrom: null, coveredDateTo: null };
      }
      try {
        await lease.release();
      } catch {
        if (report.status === "succeeded") report = { ...report, status: "failed", errorCode: "ads_vk_unavailable" };
      }
      return report;
    },
  };
}

export type VkAdsCollector = ReturnType<typeof createVkAdsCollector>;
