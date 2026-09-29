import { createHash } from "node:crypto";

import { VK_ADS_MCP_IMAGE_MAX_BYTES } from "./config";
import type {
  VkAdsAdGroupReadInput,
  VkAdsAdReadInput,
  VkAdsCampaignReadInput,
  VkAdsStatisticsReadInput,
} from "./contracts";
import { redactVkAdsLogRecord, VkAdsError } from "./errors";
import type { VkAdsReadService } from "./readService";

const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const forbiddenKey = /(?:token|secret|authorization|cookie|rawresponse|targetinglabels|imageobjectkey)/iu;

function safeReadOutput<T>(value: T): T {
  const visit = (item: unknown, depth: number, field = ""): void => {
    if (depth > 12) throw new VkAdsError("ads_vk_contract_invalid");
    if (typeof item === "string") {
      if (field === "landingPath" && (!item.startsWith("/") || /[?#]/u.test(item))) {
        throw new VkAdsError("ads_vk_contract_invalid");
      }
      if (field === "landingOrigin" || field === "videoSourceUrl") {
        let url: URL;
        try { url = new URL(item); }
        catch { throw new VkAdsError("ads_vk_contract_invalid"); }
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
            (field === "landingOrigin" && (url.pathname !== "/" || url.href !== `${url.origin}/`))) {
          throw new VkAdsError("ads_vk_contract_invalid");
        }
      }
      const identifier = /(?:^id$|id$|externalid|fingerprint|cursor|impressions|reach|clicks|spend|budget|revision)/iu.test(field);
      if (redactVkAdsLogRecord(item) !== item && !(identifier && /^\d+(?:\.\d+)?$/u.test(item))) {
        throw new VkAdsError("ads_vk_contract_invalid");
      }
      return;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new VkAdsError("ads_vk_contract_invalid");
      return;
    }
    if (item === null || typeof item === "boolean") return;
    if (Array.isArray(item)) {
      if (item.length > 1_000) throw new VkAdsError("ads_vk_contract_invalid");
      item.forEach((entry) => visit(entry, depth + 1, field));
      return;
    }
    if (!item || typeof item !== "object" || Buffer.isBuffer(item)) throw new VkAdsError("ads_vk_contract_invalid");
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length > 200) throw new VkAdsError("ads_vk_contract_invalid");
    for (const [key, entry] of entries) {
      if (forbiddenKey.test(key.replace(/[_-]/gu, ""))) throw new VkAdsError("ads_vk_contract_invalid");
      visit(entry, depth + 1, key);
    }
  };
  visit(value, 0);
  return value;
}

export function createMcpVkAdsService(readService: VkAdsReadService) {
  return {
    getSyncStatus: async () => safeReadOutput(await readService.getSyncStatus()),
    listCampaigns: async (input: VkAdsCampaignReadInput) => safeReadOutput(await readService.listCampaigns(input)),
    listAdGroups: async (input: VkAdsAdGroupReadInput) => safeReadOutput(await readService.listAdGroups(input)),
    listAds: async (input: VkAdsAdReadInput) => safeReadOutput(await readService.listAds(input)),
    getAd: async (id: string) => safeReadOutput(await readService.getAd(id)),
    getStatistics: async (input: VkAdsStatisticsReadInput) => safeReadOutput(await readService.getStatistics(input)),
    async getCreativeImage(id: string) {
      const image = await readService.getCreativeImage(id, VK_ADS_MCP_IMAGE_MAX_BYTES);
      if (!image) throw new VkAdsError("ads_vk_unavailable");
      if (!Buffer.isBuffer(image.bytes) || image.bytes.length < 1 || image.bytes.length > VK_ADS_MCP_IMAGE_MAX_BYTES ||
          !mimeTypes.has(image.mimeType) || !/^[a-f0-9]{64}$/u.test(image.sha256) ||
          createHash("sha256").update(image.bytes).digest("hex") !== image.sha256) {
        throw new VkAdsError("ads_vk_storage_unavailable");
      }
      return image;
    },
  };
}

export type McpVkAdsService = ReturnType<typeof createMcpVkAdsService>;
