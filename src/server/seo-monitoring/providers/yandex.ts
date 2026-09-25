import type { NormalizedSeoObservation, SeoDevice, YandexSeoConfig } from "../contracts";
import { normalizeSeoQuery, normalizeSitePath } from "../normalization";
import { boundedRetryAfter, SeoProviderError } from "./provider-error";

export { SeoProviderError } from "./provider-error";

const API_ORIGIN = "https://api.webmaster.yandex.net";
const PAGE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 15_000;

export type YandexRegion = { id: number; name: string };
export type SeoCollectionWindow = { from: string; to: string };

function invalidResponse(): never {
  throw new SeoProviderError("seo_yandex_response_invalid", false);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hostOrigin(hostId: string): string {
  const match = /^(https?):(.+):(\d+)$/u.exec(hostId);
  if (!match) throw new SeoProviderError("seo_yandex_host_id_invalid", false);
  try {
    return new URL(`${match[1]}://${match[2]}:${match[3]}`).origin;
  } catch {
    throw new SeoProviderError("seo_yandex_host_id_invalid", false);
  }
}

function yandexDevice(device: SeoDevice): "ALL" | "DESKTOP" | "MOBILE" | "TABLET" {
  if (device === "all") return "ALL";
  if (device === "desktop") return "DESKTOP";
  if (device === "mobile") return "MOBILE";
  return "TABLET";
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

function validateWindow(window: SeoCollectionWindow): void {
  if (!validDate(window.from) || !validDate(window.to) || window.to < window.from) {
    throw new SeoProviderError("seo_yandex_window_invalid", false);
  }
}

function parseRegions(payload: unknown): YandexRegion[] {
  if (!plainObject(payload) || !Array.isArray(payload.regions) || payload.regions.length > 10_000) return invalidResponse();
  const seen = new Set<number>();
  return payload.regions.map((value) => {
    if (!plainObject(value) || !Number.isSafeInteger(value.id) || (value.id as number) <= 0
      || typeof value.name !== "string" || !value.name.trim() || value.name.length > 300
      || seen.has(value.id as number)) return invalidResponse();
    seen.add(value.id as number);
    return { id: value.id as number, name: value.name.trim() };
  });
}

type DailyStatistics = Partial<Record<"IMPRESSIONS" | "CLICKS" | "CTR" | "POSITION" | "DEMAND", number>>;

function parseAnalyticsPage(
  payload: unknown,
  window: SeoCollectionWindow,
  region: YandexRegion,
  device: SeoDevice,
  expectedOrigin: string,
): { count: number; itemCount: number; rows: NormalizedSeoObservation[] } {
  if (!plainObject(payload) || !Number.isSafeInteger(payload.count) || (payload.count as number) < 0
    || !Array.isArray(payload.text_indicator_to_statistics)
    || payload.text_indicator_to_statistics.length > PAGE_LIMIT) return invalidResponse();
  const rows: NormalizedSeoObservation[] = [];
  for (const item of payload.text_indicator_to_statistics) {
    if (!plainObject(item) || !plainObject(item.text_indicator) || !plainObject(item.popular_complementary_indicator)
      || item.text_indicator.type !== "QUERY" || typeof item.text_indicator.value !== "string"
      || item.popular_complementary_indicator.type !== "URL" || typeof item.popular_complementary_indicator.value !== "string"
      || !Array.isArray(item.statistics)) return invalidResponse();
    const queryText = item.text_indicator.value.trim();
    if (!queryText) return invalidResponse();
    let pagePath: string;
    try {
      pagePath = normalizeSitePath(item.popular_complementary_indicator.value, expectedOrigin);
    } catch {
      return invalidResponse();
    }
    const byDate = new Map<string, DailyStatistics>();
    for (const statistic of item.statistics) {
      if (!plainObject(statistic) || !validDate(statistic.date)
        || statistic.date < window.from || statistic.date > window.to
        || !["IMPRESSIONS", "CLICKS", "CTR", "POSITION", "DEMAND"].includes(String(statistic.field))
        || typeof statistic.value !== "number" || !Number.isFinite(statistic.value) || statistic.value < 0) {
        return invalidResponse();
      }
      const field = statistic.field as keyof DailyStatistics;
      const daily = byDate.get(statistic.date) ?? {};
      if (daily[field] !== undefined) return invalidResponse();
      daily[field] = statistic.value;
      byDate.set(statistic.date, daily);
    }
    for (const [observationDate, daily] of byDate) {
      if (!Number.isSafeInteger(daily.IMPRESSIONS) || !Number.isSafeInteger(daily.CLICKS)
        || daily.IMPRESSIONS === undefined || daily.CLICKS === undefined || daily.CLICKS > daily.IMPRESSIONS
        || daily.POSITION === undefined || daily.POSITION <= 0
        || daily.CTR === undefined || daily.CTR > 100) return invalidResponse();
      rows.push({
        source: "yandex_webmaster",
        observationDate,
        queryText,
        normalizedQuery: normalizeSeoQuery(queryText),
        pagePath,
        regionExternalId: String(region.id),
        device,
        impressions: daily.IMPRESSIONS,
        clicks: daily.CLICKS,
        ctr: daily.IMPRESSIONS === 0 ? 0 : daily.CLICKS / daily.IMPRESSIONS,
        averagePosition: daily.POSITION,
      });
    }
  }
  return {
    count: payload.count as number,
    itemCount: payload.text_indicator_to_statistics.length,
    rows,
  };
}

export function createYandexWebmasterProvider(
  config: Extract<YandexSeoConfig, { enabled: true }>,
  fetchImpl: typeof fetch = fetch,
) {
  let cachedUserId: number | undefined;
  let availableRegionIds: Set<number> | undefined;
  const origin = hostOrigin(config.hostId);

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${API_ORIGIN}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "application/json",
          authorization: `OAuth ${config.oauthToken}`,
          ...init.headers,
        },
      });
    } catch {
      throw new SeoProviderError("seo_yandex_unavailable", true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new SeoProviderError("seo_yandex_auth_failed", false);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new SeoProviderError("seo_yandex_retryable", true, boundedRetryAfter(response));
    }
    if (!response.ok) throw new SeoProviderError("seo_yandex_request_failed", false);
    try {
      return await response.json();
    } catch {
      return invalidResponse();
    }
  }

  async function userId(): Promise<number> {
    if (cachedUserId !== undefined) return cachedUserId;
    const payload = await request("/v4/user");
    if (!plainObject(payload) || !Number.isSafeInteger(payload.user_id) || (payload.user_id as number) <= 0) {
      return invalidResponse();
    }
    cachedUserId = payload.user_id as number;
    return cachedUserId;
  }

  return {
    async check() {
      return { userId: await userId() };
    },

    async listAvailableRegions(): Promise<YandexRegion[]> {
      const currentUserId = await userId();
      // The official regions-directory contract exposes `filter` and `limit`, but no offset/cursor.
      const payload = await request(`/v4/user/${currentUserId}/hosts/${encodeURIComponent(config.hostId)}/pro/regions`);
      const regions = parseRegions(payload);
      availableRegionIds = new Set(regions.map((region) => region.id));
      return regions;
    },

    async collect(window: SeoCollectionWindow, region: YandexRegion, device: SeoDevice): Promise<NormalizedSeoObservation[]> {
      validateWindow(window);
      if (!availableRegionIds?.has(region.id)) throw new SeoProviderError("seo_yandex_region_unavailable", false);
      const currentUserId = await userId();
      const rows: NormalizedSeoObservation[] = [];
      let offset = 0;
      while (true) {
        const payload = await request(
          `/v4/user/${currentUserId}/hosts/${encodeURIComponent(config.hostId)}/query-analytics/list`,
          {
            method: "POST",
            headers: { "content-type": "application/json; charset=UTF-8" },
            body: JSON.stringify({
              offset,
              limit: PAGE_LIMIT,
              device_type_indicator: yandexDevice(device),
              search_location: "WEB_LOCATION",
              text_indicator: "QUERY",
              region_ids: [region.id],
              filters: {
                statistic_filters: [{
                  statistic_field: "IMPRESSIONS",
                  operation: "GREATER_EQUAL",
                  value: "0",
                  from: window.from,
                  to: window.to,
                }],
              },
            }),
          },
        );
        const page = parseAnalyticsPage(payload, window, region, device, origin);
        rows.push(...page.rows);
        if (page.itemCount < PAGE_LIMIT) break;
        offset += page.itemCount;
        if (offset > page.count + PAGE_LIMIT) return invalidResponse();
      }
      return rows;
    },
  };
}
