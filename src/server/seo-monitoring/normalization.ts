import { SITE_ORIGIN } from "../seo/metadata";

import type { SeoDevice } from "./contracts";

function invalidMetric(): never {
  throw new Error("seo_metric_invalid");
}

export function normalizeSeoQuery(value: string): string {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/\s+/gu, " ").trim();
  if (!normalized) throw new Error("seo_query_empty");
  return normalized;
}

export function normalizeSitePath(value: string, siteOrigin = SITE_ORIGIN): string {
  const input = value.trim();
  if (!input || input.includes("\\") || input.startsWith("//")) throw new Error("seo_page_path_invalid");
  let parsed: URL;
  try {
    if (input.startsWith("/")) parsed = new URL(input, siteOrigin);
    else if (/^https:\/\//u.test(input)) parsed = new URL(input);
    else throw new Error("relative");
  } catch {
    throw new Error("seo_page_path_invalid");
  }
  if (parsed.origin !== new URL(siteOrigin).origin || parsed.username || parsed.password) {
    throw new Error("seo_page_origin_invalid");
  }
  return parsed.pathname;
}

export function mapDevice(value: string): SeoDevice {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (normalized === "desktop" || normalized === "mobile" || normalized === "tablet" || normalized === "all") {
    return normalized;
  }
  throw new Error("seo_device_invalid");
}

export function weightedPosition(rows: ReadonlyArray<{ impressions: number; position: number }>): number | null {
  let impressions = 0;
  let weightedSum = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.impressions) || row.impressions < 0 || !Number.isFinite(row.position) || row.position <= 0) {
      return invalidMetric();
    }
    impressions += row.impressions;
    weightedSum += row.impressions * row.position;
  }
  return impressions === 0 ? null : weightedSum / impressions;
}

export function combinedCtr(rows: ReadonlyArray<{ clicks: number; impressions: number }>): number | null {
  let clicks = 0;
  let impressions = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.clicks) || !Number.isSafeInteger(row.impressions)
      || row.clicks < 0 || row.impressions < 0 || row.clicks > row.impressions) {
      return invalidMetric();
    }
    clicks += row.clicks;
    impressions += row.impressions;
  }
  return impressions === 0 ? null : clicks / impressions;
}
