import type { NormalizedTrafficObservation, SeoTrafficSlice, YandexMetrikaConfig } from "../contracts";
import { normalizeSitePath } from "../normalization";
import { boundedRetryAfter, SeoProviderError } from "./provider-error";
import { classifyAiReferral, type NormalizedGeoReferral } from "../../geo-monitoring/referrals";

const API_ORIGIN = "https://api-metrika.yandex.net";
const REQUEST_TIMEOUT_MS = 15_000;
const REPORT_LIMIT = 100_000;
const BASE_FILTER = "ym:s:trafficSource=='organic' AND ym:s:isRobot=='No'";
const MAIN_METRICS = [
  "ym:s:visits",
  "ym:s:users",
  "ym:s:pageviews",
  "ym:s:bounceRate",
  "ym:s:pageDepth",
  "ym:s:avgVisitDurationSeconds",
] as const;
const MAJOR_CITIES = ["Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань", "Нижний Новгород", "Краснодар"];
const AI_DIMENSIONS = ["ym:s:date", "ym:s:refererDomain", "ym:s:refererPath", "ym:s:startURLPath", "ym:s:lastUTMSource"] as const;
const AI_FILTER = "ym:s:isRobot=='No' AND (ym:s:refererDomain=.('chatgpt.com','chat.openai.com','gemini.google.com','copilot.microsoft.com') OR ym:s:lastUTMSource=.('chatgpt','chatgpt.com','gemini','google_ai','google-ai','copilot','bing_copilot','bing-copilot'))";

type Window = { from: string; to: string };
type ReportSlice = { slice: SeoTrafficSlice; dimension?: string; filter?: string };
type ParsedReportRow = {
  observationDate: string;
  dimensionKey: string;
  dimensionLabel: string;
  pagePath: string | null;
  metrics: number[];
};

const SLICES: readonly ReportSlice[] = [
  { slice: "overall" },
  { slice: "device", dimension: "ym:s:deviceCategory" },
  {
    slice: "region",
    dimension: "ym:s:regionCity",
    filter: `ym:s:regionCityName=.(${MAJOR_CITIES.map((city) => `'${city}'`).join(",")})`,
  },
  { slice: "page", dimension: "ym:s:startURLPath" },
];

function invalidResponse(code = "seo_yandex_metrika_response_invalid"): never {
  throw new SeoProviderError(code, false);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

function validateWindow(window: Window): void {
  if (!validDate(window.from) || !validDate(window.to) || window.to < window.from) {
    throw new SeoProviderError("seo_yandex_metrika_window_invalid", false);
  }
}

function dimensionValue(value: unknown): { id?: string; name: string } {
  if (!plainObject(value) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 500) {
    return invalidResponse();
  }
  if (value.id !== undefined && typeof value.id !== "string" && typeof value.id !== "number") return invalidResponse();
  return { name: value.name.trim(), ...(value.id === undefined ? {} : { id: String(value.id) }) };
}

function parseReport(payload: unknown, slice: ReportSlice, metricCount: number): ParsedReportRow[] {
  if (!plainObject(payload) || payload.sampled !== false || payload.sample_share !== 1
    || payload.total_rows_rounded !== false || !Number.isSafeInteger(payload.total_rows)
    || (payload.total_rows as number) < 0 || !Array.isArray(payload.data)
    || payload.data.length > REPORT_LIMIT || payload.total_rows !== payload.data.length) {
    return invalidResponse("seo_yandex_metrika_response_incomplete");
  }
  return payload.data.map((row) => {
    if (!plainObject(row) || !Array.isArray(row.dimensions) || !Array.isArray(row.metrics)
      || row.dimensions.length !== (slice.dimension ? 2 : 1) || row.metrics.length !== metricCount
      || row.metrics.some((metric) => typeof metric !== "number" || !Number.isFinite(metric))) return invalidResponse();
    const date = dimensionValue(row.dimensions[0]).name;
    if (!validDate(date)) return invalidResponse();
    const dimension = slice.dimension ? dimensionValue(row.dimensions[1]) : null;
    let dimensionKey = "all";
    let dimensionLabel = "Весь органический трафик";
    let pagePath: string | null = null;
    if (slice.slice === "device") {
      dimensionKey = dimension?.id?.trim() || dimension?.name.toLocaleLowerCase("ru-RU") || "";
      dimensionLabel = dimension?.name ?? "";
    } else if (slice.slice === "region") {
      dimensionKey = dimension?.id?.trim() || dimension?.name.toLocaleLowerCase("ru-RU") || "";
      dimensionLabel = dimension?.name ?? "";
    } else if (slice.slice === "page") {
      try {
        pagePath = normalizeSitePath(dimension?.name === "" ? "/" : dimension?.name ?? "");
      } catch {
        return invalidResponse();
      }
      dimensionKey = pagePath;
      dimensionLabel = pagePath;
    }
    if (!dimensionKey || !dimensionLabel) return invalidResponse();
    return { observationDate: date, dimensionKey, dimensionLabel, pagePath, metrics: row.metrics as number[] };
  });
}

function rowKey(row: Pick<ParsedReportRow, "observationDate" | "dimensionKey">): string {
  return `${row.observationDate}\u0000${row.dimensionKey}`;
}

type AiReportRow = {
  observationDate: string;
  platform: NormalizedGeoReferral["platform"];
  landingPath: string;
  metrics: number[];
};

function optionalDimension(value: unknown): string {
  if (!plainObject(value) || typeof value.name !== "string" || value.name.length > 2_000) return invalidResponse();
  return value.name.trim();
}

function parseAiReport(payload: unknown, metricCount: number): AiReportRow[] {
  if (!plainObject(payload) || payload.sampled !== false || payload.sample_share !== 1
    || payload.total_rows_rounded !== false || !Number.isSafeInteger(payload.total_rows)
    || (payload.total_rows as number) < 0 || !Array.isArray(payload.data)
    || payload.data.length > REPORT_LIMIT || payload.total_rows !== payload.data.length) {
    return invalidResponse("seo_yandex_metrika_ai_response_incomplete");
  }
  return payload.data.flatMap((row) => {
    if (!plainObject(row) || !Array.isArray(row.dimensions) || row.dimensions.length !== AI_DIMENSIONS.length
      || !Array.isArray(row.metrics) || row.metrics.length !== metricCount
      || row.metrics.some((metric) => typeof metric !== "number" || !Number.isFinite(metric))) return invalidResponse();
    const observationDate = optionalDimension(row.dimensions[0]);
    if (!validDate(observationDate)) return invalidResponse();
    const refererDomain = optionalDimension(row.dimensions[1]);
    const refererPath = optionalDimension(row.dimensions[2]);
    let landingPath: string;
    try {
      landingPath = normalizeSitePath(optionalDimension(row.dimensions[3]) || "/");
    } catch {
      return invalidResponse();
    }
    const utmSource = optionalDimension(row.dimensions[4]);
    const platform = classifyAiReferral({ refererDomain, refererPath, utmSource });
    return platform ? [{ observationDate, platform, landingPath, metrics: row.metrics as number[] }] : [];
  });
}

export function createYandexMetrikaProvider(
  config: Extract<YandexMetrikaConfig, { enabled: true }>,
  fetchImpl: typeof fetch = fetch,
) {
  async function request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${API_ORIGIN}${path}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: "application/json", authorization: `OAuth ${config.oauthToken}` },
      });
    } catch {
      throw new SeoProviderError("seo_yandex_metrika_unavailable", true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new SeoProviderError("seo_yandex_metrika_auth_failed", false);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new SeoProviderError("seo_yandex_metrika_retryable", true, boundedRetryAfter(response));
    }
    if (!response.ok) throw new SeoProviderError("seo_yandex_metrika_request_failed", false);
    try {
      return await response.json();
    } catch {
      return invalidResponse();
    }
  }

  function reportUrl(window: Window, slice: ReportSlice, newUsers: boolean): string {
    const filters = [BASE_FILTER, slice.filter, newUsers ? "ym:s:isNewUser=='Yes'" : undefined]
      .filter(Boolean).join(" AND ");
    const params = new URLSearchParams({
      ids: String(config.counterId),
      date1: window.from,
      date2: window.to,
      dimensions: ["ym:s:date", slice.dimension].filter(Boolean).join(","),
      metrics: newUsers ? "ym:s:users" : MAIN_METRICS.join(","),
      filters,
      attribution: "last",
      accuracy: "full",
      lang: "ru",
      limit: String(REPORT_LIMIT),
      offset: "1",
    });
    return `/stat/v1/data?${params.toString()}`;
  }

  function aiReportUrl(window: Window, newUsers: boolean): string {
    const params = new URLSearchParams({
      ids: String(config.counterId),
      date1: window.from,
      date2: window.to,
      dimensions: AI_DIMENSIONS.join(","),
      metrics: newUsers ? "ym:s:users" : "ym:s:visits,ym:s:users,ym:s:pageviews",
      filters: [AI_FILTER, newUsers ? "ym:s:isNewUser=='Yes'" : undefined].filter(Boolean).join(" AND "),
      attribution: "last",
      accuracy: "full",
      lang: "ru",
      limit: String(REPORT_LIMIT),
      offset: "1",
    });
    return `/stat/v1/data?${params.toString()}`;
  }

  return {
    async check() {
      const payload = await request(`/management/v1/counter/${config.counterId}`);
      if (!plainObject(payload) || !plainObject(payload.counter) || payload.counter.id !== config.counterId) {
        return invalidResponse();
      }
      return { counterId: config.counterId };
    },

    async collect(window: Window): Promise<NormalizedTrafficObservation[]> {
      validateWindow(window);
      const observations: NormalizedTrafficObservation[] = [];
      for (const slice of SLICES) {
        const mainRows = parseReport(await request(reportUrl(window, slice, false)), slice, MAIN_METRICS.length);
        const newRows = parseReport(await request(reportUrl(window, slice, true)), slice, 1);
        const newUsers = new Map(newRows.map((row) => [rowKey(row), row.metrics[0]]));
        if (newRows.length !== mainRows.length || mainRows.some((row) => !newUsers.has(rowKey(row)))) {
          return invalidResponse("seo_yandex_metrika_new_users_mismatch");
        }
        for (const row of mainRows) {
          const [visits, users, pageviews, bouncePercent, pageDepth, avgVisitDurationSeconds] = row.metrics;
          const newUserCount = newUsers.get(rowKey(row));
          if (![visits, users, pageviews, newUserCount].every(Number.isSafeInteger)
            || visits < users || users < newUserCount! || newUserCount! < 0 || pageviews < visits
            || bouncePercent < 0 || bouncePercent > 100 || pageDepth < 0 || avgVisitDurationSeconds < 0) {
            return invalidResponse();
          }
          observations.push({
            source: "yandex_metrika",
            observationDate: row.observationDate,
            slice: slice.slice,
            dimensionKey: row.dimensionKey,
            dimensionLabel: row.dimensionLabel,
            pagePath: row.pagePath,
            users,
            newUsers: newUserCount!,
            visits,
            pageviews,
            bounceRate: bouncePercent / 100,
            pageDepth,
            avgVisitDurationSeconds,
          });
        }
      }
      return observations;
    },

    async collectAiReferrals(window: Window): Promise<NormalizedGeoReferral[]> {
      validateWindow(window);
      const mainRows = parseAiReport(await request(aiReportUrl(window, false)), 3);
      const newRows = parseAiReport(await request(aiReportUrl(window, true)), 1);
      const key = (row: AiReportRow) => `${row.observationDate}\u0000${row.platform}\u0000${row.landingPath}`;
      const main = new Map<string, AiReportRow>();
      for (const row of mainRows) {
        const existing = main.get(key(row));
        if (!existing) main.set(key(row), row);
        else existing.metrics = existing.metrics.map((value, index) => Math.max(value, row.metrics[index] ?? 0));
      }
      const newUsers = new Map<string, number>();
      for (const row of newRows) newUsers.set(key(row), Math.max(newUsers.get(key(row)) ?? 0, row.metrics[0] ?? 0));
      if (main.size !== newUsers.size || [...main.keys()].some((item) => !newUsers.has(item))) {
        return invalidResponse("seo_yandex_metrika_ai_new_users_mismatch");
      }
      return [...main.entries()].map(([itemKey, row]) => {
        const [visits, users, pageviews] = row.metrics;
        const newUserCount = newUsers.get(itemKey)!;
        if (![visits, users, pageviews, newUserCount].every(Number.isSafeInteger)
          || visits < users || users < newUserCount || newUserCount < 0 || pageviews < visits) return invalidResponse();
        return {
          observationDate: row.observationDate,
          platform: row.platform,
          users,
          newUsers: newUserCount,
          visits,
          pageviews,
          landingPath: row.landingPath,
        };
      });
    },
  };
}
