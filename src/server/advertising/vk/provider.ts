import type {
  VkAdsAccountSource,
  VkAdsAdGroupSource,
  VkAdsAdSource,
  VkAdsCampaignSource,
  VkAdsDailyMetricSource,
  VkAdsMediaKind,
  VkAdsObjectKind,
  VkAdsPage,
  VkAdsProviderPageInput,
} from "./contracts";
import { VK_ADS_ORIGIN } from "./config";
import type { DownloadedVkCreativeImage } from "./creativeDownloader";
import { redactVkAdsLogRecord, VkAdsError, type VkAdsErrorCode } from "./errors";
import type { VkAdsTokenManager } from "./tokenManager";
import {
  vkAdsAccountWireSchema,
  vkAdsAdGroupWireSchema,
  vkAdsAdWireSchema,
  vkAdsCampaignWireSchema,
  vkAdsPageWireSchema,
  vkAdsProviderErrorWireSchema,
  vkAdsStatisticsWireSchema,
} from "./providerSchemas";

const PATHS = {
  campaigns: "/api/v2/ad_plans.json",
  adGroups: "/api/v2/ad_groups.json",
  ads: "/api/v2/banners.json",
  statistics: {
    campaign: "/api/v2/statistics/ad_plans/day.json",
    ad_group: "/api/v2/statistics/ad_groups/day.json",
    ad: "/api/v2/statistics/banners/day.json",
  },
} as const;
type ReadPath = typeof PATHS.campaigns | typeof PATHS.adGroups | typeof PATHS.ads |
  typeof PATHS.statistics[keyof typeof PATHS.statistics];
const READ_PATHS = new Set<string>([
  PATHS.campaigns,
  PATHS.adGroups,
  PATHS.ads,
  ...Object.values(PATHS.statistics),
]);
const ALL_STATUSES = "active,blocked,deleted";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_STATISTICS_IDS = 10_000;
const STATISTICS_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 4;

export type VkAdsCreativeDownload = DownloadedVkCreativeImage;

type VkAdsProviderDependencies = {
  tokenManager: Pick<VkAdsTokenManager, "getAccessToken" | "forceRefresh">;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  jitter?: () => number;
  testOrigin?: URL;
  downloader?: (source: URL) => Promise<VkAdsCreativeDownload>;
};

export type VkAdsProvider = {
  checkAccount(): Promise<VkAdsAccountSource>;
  listCampaigns(page: VkAdsProviderPageInput): Promise<VkAdsPage<VkAdsCampaignSource>>;
  listAdGroups(page: VkAdsProviderPageInput, changedSince?: string): Promise<VkAdsPage<VkAdsAdGroupSource>>;
  listAds(page: VkAdsProviderPageInput, changedSince?: string): Promise<VkAdsPage<VkAdsAdSource>>;
  getDailyStatistics(
    kind: VkAdsObjectKind,
    ids: string[],
    dateFrom: string,
    dateTo: string,
  ): Promise<VkAdsDailyMetricSource[]>;
  downloadCreativeImage(source: URL): Promise<VkAdsCreativeDownload>;
};

function fail(code: VkAdsErrorCode): never {
  throw new VkAdsError(code);
}

function contract(): never {
  return fail("ads_vk_contract_invalid");
}

function validateOrigin(origin: URL): URL {
  if (!origin || !["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) return fail("ads_vk_config_invalid");
  return new URL(origin.href);
}

async function discard(response: Response): Promise<void> {
  try { await response.body?.cancel(); }
  catch { /* The status alone is sufficient for retry classification. */ }
}

async function boundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) return contract();
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) return contract();
  if (!response.body) return contract();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return contract();
      }
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof VkAdsError) throw error;
    return contract();
  } finally {
    reader.releaseLock();
  }
}

function pageInput(value: VkAdsProviderPageInput): VkAdsProviderPageInput {
  if (!value || !Number.isSafeInteger(value.offset) || value.offset < 0 ||
      !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 250) return contract();
  return value;
}

function canonicalTimestamp(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return contract();
  return new Date(milliseconds).toISOString();
}

function optionalTimestamp(value: string | null | undefined): string | null {
  return value == null ? null : canonicalTimestamp(value);
}

function isoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return contract();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return contract();
  return date;
}

function changedSince(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return canonicalTimestamp(value);
}

function safeText(value: string): string {
  const redacted = redactVkAdsLogRecord(value);
  return typeof redacted === "string" ? redacted : "[redacted]";
}

function httpsUrl(value: string | null | undefined, stripQuery: boolean): string | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); }
  catch { return contract(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname) return contract();
  if (stripQuery) {
    url.search = "";
    url.hash = "";
  }
  return url.href;
}

function landing(value: string | null | undefined): { landingOrigin: string | null; landingPath: string | null } {
  if (!value) return { landingOrigin: null, landingPath: null };
  const safe = httpsUrl(value, true);
  if (!safe) return { landingOrigin: null, landingPath: null };
  const url = new URL(safe);
  return { landingOrigin: url.origin, landingPath: url.pathname };
}

function uniqueAndSorted<T extends { externalId: string }>(items: T[]): T[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.externalId)) return contract();
    ids.add(item.externalId);
  }
  return items.sort((left, right) => left.externalId.localeCompare(right.externalId, "en"));
}

function nextOffset(
  offset: number,
  count: number,
  itemCount: number,
  wire: number | null | undefined,
): number | null {
  const next = wire === undefined ? (offset + itemCount < count ? offset + itemCount : null) : wire;
  if (next !== null && (next <= offset || next > count)) return contract();
  if (next !== null && itemCount === 0) return contract();
  if (next === null && offset + itemCount < count) return contract();
  return next;
}

function retryDelay(attempt: number, jitter: () => number): number {
  const source = jitter();
  const bounded = Number.isFinite(source) && source >= 0 && source < 1 ? source : 0;
  const base = 250 * (2 ** attempt);
  return Math.min(60_000, Math.round(base + base * 0.25 * bounded));
}

function retryAfter(response: Response, fallback: number): number {
  const value = response.headers.get("retry-after");
  if (value && /^\d+$/u.test(value)) return Math.min(60_000, Number(value) * 1_000);
  return fallback;
}

export function createVkAdsProvider(dependencies: VkAdsProviderDependencies): VkAdsProvider {
  const origin = dependencies.testOrigin ? validateOrigin(dependencies.testOrigin) : new URL(VK_ADS_ORIGIN);
  const requestFetch = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const jitter = dependencies.jitter ?? Math.random;

  const request = async (path: ReadPath, query: Record<string, string>): Promise<unknown> => {
    if (!READ_PATHS.has(path)) return contract();
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries({ ...query, sorting: "id" })) url.searchParams.set(key, value);
    let accessToken = await dependencies.tokenManager.getAccessToken();
    let forcedRefresh = false;
    let attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      let response: Response;
      try {
        response = await requestFetch(url, {
          method: "GET",
          headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
          redirect: "error",
        });
      } catch {
        if (++attempt >= MAX_ATTEMPTS) return fail("ads_vk_provider_unavailable");
        await sleep(retryDelay(attempt - 1, jitter));
        continue;
      }

      if (response.status === 401) {
        const parsed = vkAdsProviderErrorWireSchema.safeParse(await boundedJson(response));
        const providerCode = parsed.success ? parsed.data.error : "";
        if (providerCode === "expired_token" && !forcedRefresh) {
          forcedRefresh = true;
          accessToken = await dependencies.tokenManager.forceRefresh(accessToken);
          attempt += 1;
          continue;
        }
        if (providerCode === "expired_token") return fail("ads_vk_token_expired");
        if (["invalid_token", "revoked_token"].includes(providerCode)) return fail("ads_vk_token_revoked");
        return fail("ads_vk_oauth_invalid");
      }

      if (response.status === 429) {
        await discard(response);
        if (++attempt >= MAX_ATTEMPTS) return fail("ads_vk_rate_limited");
        await sleep(retryAfter(response, retryDelay(attempt - 1, jitter)));
        continue;
      }
      if (response.status >= 500 && response.status <= 599) {
        await discard(response);
        if (++attempt >= MAX_ATTEMPTS) return fail("ads_vk_provider_unavailable");
        await sleep(retryDelay(attempt - 1, jitter));
        continue;
      }
      if (!response.ok) {
        await discard(response);
        return fail("ads_vk_provider_unavailable");
      }
      return boundedJson(response);
    }
    return fail("ads_vk_provider_unavailable");
  };

  const listQuery = (page: VkAdsProviderPageInput, since?: string): Record<string, string> => {
    const valid = pageInput(page);
    return {
      offset: String(valid.offset),
      limit: String(valid.limit),
      status: ALL_STATUSES,
      ...(since === undefined ? {} : { updated_since: changedSince(since)! }),
    };
  };

  return {
    async checkAccount() {
      const raw = await request(PATHS.campaigns, listQuery({ offset: 0, limit: 1 }));
      const parsed = vkAdsPageWireSchema(vkAdsCampaignWireSchema).safeParse(raw);
      if (!parsed.success || !parsed.data.account) return contract();
      const account = vkAdsAccountWireSchema.parse(parsed.data.account);
      return {
        externalId: account.id,
        accountType: account.account_type ?? null,
        displayName: account.name ? safeText(account.name) : null,
        currency: account.currency ?? null,
        timezone: account.timezone ?? null,
        sourceUpdatedAt: optionalTimestamp(account.updated),
      };
    },

    async listCampaigns(page) {
      const valid = pageInput(page);
      const parsed = vkAdsPageWireSchema(vkAdsCampaignWireSchema).safeParse(
        await request(PATHS.campaigns, listQuery(valid)),
      );
      if (!parsed.success) return contract();
      const items = uniqueAndSorted(parsed.data.items.map((item) => ({
        externalId: item.id,
        accountExternalId: item.account_id,
        name: safeText(item.name),
        status: item.status,
        objective: item.objective ?? null,
        campaignType: item.campaign_type ?? null,
        budget: item.budget ?? null,
        schedule: item.schedule,
        sourceCreatedAt: optionalTimestamp(item.created),
        sourceUpdatedAt: optionalTimestamp(item.updated),
      })));
      return { items, nextOffset: nextOffset(valid.offset, parsed.data.count, items.length, parsed.data.next_offset) };
    },

    async listAdGroups(page, since) {
      const valid = pageInput(page);
      const parsed = vkAdsPageWireSchema(vkAdsAdGroupWireSchema).safeParse(
        await request(PATHS.adGroups, listQuery(valid, since)),
      );
      if (!parsed.success) return contract();
      const items = uniqueAndSorted(parsed.data.items.map((item) => ({
        externalId: item.id,
        accountExternalId: item.account_id,
        campaignExternalId: item.ad_plan_id,
        name: safeText(item.name),
        status: item.status,
        packageSummary: item.package ?? null,
        optimizationSummary: item.optimization ?? null,
        bidStrategySummary: item.bid_strategy ?? null,
        targetingLabels: item.targeting_labels.map(safeText),
        sourceCreatedAt: optionalTimestamp(item.created),
        sourceUpdatedAt: optionalTimestamp(item.updated),
      })));
      return { items, nextOffset: nextOffset(valid.offset, parsed.data.count, items.length, parsed.data.next_offset) };
    },

    async listAds(page, since) {
      const valid = pageInput(page);
      const parsed = vkAdsPageWireSchema(vkAdsAdWireSchema).safeParse(
        await request(PATHS.ads, listQuery(valid, since)),
      );
      if (!parsed.success) return contract();
      const items = uniqueAndSorted(parsed.data.items.map((item) => {
        const safeLanding = landing(item.landing_url);
        return {
          externalId: item.id,
          accountExternalId: item.account_id,
          campaignExternalId: item.ad_plan_id,
          adGroupExternalId: item.ad_group_id,
          name: safeText(item.name),
          status: item.status,
          moderationStatus: item.moderation_status ?? null,
          moderationReasonCode: item.moderation_reason_code && /^[a-z0-9_:-]{1,160}$/iu.test(item.moderation_reason_code)
            ? item.moderation_reason_code
            : null,
          ...safeLanding,
          sourceCreatedAt: optionalTimestamp(item.created),
          sourceUpdatedAt: optionalTimestamp(item.updated),
          creative: {
            mediaKind: item.creative.media_kind as VkAdsMediaKind,
            format: item.creative.format ?? null,
            textBlocks: item.creative.text_blocks.map(safeText),
            cta: item.creative.cta ? safeText(item.creative.cta) : null,
            width: item.creative.width ?? null,
            height: item.creative.height ?? null,
            durationSeconds: item.creative.duration_seconds ?? null,
            contentIds: item.creative.content_ids,
            imageSourceUrl: httpsUrl(item.creative.image_url, false),
            videoSourceUrl: httpsUrl(item.creative.video_url, true),
          },
        };
      }));
      return { items, nextOffset: nextOffset(valid.offset, parsed.data.count, items.length, parsed.data.next_offset) };
    },

    async getDailyStatistics(kind, ids, dateFrom, dateTo) {
      const from = isoDate(dateFrom);
      const to = isoDate(dateTo);
      const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
      if (days < 1 || days > 366 || !Array.isArray(ids) || ids.length < 1 || ids.length > MAX_STATISTICS_IDS) return contract();
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length !== ids.length || uniqueIds.some((id) => !/^[A-Za-z0-9_-]{1,160}$/u.test(id))) return contract();
      const metrics: VkAdsDailyMetricSource[] = [];
      for (let index = 0; index < uniqueIds.length; index += STATISTICS_BATCH_SIZE) {
        const batch = uniqueIds.slice(index, index + STATISTICS_BATCH_SIZE);
        const parsed = vkAdsStatisticsWireSchema.safeParse(await request(PATHS.statistics[kind], {
          ids: batch.join(","),
          date_from: dateFrom,
          date_to: dateTo,
        }));
        if (!parsed.success) return contract();
        for (const item of parsed.data.items) {
          if (!batch.includes(item.id) || item.date < dateFrom || item.date > dateTo) return contract();
          metrics.push({
            objectKind: kind,
            externalId: item.id,
            metricDate: isoDate(item.date).toISOString().slice(0, 10),
            timezone: item.timezone,
            spend: item.spend,
            impressions: item.impressions,
            reach: item.reach,
            clicks: item.clicks,
            conversions: item.conversions,
            sourceRevision: item.revision ?? null,
          });
        }
      }
      return metrics.sort((left, right) => left.metricDate.localeCompare(right.metricDate) || left.externalId.localeCompare(right.externalId));
    },

    async downloadCreativeImage(source) {
      if (!(source instanceof URL) || source.protocol !== "https:" || !dependencies.downloader) {
        return fail("ads_vk_storage_unavailable");
      }
      return dependencies.downloader(new URL(source.href));
    },
  };
}
