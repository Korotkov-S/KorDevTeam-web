import { createHash, timingSafeEqual } from "node:crypto";

import { VK_ADS_MCP_IMAGE_MAX_BYTES } from "./config";
import type {
  VkAdsAdGroupReadInput,
  VkAdsAdReadInput,
  VkAdsCampaignReadInput,
  VkAdsObjectKind,
  VkAdsReadPage,
  VkAdsStatisticsReadInput,
} from "./contracts";
import type { PrivateVkCreativeStore } from "./creativeStore";
import { redactVkAdsLogRecord, VkAdsError } from "./errors";
import type { VkAdsRepository } from "./repository";

type Cursor = { v: 1; lastSeenAt: string; id: string; filter: string };
type PageInput = { limit?: number; cursor?: string | null };

function contract(): never {
  throw new VkAdsError("ads_vk_contract_invalid");
}

function safeText(value: string): string {
  const redacted = redactVkAdsLogRecord(value);
  return typeof redacted === "string" ? redacted : "[redacted]";
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function fingerprint(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))), "utf8").digest("hex");
}

function encodeCursor(lastSeenAt: Date, id: string, filter: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, lastSeenAt: lastSeenAt.toISOString(), id, filter } satisfies Cursor), "utf8").toString("base64url");
  const digest = createHash("sha256").update(`kordevteam:vk-ads-cursor:v1:${payload}`, "utf8").digest("base64url");
  return `${payload}.${digest}`;
}

function decodeCursor(value: string | null | undefined, filter: string): { lastSeenAt: Date; id: string } | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || value.length < 10 || value.length > 1_024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)) return contract();
  const [payload, digest] = value.split(".");
  const expected = createHash("sha256").update(`kordevteam:vk-ads-cursor:v1:${payload}`, "utf8").digest();
  let actual: Buffer;
  try { actual = Buffer.from(digest, "base64url"); }
  catch { return contract(); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return contract();
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { return contract(); }
  if (!parsed || typeof parsed !== "object") return contract();
  const cursor = parsed as Partial<Cursor>;
  if (cursor.v !== 1 || cursor.filter !== filter || typeof cursor.id !== "string" ||
      !/^[0-9a-f-]{36}$/iu.test(cursor.id) || typeof cursor.lastSeenAt !== "string") return contract();
  const lastSeenAt = new Date(cursor.lastSeenAt);
  if (!Number.isFinite(lastSeenAt.getTime()) || lastSeenAt.toISOString() !== cursor.lastSeenAt) return contract();
  return { lastSeenAt, id: cursor.id };
}

function limit(input: PageInput): number {
  const value = input.limit ?? 50;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) return contract();
  return value;
}

function filterValue(value: string | undefined, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value.length > maximum) return contract();
  return value;
}

function page<T extends { id: string; lastSeenAt: Date }, R>(
  rows: T[],
  maximum: number,
  filter: string,
  map: (row: T) => R,
): VkAdsReadPage<R> {
  const hasMore = rows.length > maximum;
  const selected = rows.slice(0, maximum);
  const last = selected.at(-1);
  return {
    items: selected.map(map),
    nextCursor: hasMore && last ? encodeCursor(last.lastSeenAt, last.id, filter) : null,
  };
}

function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return contract();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return contract();
  return date;
}

function count(value: bigint): number | string {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

export function createVkAdsReadService(
  repository: VkAdsRepository,
  creativeStore: Pick<PrivateVkCreativeStore, "getImage">,
) {
  return {
    async getSyncStatus() {
      const run = await repository.getSyncStatusRow();
      return run ? {
        ...run,
        startedAt: run.startedAt.toISOString(),
        finishedAt: iso(run.finishedAt),
      } : null;
    },

    async listCampaigns(input: VkAdsCampaignReadInput): Promise<VkAdsReadPage<Record<string, unknown>>> {
      const maximum = limit(input);
      const status = filterValue(input.status, 80);
      const filter = fingerprint({ status: status ?? null });
      const after = decodeCursor(input.cursor, filter);
      const rows = await repository.listCampaignRows({ limit: maximum + 1, status, after });
      return page(rows, maximum, filter, (row) => ({
        accountExternalId: row.accountExternalId,
        externalId: row.externalId,
        name: safeText(row.name),
        status: row.status,
        objective: row.objective,
        campaignType: row.campaignType,
        budget: row.budget,
        schedule: row.schedule,
        sourceCreatedAt: iso(row.sourceCreatedAt),
        sourceUpdatedAt: iso(row.sourceUpdatedAt),
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        inactiveAt: iso(row.inactiveAt),
        fingerprint: row.fingerprint,
      }));
    },

    async listAdGroups(input: VkAdsAdGroupReadInput): Promise<VkAdsReadPage<Record<string, unknown>>> {
      const maximum = limit(input);
      const campaignExternalId = filterValue(input.campaignExternalId, 160);
      const status = filterValue(input.status, 80);
      const filter = fingerprint({ campaignExternalId: campaignExternalId ?? null, status: status ?? null });
      const after = decodeCursor(input.cursor, filter);
      const rows = await repository.listAdGroupRows({
        limit: maximum + 1,
        campaignExternalId,
        status,
        after,
      });
      return page(rows, maximum, filter, (row) => ({
        externalId: row.externalId,
        campaignExternalId: row.campaignExternalId,
        name: safeText(row.name),
        status: row.status,
        packageSummary: row.packageSummary,
        optimizationSummary: row.optimizationSummary,
        bidStrategySummary: row.bidStrategySummary,
        sourceCreatedAt: iso(row.sourceCreatedAt),
        sourceUpdatedAt: iso(row.sourceUpdatedAt),
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        inactiveAt: iso(row.inactiveAt),
        fingerprint: row.fingerprint,
      }));
    },

    async listAds(input: VkAdsAdReadInput): Promise<VkAdsReadPage<Record<string, unknown>>> {
      const maximum = limit(input);
      const campaignExternalId = filterValue(input.campaignExternalId, 160);
      const adGroupExternalId = filterValue(input.adGroupExternalId, 160);
      const status = filterValue(input.status, 80);
      const filter = fingerprint({
        campaignExternalId: campaignExternalId ?? null,
        adGroupExternalId: adGroupExternalId ?? null,
        status: status ?? null,
      });
      const after = decodeCursor(input.cursor, filter);
      const rows = await repository.listAdRows({
        limit: maximum + 1,
        campaignExternalId,
        adGroupExternalId,
        status,
        after,
      });
      return page(rows, maximum, filter, (row) => ({
        externalId: row.externalId,
        campaignExternalId: row.campaignExternalId,
        adGroupExternalId: row.adGroupExternalId,
        name: safeText(row.name),
        status: row.status,
        moderationStatus: row.moderationStatus,
        moderationReasonCode: row.moderationReasonCode,
        landingOrigin: row.landingOrigin,
        landingPath: row.landingPath,
        sourceCreatedAt: iso(row.sourceCreatedAt),
        sourceUpdatedAt: iso(row.sourceUpdatedAt),
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        inactiveAt: iso(row.inactiveAt),
        fingerprint: row.fingerprint,
      }));
    },

    async getAd(id: string) {
      if (!id || id.length > 160) return contract();
      const row = await repository.getAdRow(id);
      if (!row) return null;
      return {
        externalId: row.externalId,
        name: safeText(row.name),
        status: row.status,
        moderationStatus: row.moderationStatus,
        moderationReasonCode: row.moderationReasonCode,
        landingOrigin: row.landingOrigin,
        landingPath: row.landingPath,
        sourceCreatedAt: iso(row.sourceCreatedAt),
        sourceUpdatedAt: iso(row.sourceUpdatedAt),
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        inactiveAt: iso(row.inactiveAt),
        fingerprint: row.fingerprint,
        creative: row.creative ? {
          id: row.creative.id,
          mediaKind: row.creative.mediaKind,
          textBlocks: row.creative.textBlocks.map(safeText),
          cta: row.creative.cta ? safeText(row.creative.cta) : null,
          format: row.creative.format,
          width: row.creative.width,
          height: row.creative.height,
          durationSeconds: row.creative.durationSeconds,
          contentIds: row.creative.contentIds,
          hasImage: Boolean(row.creative.imageObjectKey),
          videoSourceUrl: row.creative.videoSourceUrl,
          activeFrom: row.creative.activeFrom.toISOString(),
          activeTo: iso(row.creative.activeTo),
        } : null,
      };
    },

    async getStatistics(input: VkAdsStatisticsReadInput) {
      if (!Array.isArray(input.externalIds) || input.externalIds.length < 1 || input.externalIds.length > 100 ||
          new Set(input.externalIds).size !== input.externalIds.length) return contract();
      const from = dateOnly(input.dateFrom);
      const to = dateOnly(input.dateTo);
      const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
      if (days < 1 || days > 366) return contract();
      const rows = await repository.getStatisticsRows(input);
      return rows.map((row) => ({
        objectKind: row.objectKind,
        externalId: row.externalId,
        metricDate: row.metricDate,
        timezone: row.timezone,
        spend: row.spend,
        impressions: count(row.impressions),
        reach: count(row.reach),
        clicks: count(row.clicks),
        conversions: row.conversions,
        sourceRevision: row.sourceRevision,
        fingerprint: row.fingerprint,
        collectedAt: row.collectedAt.toISOString(),
      }));
    },

    async getCreativeImage(id: string, maxBytes: number) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id) ||
          !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > VK_ADS_MCP_IMAGE_MAX_BYTES) return contract();
      const reference = await repository.getCreativeImageRef(id);
      if (!reference) return null;
      const image = await creativeStore.getImage(reference.objectKey);
      if (image.bytes.length > maxBytes) return contract();
      return image;
    },
  };
}

export type VkAdsReadService = ReturnType<typeof createVkAdsReadService>;
