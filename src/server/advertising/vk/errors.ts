export const VK_ADS_ERROR_CODES = [
  "ads_vk_disabled",
  "ads_vk_config_invalid",
  "ads_vk_oauth_invalid",
  "ads_vk_token_expired",
  "ads_vk_token_revoked",
  "ads_vk_rate_limited",
  "ads_vk_provider_unavailable",
  "ads_vk_contract_invalid",
  "ads_vk_storage_unavailable",
  "ads_vk_sync_locked",
  "ads_vk_sync_partial",
  "ads_vk_unavailable",
] as const;

export type VkAdsErrorCode = typeof VK_ADS_ERROR_CODES[number];

export class VkAdsError extends Error {
  readonly code: VkAdsErrorCode;

  constructor(code: VkAdsErrorCode) {
    super(code);
    this.code = code;
    Object.defineProperty(this, "name", { value: "VkAdsError", configurable: true });
  }

  toJSON(): { code: VkAdsErrorCode } {
    return { code: this.code };
  }
}

const forbiddenKey = /(?:token|secret|authorization|cookie|rawresponse|email|phone|file)/iu;
const emailLike = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const phoneLike = /\+?\d[\d\s().-]{8,}\d/gu;
const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const fingerprintLike = /^[0-9a-f]{64}$/iu;

function containsPhone(value: string): boolean {
  return [...value.matchAll(phoneLike)].some((match) => {
    const digits = match[0].replace(/\D/gu, "").length;
    return digits >= 10 && digits <= 15;
  });
}

export function redactVkAdsLogRecord(value: unknown): unknown {
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 8) return null;
    if (item instanceof Date) return item.toISOString();
    if (typeof item === "string") {
      if (!uuidLike.test(item) && !fingerprintLike.test(item) && (emailLike.test(item) || containsPhone(item))) {
        return "[redacted]";
      }
      return item.slice(0, 4_000);
    }
    if (typeof item === "number") return Number.isFinite(item) ? item : null;
    if (item === null || typeof item === "boolean") return item;
    if (Array.isArray(item)) return item.slice(0, 100).map((entry) => visit(entry, depth + 1));
    if (!item || typeof item !== "object") return null;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .slice(0, 100)
      .filter(([key]) => !forbiddenKey.test(key.replace(/[_-]/gu, "")))
      .map(([key, entry]) => [key, visit(entry, depth + 1)]));
  };
  return visit(value, 0);
}
