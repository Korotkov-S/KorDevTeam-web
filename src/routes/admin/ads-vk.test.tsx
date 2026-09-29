import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createAdminCookie } from "../../server/auth/cookie";
import type { VkAdsReadService } from "../../server/advertising/vk/readService";
import { createVkAdsAdminLoader } from "./ads-vk.server";
import { VkAdsCabinetPage, type VkAdsCabinetData } from "./ads-vk";
import { createVkAdsCreativeLoader } from "./ads-vk-creative.server";

const SESSION = "a".repeat(43);
const CREATIVE_ID = "00000000-0000-4000-8000-000000000123";
const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: "b".repeat(43),
  expiresAt: new Date("2030-01-10T21:00:00.000Z"),
};
const auth = { authenticate: async () => principal };

function request(path: string) {
  return new Request(`https://kordev.team${path}`, {
    headers: { cookie: createAdminCookie(SESSION), "x-kordev-csp-nonce": "c".repeat(22) },
  });
}

function service(overrides: Partial<VkAdsReadService> = {}): VkAdsReadService {
  return {
    async getSyncStatus() { return { id: "run-1", mode: "daily", status: "succeeded", stage: "complete", startedAt: "2030-01-10T03:30:00.000Z", finishedAt: "2030-01-10T03:31:00.000Z", coveredDateFrom: "2030-01-04", coveredDateTo: "2030-01-10", counters: { ads: 1 }, errorCode: null, correlationId: "00000000-0000-4000-8000-000000000003" }; },
    async listCampaigns() { return { items: [{ externalId: "campaign-1", name: "Кампания", status: "active", budget: "1500.000000", lastSeenAt: "2030-01-10T03:31:00.000Z" }], nextCursor: null }; },
    async listAdGroups() { return { items: [{ externalId: "group-1", campaignExternalId: "campaign-1", name: "Группа", status: "active", lastSeenAt: "2030-01-10T03:31:00.000Z" }], nextCursor: null }; },
    async listAds() { return { items: [{ externalId: "ad-1", campaignExternalId: "campaign-1", adGroupExternalId: "group-1", name: "Объявление", status: "active", moderationStatus: "approved", landingOrigin: "https://example.test", landingPath: "/support/", lastSeenAt: "2030-01-10T03:31:00.000Z" }], nextCursor: "next.cursor" }; },
    async getAd() { return { externalId: "ad-1", name: "Объявление", status: "active", moderationStatus: "approved", creative: { id: CREATIVE_ID, mediaKind: "image", textBlocks: ["Поддержка сайта"], cta: "Подробнее", format: "square", width: 1080, height: 1080, durationSeconds: null, contentIds: [], hasImage: true, videoSourceUrl: null, activeFrom: "2030-01-10T03:31:00.000Z", activeTo: null } }; },
    async getStatistics(input) { return input.externalIds.map(externalId => ({ objectKind: input.objectKind, externalId, metricDate: input.dateFrom, timezone: "Europe/Moscow", spend: "125.500000", impressions: 1000, reach: 800, clicks: 20, conversions: { leads: "2" }, sourceRevision: null, fingerprint: "a".repeat(64), collectedAt: "2030-01-10T03:31:00.000Z" })); },
    async getCreativeImage() { return null; },
    ...overrides,
  } as VkAdsReadService;
}

test("VK admin loader authenticates and rejects unknown, repeated, and invalid filters", async () => {
  const unauthenticated = createVkAdsAdminLoader({ authenticate: async () => null }, service());
  await assert.rejects(() => unauthenticated({ request: new Request("https://kordev.team/admin/ads/vk/"), params: {}, context: {} }),
    (error: unknown) => error instanceof Response && error.status === 302);

  for (const query of [
    "unknown=1", "view=ads&view=groups", "limit=101", "cursor=bad", "dateFrom=2030-01-01",
    "dateFrom=2030-01-10&dateTo=2030-01-01", "dateFrom=2028-01-01&dateTo=2030-01-01",
  ]) {
    const response = await createVkAdsAdminLoader(auth, service())({
      request: request(`/admin/ads/vk/?${query}`), params: {}, context: {},
    });
    assert.equal(response.status, 422, query);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("VK admin loader returns safe local data, details, statistics, and preserved filters", async () => {
  const response = await createVkAdsAdminLoader(auth, service())({
    request: request("/admin/ads/vk/?view=ads&campaignExternalId=campaign-1&limit=25&dateFrom=2030-01-04&dateTo=2030-01-10"),
    params: {}, context: {},
  });
  assert.equal(response.status, 200);
  const body = await response.json() as VkAdsCabinetData;
  assert.equal(body.view, "ads");
  assert.equal(body.page.items.length, 1);
  assert.equal(body.details[0]?.creative?.id, CREATIVE_ID);
  assert.equal(body.statistics[0]?.spend, "125.500000");
  assert.equal(body.filters.campaignExternalId, "campaign-1");
  assert.doesNotMatch(JSON.stringify(body), /targetingLabels|imageObjectKey|accessToken|owner@example|\?utm_/iu);
});

test("VK admin loader maps repository failures to a generic 503", async () => {
  const response = await createVkAdsAdminLoader(auth, service({
    async getSyncStatus() { throw new Error("private database token detail"); },
  }))({ request: request("/admin/ads/vk/"), params: {}, context: {} });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private|database|token/iu);
});

test("creative proxy authenticates, validates IDs, and returns private verified bytes", async () => {
  const bytes = Buffer.from("private-image");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const loader = createVkAdsCreativeLoader(auth, service({
    async getCreativeImage() { return { bytes, mimeType: "image/png", sha256 }; },
  }));
  const response = await loader({ request: request(`/admin/ads/vk/creative/${CREATIVE_ID}/`), params: { id: CREATIVE_ID }, context: {} });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Content-Length"), String(bytes.length));
  assert.equal(response.headers.get("ETag"), `"${sha256}"`);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /default-src 'self'/u);

  const invalid = await loader({ request: request("/admin/ads/vk/creative/bad/"), params: { id: "bad" }, context: {} });
  assert.equal(invalid.status, 404);
  const missing = await createVkAdsCreativeLoader(auth, service())({
    request: request(`/admin/ads/vk/creative/${CREATIVE_ID}/`), params: { id: CREATIVE_ID }, context: {},
  });
  assert.equal(missing.status, 404);
});

test("VK cabinet presentation shows facts and no mutation surface", () => {
  const data: VkAdsCabinetData = {
    view: "ads",
    filters: { view: "ads", limit: 25, campaignExternalId: "campaign-1", dateFrom: "2030-01-04", dateTo: "2030-01-10" },
    sync: { status: "succeeded", finishedAt: "2030-01-10T03:31:00.000Z", coveredDateFrom: "2030-01-04", coveredDateTo: "2030-01-10", counters: { ads: 1 } },
    page: { items: [{ externalId: "ad-1", name: "Объявление", status: "active", moderationStatus: "approved", landingOrigin: "https://example.test", landingPath: "/support/", lastSeenAt: "2030-01-10T03:31:00.000Z" }], nextCursor: "next.cursor" },
    details: [{ externalId: "ad-1", creative: { id: CREATIVE_ID, mediaKind: "image", textBlocks: ["Поддержка сайта"], cta: "Подробнее", format: "square", hasImage: true, videoSourceUrl: null } }],
    statistics: [{ externalId: "ad-1", metricDate: "2030-01-04", spend: "125.500000", impressions: 1000, reach: 800, clicks: 20, conversions: { leads: "2" } }],
  };
  const rendered = renderToStaticMarkup(<VkAdsCabinetPage data={data} />);
  assert.match(rendered, /VK кабинет/u);
  assert.match(rendered, /125[,.]50|125\.500000/u);
  assert.match(rendered, /Поддержка сайта/u);
  assert.match(rendered, new RegExp(`/admin/ads/vk/creative/${CREATIVE_ID}/`, "u"));
  assert.equal((rendered.match(/<form/gu) ?? []).length, 0);
  assert.doesNotMatch(rendered, /обновить|backfill|запустить|остановить|изменить бюджет|ставк|редактировать|method="post"/iu);
});
