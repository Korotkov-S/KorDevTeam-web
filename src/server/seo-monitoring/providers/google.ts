import { sign } from "node:crypto";

import type { GoogleSeoConfig, NormalizedSeoObservation } from "../contracts";
import { mapDevice, normalizeSeoQuery, normalizeSitePath } from "../normalization";
import { boundedRetryAfter, SeoProviderError } from "./provider-error";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_ORIGIN = "https://www.googleapis.com";
const SEARCH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const PAGE_LIMIT = 25_000;
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_SAFETY_MS = 60_000;

type GoogleWindow = { from: string; to: string };
type Clock = () => Date;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createServiceAccountAssertion(
  config: Extract<GoogleSeoConfig, { enabled: true }>,
  now: Date,
): string {
  if (!Number.isFinite(+now)) throw new SeoProviderError("seo_google_clock_invalid", false);
  const issuedAt = Math.floor(+now / 1_000);
  const header = encode({ alg: "RS256", typ: "JWT" });
  const claims = encode({
    iss: config.clientEmail,
    scope: SEARCH_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3_600,
  });
  const input = `${header}.${claims}`;
  try {
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), config.privateKey).toString("base64url")}`;
  } catch {
    throw new SeoProviderError("seo_google_private_key_invalid", false);
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new SeoProviderError("seo_google_response_invalid", false);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

function validateWindow(window: GoogleWindow): void {
  if (!validDate(window.from) || !validDate(window.to) || window.to < window.from) {
    throw new SeoProviderError("seo_google_window_invalid", false);
  }
}

function propertyOrigin(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return `https://${siteUrl.slice("sc-domain:".length)}`;
  return new URL(siteUrl).origin;
}

function parsePage(payload: unknown, window: GoogleWindow, siteOrigin: string): NormalizedSeoObservation[] {
  if (!plainObject(payload)) return invalidResponse();
  if (payload.rows === undefined) return [];
  if (!Array.isArray(payload.rows) || payload.rows.length > PAGE_LIMIT) return invalidResponse();
  return payload.rows.map((row) => {
    if (!plainObject(row) || !Array.isArray(row.keys) || row.keys.length !== 5
      || !row.keys.every((key) => typeof key === "string")
      || !validDate(row.keys[0]) || row.keys[0] < window.from || row.keys[0] > window.to
      || !row.keys[1].trim() || row.keys[3].toLocaleLowerCase("en-US") !== "rus"
      || typeof row.clicks !== "number" || !Number.isSafeInteger(row.clicks) || row.clicks < 0
      || typeof row.impressions !== "number" || !Number.isSafeInteger(row.impressions) || row.impressions < 0
      || row.clicks > row.impressions
      || typeof row.ctr !== "number" || !Number.isFinite(row.ctr) || row.ctr < 0 || row.ctr > 1
      || typeof row.position !== "number" || !Number.isFinite(row.position) || row.position <= 0) {
      return invalidResponse();
    }
    let pagePath: string;
    let device: NormalizedSeoObservation["device"];
    try {
      pagePath = normalizeSitePath(row.keys[2], siteOrigin);
      device = mapDevice(row.keys[4]);
    } catch {
      return invalidResponse();
    }
    return {
      source: "google_search_console",
      observationDate: row.keys[0],
      queryText: row.keys[1].trim(),
      normalizedQuery: normalizeSeoQuery(row.keys[1]),
      pagePath,
      regionExternalId: "RUS",
      device,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      averagePosition: row.position,
    };
  });
}

export function createGoogleSearchConsoleProvider(
  config: Extract<GoogleSeoConfig, { enabled: true }>,
  fetchImpl: typeof fetch = fetch,
  clock: Clock = () => new Date(),
) {
  let cachedToken: { value: string; expiresAt: number } | undefined;
  const siteOrigin = propertyOrigin(config.siteUrl);

  async function requestJson(url: string, init: RequestInit, kind: "token" | "api"): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new SeoProviderError("seo_google_unavailable", true);
    }
    if (response.status === 401 || response.status === 403 || (kind === "token" && response.status === 400)) {
      throw new SeoProviderError("seo_google_auth_failed", false);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new SeoProviderError("seo_google_retryable", true, boundedRetryAfter(response));
    }
    if (!response.ok) throw new SeoProviderError("seo_google_request_failed", false);
    try {
      return await response.json();
    } catch {
      return invalidResponse();
    }
  }

  async function accessToken(): Promise<string> {
    const now = clock();
    if (!Number.isFinite(+now)) throw new SeoProviderError("seo_google_clock_invalid", false);
    if (cachedToken && +now < cachedToken.expiresAt - TOKEN_SAFETY_MS) return cachedToken.value;
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createServiceAccountAssertion(config, now),
    });
    const payload = await requestJson(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }, "token");
    if (!plainObject(payload) || typeof payload.access_token !== "string" || !payload.access_token
      || payload.access_token.length > 8_192 || payload.token_type !== "Bearer"
      || !Number.isSafeInteger(payload.expires_in) || (payload.expires_in as number) < 60
      || (payload.expires_in as number) > 86_400) return invalidResponse();
    cachedToken = { value: payload.access_token, expiresAt: +now + ((payload.expires_in as number) * 1_000) };
    return cachedToken.value;
  }

  return {
    async check() {
      await accessToken();
      return { siteUrl: config.siteUrl };
    },

    async collect(window: GoogleWindow): Promise<NormalizedSeoObservation[]> {
      validateWindow(window);
      const token = await accessToken();
      const rows: NormalizedSeoObservation[] = [];
      let startRow = 0;
      while (true) {
        const payload = await requestJson(
          `${SEARCH_CONSOLE_ORIGIN}/webmasters/v3/sites/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              startDate: window.from,
              endDate: window.to,
              dimensions: ["date", "query", "page", "country", "device"],
              type: "web",
              aggregationType: "byPage",
              dataState: "final",
              dimensionFilterGroups: [{
                groupType: "and",
                filters: [{ dimension: "country", operator: "equals", expression: "rus" }],
              }],
              rowLimit: PAGE_LIMIT,
              startRow,
            }),
          },
          "api",
        );
        const page = parsePage(payload, window, siteOrigin);
        rows.push(...page);
        if (page.length < PAGE_LIMIT) break;
        startRow += page.length;
      }
      return rows;
    },
  };
}
