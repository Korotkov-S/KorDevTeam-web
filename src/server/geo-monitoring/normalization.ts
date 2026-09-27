import { normalizeSitePath } from "../seo-monitoring/normalization";

const TRACKING_KEYS = new Set([
  "fbclid",
  "gclid",
  "yclid",
  "ysclid",
  "mc_cid",
  "mc_eid",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export function normalizeGeoPrompt(text: string): string {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/\s+/gu, " ").trim();
  if (!normalized) throw new Error("geo_prompt_empty");
  if (normalized.length > 2000) throw new Error("geo_prompt_too_long");
  return normalized;
}

export function normalizeGeoTargetPath(value: string): string {
  try {
    const path = normalizeSitePath(value);
    if (!path.startsWith("/") || !path.endsWith("/")) throw new Error("shape");
    return path;
  } catch {
    throw new Error("geo_target_path_invalid");
  }
}

export function normalizeCitationUrl(value: string): { url: string; hostname: string } {
  if (value.length > 2000) throw new Error("geo_citation_url_invalid");
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("geo_citation_url_invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error("geo_citation_url_invalid");
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_KEYS.has(key.toLocaleLowerCase("en-US"))) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  parsed.hash = "";
  const url = parsed.toString();
  if (url.length > 2000) throw new Error("geo_citation_url_invalid");
  return { url, hostname: parsed.hostname.toLocaleLowerCase("en-US") };
}

export function normalizeResponseHash(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) throw new Error("geo_response_hash_invalid");
  return normalized;
}
