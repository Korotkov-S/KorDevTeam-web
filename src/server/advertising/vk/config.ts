import { createHash } from "node:crypto";

import type { VkAdsConfig, VkAdsStorageConfig } from "./contracts";
import { VkAdsError } from "./errors";

export const VK_ADS_ORIGIN = "https://ads.vk.ru" as const;
export const VK_ADS_DAILY_LOOKBACK_DAYS = 7 as const;
export const VK_ADS_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const VK_ADS_MCP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VK_ADS_CREATIVE_PREFIX = "ads/vk/creatives" as const;

type VkAdsEnvironment = Readonly<Record<string, string | undefined>>;

function invalid(): never {
  throw new VkAdsError("ads_vk_config_invalid");
}

function required(environment: VkAdsEnvironment, name: string): string {
  const value = environment[name];
  if (!value || value !== value.trim()) invalid();
  return value;
}

function enabled(environment: VkAdsEnvironment): boolean {
  const value = environment.VK_ADS_SYNC_ENABLED;
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  return invalid();
}

function encryptionKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/u.test(value)) invalid();
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) invalid();
  return decoded;
}

function storageEndpoint(value: string): URL {
  let endpoint: URL;
  try { endpoint = new URL(value); }
  catch { return invalid(); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port ||
      endpoint.pathname !== "/" || endpoint.search || endpoint.hash) invalid();
  return endpoint;
}

function storageConfig(environment: VkAdsEnvironment): VkAdsStorageConfig {
  const serverSideEncryption = required(environment, "VK_ADS_S3_SSE");
  if (serverSideEncryption !== "AES256" && serverSideEncryption !== "provider") invalid();
  return {
    endpoint: storageEndpoint(required(environment, "VK_ADS_S3_ENDPOINT")),
    region: required(environment, "VK_ADS_S3_REGION"),
    bucket: required(environment, "VK_ADS_S3_BUCKET"),
    accessKeyId: required(environment, "VK_ADS_S3_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "VK_ADS_S3_SECRET_ACCESS_KEY"),
    prefix: VK_ADS_CREATIVE_PREFIX,
    serverSideEncryption,
  };
}

export function readVkAdsConfig(environment: VkAdsEnvironment): VkAdsConfig {
  if (!enabled(environment)) {
    return { enabled: false, origin: new URL(VK_ADS_ORIGIN), lookbackDays: VK_ADS_DAILY_LOOKBACK_DAYS };
  }
  return {
    enabled: true,
    origin: new URL(VK_ADS_ORIGIN),
    lookbackDays: VK_ADS_DAILY_LOOKBACK_DAYS,
    clientId: required(environment, "VK_ADS_CLIENT_ID"),
    clientSecret: required(environment, "VK_ADS_CLIENT_SECRET"),
    tokenEncryptionKey: encryptionKey(required(environment, "VK_ADS_TOKEN_ENCRYPTION_KEY_B64")),
    storage: storageConfig(environment),
  };
}

export type SafeVkAdsConfigSummary = {
  enabled: boolean;
  origin: string;
  lookbackDays: 7;
  storageReady: boolean;
  clientIdFingerprint?: string;
};

export function safeVkAdsConfigSummary(config: VkAdsConfig): SafeVkAdsConfigSummary {
  const summary: SafeVkAdsConfigSummary = {
    enabled: config.enabled,
    origin: config.origin.origin,
    lookbackDays: config.lookbackDays,
    storageReady: config.enabled,
  };
  if (config.enabled) {
    summary.clientIdFingerprint = createHash("sha256").update(config.clientId, "utf8").digest("hex").slice(0, 16);
  }
  return summary;
}
