import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "drizzle-orm";

import { createDb } from "../../db/client";
import { resetTestDatabase } from "../../db/testDatabase";
import { VK_ADS_MCP_IMAGE_MAX_BYTES } from "./config";
import type { VkAdsCampaignRecord } from "./contracts";
import { createVkAdsReadService } from "./readService";
import { createVkAdsRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const seen = "2030-01-10T10:00:00.000Z";

databaseTest("read service uses stable opaque cursors and rejects tamper or filter drift", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(createDb(TEST_DATABASE_URL));
  const run = await repository.startRun({ mode: "daily", stage: "campaigns", checkpoint: null });
  await repository.storeAccount({
    externalId: "account-1", accountType: null, displayName: null, currency: "RUB", timezone: "Europe/Moscow",
    sourceUpdatedAt: seen, fingerprint: "a".repeat(64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
  });
  const campaigns: VkAdsCampaignRecord[] = ["1", "2", "3"].map((id) => ({
    externalId: id, accountExternalId: "account-1", name: `Campaign ${id}`, status: id === "3" ? "blocked" : "active",
    objective: null, campaignType: null, budget: "100.000000", schedule: {}, sourceCreatedAt: seen,
    sourceUpdatedAt: seen, fingerprint: id.repeat(64).slice(0, 64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
  }));
  await repository.storeCampaignPage({ runId: run.id, items: campaigns, checkpoint: null, counters: {} });
  await repository.finishRun(run.id, { status: "succeeded", errorCode: null, coveredDateFrom: null, coveredDateTo: null });
  const service = createVkAdsReadService(repository, { async getImage() { assert.fail("image not expected"); } });

  const first = await service.listCampaigns({ limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  const second = await service.listCampaigns({ limit: 2, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.externalId)).size, 3);
  await assert.rejects(service.listCampaigns({ limit: 2, cursor: `${first.nextCursor}x` }), /ads_vk_contract_invalid/u);
  await assert.rejects(service.listCampaigns({ limit: 2, cursor: first.nextCursor, status: "active" }), /ads_vk_contract_invalid/u);
  assert.deepEqual((await service.listCampaigns({ limit: 10, status: "blocked" })).items.map((item) => item.externalId), ["3"]);
  assert.equal((await service.getSyncStatus()).status, "succeeded");
});

databaseTest("creative image reads enforce the separate MCP byte ceiling and missing images stay null", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(createDb(TEST_DATABASE_URL));
  const calls: string[] = [];
  const service = createVkAdsReadService(repository, {
    async getImage(key) { calls.push(key); return { bytes: Buffer.alloc(8), mimeType: "image/png", sha256: "a".repeat(64) }; },
  });
  assert.equal(await service.getCreativeImage("00000000-0000-4000-8000-000000000001", VK_ADS_MCP_IMAGE_MAX_BYTES), null);
  assert.equal(calls.length, 0);
  await assert.rejects(service.getCreativeImage("not-a-uuid", VK_ADS_MCP_IMAGE_MAX_BYTES), /ads_vk_contract_invalid/u);
  await assert.rejects(service.getCreativeImage("00000000-0000-4000-8000-000000000001", VK_ADS_MCP_IMAGE_MAX_BYTES + 1), /ads_vk_contract_invalid/u);
});

databaseTest("local reads filter hierarchy, preserve numeric precision and redact creative contacts", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(db);
  const run = await repository.startRun({ mode: "daily", stage: "campaigns", checkpoint: null });
  await repository.storeAccount({
    externalId: "account-1", accountType: null, displayName: null, currency: "RUB", timezone: "Europe/Moscow",
    sourceUpdatedAt: seen, fingerprint: "a".repeat(64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
  });
  await repository.storeCampaignPage({ runId: run.id, checkpoint: null, counters: {}, items: [{
    externalId: "campaign-1", accountExternalId: "account-1", name: "Campaign", status: "active",
    objective: null, campaignType: null, budget: "100.000000", schedule: {}, sourceCreatedAt: seen,
    sourceUpdatedAt: seen, fingerprint: "b".repeat(64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
  }] });
  await repository.storeAdGroupPage({ runId: run.id, checkpoint: null, counters: {}, items: [{
    externalId: "group-1", accountExternalId: "account-1", campaignExternalId: "campaign-1", name: "Group",
    status: "active", packageSummary: null, optimizationSummary: null, bidStrategySummary: null,
    targetingLabels: ["owner@example.test"], sourceCreatedAt: seen, sourceUpdatedAt: seen,
    fingerprint: "c".repeat(64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
  }] });
  await repository.storeAdPage({ runId: run.id, checkpoint: null, counters: {}, items: [{
    externalId: "ad-1", accountExternalId: "account-1", campaignExternalId: "campaign-1", adGroupExternalId: "group-1",
    name: "Ad", status: "active", moderationStatus: "approved", moderationReasonCode: null,
    landingOrigin: "https://example.test", landingPath: "/support/", sourceCreatedAt: seen, sourceUpdatedAt: seen,
    fingerprint: "d".repeat(64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
  }] });
  const objectKey = "ads/vk/creatives/11111111-2222-4333-8444-555555555555";
  await repository.storeCreativeVersion({
    adExternalId: "ad-1", mediaKind: "image", format: "square", textBlocks: ["Write owner@example.test"],
    cta: "Call +7 999 123-45-67", width: 1080, height: 1080, durationSeconds: null, contentIds: [],
    imageSourceUrl: null, videoSourceUrl: null, fingerprint: "e".repeat(64), imageSha256: "f".repeat(64),
    imageObjectKey: objectKey, activeFrom: seen, activeTo: null,
  });
  await repository.storeMetricWindow({ runId: run.id, checkpoint: null, counters: {}, items: [{
    objectKind: "ad", externalId: "ad-1", metricDate: "2030-01-09", timezone: "Europe/Moscow",
    spend: "123.450000", impressions: "9007199254740992", reach: "900", clicks: "12",
    conversions: { leads: "2" }, sourceRevision: null, fingerprint: "1".repeat(64), collectedAt: seen,
  }] });
  const image = { bytes: Buffer.from("small"), mimeType: "image/png", sha256: "f".repeat(64) };
  const service = createVkAdsReadService(repository, { async getImage(key) { assert.equal(key, objectKey); return image; } });

  const persisted = await db.execute(sql`
    SELECT targeting_labels::text AS value FROM ad_vk_ad_groups
    UNION ALL
    SELECT text_blocks::text AS value FROM ad_vk_creative_versions
    UNION ALL
    SELECT cta AS value FROM ad_vk_creative_versions
  `);
  const persistedText = JSON.stringify(persisted.rows);
  assert.doesNotMatch(persistedText, /owner@example\.test/u);
  assert.doesNotMatch(persistedText, /123-45-67/u);

  const groups = await service.listAdGroups({ limit: 10, campaignExternalId: "campaign-1" });
  assert.equal(groups.items.length, 1);
  assert.equal("targetingLabels" in groups.items[0], false);
  const ads = await service.listAds({ limit: 10, campaignExternalId: "campaign-1", adGroupExternalId: "group-1" });
  assert.equal(ads.items.length, 1);
  assert.equal(ads.items[0].landingOrigin, "https://example.test");
  assert.equal(ads.items[0].landingPath, "/support/");
  const detail = await service.getAd("ad-1");
  assert.deepEqual(detail?.creative?.textBlocks, ["[redacted]"]);
  assert.equal(detail?.creative?.cta, "[redacted]");
  const statistics = await service.getStatistics({ objectKind: "ad", externalIds: ["ad-1"], dateFrom: "2030-01-09", dateTo: "2030-01-09" });
  assert.equal(statistics[0].spend, "123.450000");
  assert.equal(statistics[0].impressions, "9007199254740992");
  assert.equal(statistics[0].reach, 900);
  assert.deepEqual(await service.getCreativeImage(detail!.creative!.id, VK_ADS_MCP_IMAGE_MAX_BYTES), image);
});
