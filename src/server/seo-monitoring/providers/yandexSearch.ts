import { load } from "cheerio";

import type { SeoDevice, YandexSearchConfig } from "../contracts";
import { boundedRetryAfter, SeoProviderError } from "./provider-error";

const API_URL = "https://searchapi.api.cloud.yandex.net/v2/web/searchAsync";
const OPERATIONS_URL = "https://operation.api.cloud.yandex.net/operations";
const REQUEST_TIMEOUT_MS = 20_000;
const RESULT_LIMIT = 100;
const MAX_RAW_BYTES = 8 * 1024 * 1024;
const MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_USER_AGENT = "KorDevTeam SEO rank monitor/1.0 (desktop)";

export type YandexRankResult = {
  status: "found";
  position: number;
  resultUrl: string;
  resultLimit: number;
} | {
  status: "not_found";
  position: null;
  resultUrl: null;
  resultLimit: number;
};

function invalidResponse(): never {
  throw new SeoProviderError("seo_yandex_search_response_invalid", false);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operationId(payload: unknown): string {
  if (!plainObject(payload) || typeof payload.id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/u.test(payload.id)) {
    return invalidResponse();
  }
  return payload.id;
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<unknown> {
  const submitting = init.method === "POST";
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        authorization: `Api-Key ${apiKey}`,
        ...init.headers,
      },
    });
  } catch {
    if (submitting)
      throw new SeoProviderError("seo_rank_submission_uncertain", false);
    throw new SeoProviderError("seo_yandex_search_retryable", true);
  }
  if (response.status === 401 || response.status === 403) {
    throw new SeoProviderError("seo_yandex_search_auth_failed", false);
  }
  if (submitting && response.status === 429)
    throw new SeoProviderError(
      "seo_rank_submit_rejected",
      true,
      boundedRetryAfter(response),
    );
  if (submitting && response.status >= 500)
    throw new SeoProviderError("seo_rank_submission_uncertain", false);
  if (response.status === 429 || response.status >= 500) {
    throw new SeoProviderError("seo_yandex_search_retryable", true, boundedRetryAfter(response));
  }
  if (!response.ok) throw new SeoProviderError("seo_yandex_search_request_failed", false);
  try {
    return await response.json();
  } catch {
    if (submitting)
      throw new SeoProviderError("seo_rank_submission_uncertain", false);
    return invalidResponse();
  }
}

function decodeRawData(payload: unknown): string {
  if (!plainObject(payload) || typeof payload.rawData !== "string"
    || payload.rawData.length === 0 || payload.rawData.length > MAX_RAW_BYTES * 2
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload.rawData)) {
    return invalidResponse();
  }
  const bytes = Buffer.from(payload.rawData, "base64");
  if (!bytes.length || bytes.length > MAX_RAW_BYTES || bytes.toString("base64") !== payload.rawData) return invalidResponse();
  return bytes.toString("utf8");
}

function parseResult(xml: string, targetHost: string): YandexRankResult {
  const $ = load(xml, { xmlMode: true });
  const grouping = $("yandexsearch > response > results > grouping");
  if (grouping.length !== 1 || $("yandexsearch > response > error").length > 0) return invalidResponse();
  const urls = grouping.find("group > doc > url").toArray().map((node) => $(node).text().trim());
  if (urls.length > RESULT_LIMIT) return invalidResponse();
  for (let index = 0; index < urls.length; index++) {
    let url: URL;
    try {
      url = new URL(urls[index]);
    } catch {
      return invalidResponse();
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return invalidResponse();
    if (url.hostname.toLocaleLowerCase("en-US") === targetHost) {
      return { status: "found", position: index + 1, resultUrl: url.href, resultLimit: RESULT_LIMIT };
    }
  }
  return { status: "not_found", position: null, resultUrl: null, resultLimit: RESULT_LIMIT };
}

export function createYandexSearchProvider(
  config: Extract<YandexSearchConfig, { enabled: true }>,
  fetchImpl: typeof fetch = fetch,
) {
  async function startSearch(
    queryText: string,
    regionId: number,
    device: Extract<SeoDevice, "desktop" | "mobile">,
  ): Promise<string> {
    const query = queryText.trim();
    if (!query || query.length > 400) throw new SeoProviderError("seo_yandex_search_query_invalid", false);
    if (!Number.isSafeInteger(regionId) || regionId < 1) throw new SeoProviderError("seo_yandex_search_region_invalid", false);
    const payload = await requestJson(fetchImpl, API_URL, config.apiKey, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: {
          searchType: "SEARCH_TYPE_RU",
          queryText: query,
          familyMode: "FAMILY_MODE_MODERATE",
          page: "0",
          fixTypoMode: "FIX_TYPO_MODE_OFF",
        },
        groupSpec: { groupMode: "GROUP_MODE_FLAT", groupsOnPage: String(RESULT_LIMIT), docsInGroup: "1" },
        maxPassages: "1",
        region: String(regionId),
        l10n: "LOCALIZATION_RU",
        folderId: config.folderId,
        responseFormat: "FORMAT_XML",
        userAgent: device === "mobile" ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT,
      }),
    });
    try {
      return operationId(payload);
    } catch {
      throw new SeoProviderError("seo_rank_submission_uncertain", false);
    }
  }

  async function pollSearch(id: string): Promise<YandexRankResult | null> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/u.test(id)) throw new SeoProviderError("seo_yandex_search_operation_invalid", false);
    const payload = await requestJson(fetchImpl, `${OPERATIONS_URL}/${encodeURIComponent(id)}`, config.apiKey);
    if (!plainObject(payload)) return invalidResponse();
    if (payload.error !== undefined) throw new SeoProviderError("seo_yandex_search_operation_failed", false);
    if (payload.done !== true) return null;
    if (!plainObject(payload.response)) return invalidResponse();
    return parseResult(decodeRawData(payload.response), config.targetHost);
  }

  return {
    startSearch,
    pollSearch,
    async check() {
      await startSearch(config.targetHost, 225, "desktop");
      return { targetHost: config.targetHost };
    },
  };
}
