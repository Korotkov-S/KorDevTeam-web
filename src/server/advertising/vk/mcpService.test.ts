import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { VK_ADS_MCP_IMAGE_MAX_BYTES } from "./config";
import { createMcpVkAdsService } from "./mcpService";
import type { VkAdsReadService } from "./readService";

function readService(overrides: Partial<VkAdsReadService> = {}): VkAdsReadService {
  return {
    async getSyncStatus() { return null; },
    async listCampaigns() { return { items: [], nextCursor: null }; },
    async listAdGroups() { return { items: [], nextCursor: null }; },
    async listAds() { return { items: [], nextCursor: null }; },
    async getAd() { return null; },
    async getStatistics() { return []; },
    async getCreativeImage() { return null; },
    ...overrides,
  } as VkAdsReadService;
}

test("MCP VK adapter delegates only seven local read operations", async () => {
  const calls: string[] = [];
  const service = createMcpVkAdsService(readService({
    async getSyncStatus() { calls.push("status"); return null; },
    async listCampaigns() { calls.push("campaigns"); return { items: [], nextCursor: null }; },
    async listAdGroups() { calls.push("groups"); return { items: [], nextCursor: null }; },
    async listAds() { calls.push("ads"); return { items: [], nextCursor: null }; },
    async getAd() { calls.push("ad"); return null; },
    async getStatistics() { calls.push("statistics"); return []; },
    async getCreativeImage(_id, maxBytes) { calls.push(`image:${maxBytes}`); return null; },
  }));
  assert.deepEqual(Object.keys(service).sort(), [
    "getAd", "getCreativeImage", "getStatistics", "getSyncStatus", "listAdGroups", "listAds", "listCampaigns",
  ]);
  await service.getSyncStatus();
  await service.listCampaigns({});
  await service.listAdGroups({});
  await service.listAds({});
  await service.getAd("ad-1");
  await service.getStatistics({ objectKind: "ad", externalIds: ["ad-1"], dateFrom: "2030-01-01", dateTo: "2030-01-02" });
  await assert.rejects(service.getCreativeImage("00000000-0000-4000-8000-000000000001"), /ads_vk_unavailable/u);
  assert.deepEqual(calls, ["status", "campaigns", "groups", "ads", "ad", "statistics", `image:${VK_ADS_MCP_IMAGE_MAX_BYTES}`]);
});

test("creative adapter validates image bytes before they can be base64 encoded", async () => {
  const bytes = Buffer.from("verified-image");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const valid = createMcpVkAdsService(readService({
    async getCreativeImage() { return { bytes, mimeType: "image/png", sha256 }; },
  }));
  assert.deepEqual(await valid.getCreativeImage("00000000-0000-4000-8000-000000000001"), { bytes, mimeType: "image/png", sha256 });

  for (const image of [
    { bytes: Buffer.alloc(VK_ADS_MCP_IMAGE_MAX_BYTES + 1), mimeType: "image/png", sha256: "a".repeat(64) },
    { bytes, mimeType: "text/html", sha256 },
    { bytes, mimeType: "image/png", sha256: "a".repeat(64) },
  ]) {
    const unsafe = createMcpVkAdsService(readService({ async getCreativeImage() { return image; } }));
    await assert.rejects(unsafe.getCreativeImage("00000000-0000-4000-8000-000000000001"), /ads_vk_(?:contract_invalid|storage_unavailable)/u);
  }
});

test("MCP adapter rejects forbidden fields and contacts from every JSON read boundary", async () => {
  const unsafeValues = [
    { items: [{ accessToken: "unsafe" }], nextCursor: null },
    { items: [{ targetingLabels: ["segment"] }], nextCursor: null },
    { items: [{ name: "owner@example.test" }], nextCursor: null },
    { items: [{ imageObjectKey: "ads/vk/private" }], nextCursor: null },
    { items: [{ landingPath: "/?utm_source=private" }], nextCursor: null },
  ];
  for (const value of unsafeValues) {
    const service = createMcpVkAdsService(readService({ async listAds() { return value; } }));
    await assert.rejects(service.listAds({}), /ads_vk_contract_invalid/u);
  }

  const numericId = createMcpVkAdsService(readService({
    async listAds() { return { items: [{ externalId: "1234567890" }], nextCursor: null }; },
  }));
  assert.deepEqual((await numericId.listAds({})).items, [{ externalId: "1234567890" }]);
});
