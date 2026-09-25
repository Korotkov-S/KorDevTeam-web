import { createPrivateKey } from "node:crypto";

import type { GoogleSeoConfig, SafeSeoConfigSummary, SeoConfig, YandexSeoConfig } from "./contracts";

type SeoEnvironment = Record<string, string | undefined>;

function fail(code: string): never {
  throw new Error(code);
}

function sourceEnabled(value: string | undefined, code: string): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  return fail(code);
}

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) return fail(code);
  return normalized;
}

function readYandexConfig(env: SeoEnvironment): YandexSeoConfig {
  if (!sourceEnabled(env.SEO_YANDEX_ENABLED, "seo_yandex_enabled_invalid")) return { enabled: false };
  const oauthToken = required(env.YANDEX_WEBMASTER_OAUTH_TOKEN, "seo_yandex_token_required");
  const hostId = required(env.YANDEX_WEBMASTER_HOST_ID, "seo_yandex_host_id_required");
  if (hostId.length > 500 || /[\s\u0000-\u001f]/u.test(hostId)) return fail("seo_yandex_host_id_invalid");
  return { enabled: true, oauthToken, hostId };
}

function isValidSearchConsoleProperty(value: string): boolean {
  if (value.startsWith("sc-domain:")) {
    const domain = value.slice("sc-domain:".length);
    return domain.length <= 253
      && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/u.test(domain)
      && domain.includes(".")
      && !domain.includes("..");
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function decodeGooglePrivateKey(value: string): string {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return fail("seo_google_private_key_invalid");
  }
  try {
    const decoded = Buffer.from(value, "base64");
    if (!decoded.length || decoded.toString("base64") !== value) return fail("seo_google_private_key_invalid");
    const privateKey = decoded.toString("utf8");
    const parsed = createPrivateKey({ key: privateKey, format: "pem" });
    if (parsed.type !== "private" || parsed.asymmetricKeyType !== "rsa") return fail("seo_google_private_key_invalid");
    return privateKey;
  } catch {
    return fail("seo_google_private_key_invalid");
  }
}

function readGoogleConfig(env: SeoEnvironment): GoogleSeoConfig {
  if (!sourceEnabled(env.SEO_GOOGLE_ENABLED, "seo_google_enabled_invalid")) return { enabled: false };
  const siteUrl = required(env.GOOGLE_SEARCH_CONSOLE_SITE_URL, "seo_google_site_url_required");
  if (!isValidSearchConsoleProperty(siteUrl)) return fail("seo_google_site_url_invalid");
  const clientEmail = required(env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL, "seo_google_client_email_required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(clientEmail) || clientEmail.length > 320) {
    return fail("seo_google_client_email_invalid");
  }
  const encodedKey = required(env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64, "seo_google_private_key_required");
  return { enabled: true, siteUrl, clientEmail, privateKey: decodeGooglePrivateKey(encodedKey) };
}

export function readSeoConfig(env: SeoEnvironment = process.env): SeoConfig {
  return {
    yandex: readYandexConfig(env),
    google: readGoogleConfig(env),
  };
}

export function safeSeoConfigSummary(config: SeoConfig): SafeSeoConfigSummary {
  return {
    yandex: config.yandex.enabled
      ? { enabled: true, hostId: config.yandex.hostId }
      : { enabled: false },
    google: config.google.enabled
      ? { enabled: true, siteUrl: config.google.siteUrl }
      : { enabled: false },
  };
}
