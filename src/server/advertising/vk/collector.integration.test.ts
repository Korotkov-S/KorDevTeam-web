import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "drizzle-orm";

import { createDb } from "../../db/client";
import { adVkAds, adVkCampaigns, adVkCreativeVersions, adVkDailyMetrics } from "../../db/schema";
import { resetTestDatabase } from "../../db/testDatabase";
import { createVkAdsCollector } from "./collector";
import type { VkAdsProvider } from "./provider";
import { createVkAdsRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const observedAt = new Date("2030-01-03T10:00:00.000Z");

databaseTest("backfill resumes from the committed page after a crash without duplicates", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(db);
  const campaignOffsets: number[] = [];
  const provider: VkAdsProvider = {
    async checkAccount() {
      return { externalId: "account-1", accountType: null, displayName: "Account", currency: "RUB", timezone: "Europe/Moscow", sourceUpdatedAt: observedAt.toISOString() };
    },
    async listCampaigns({ offset }) {
      campaignOffsets.push(offset);
      if (offset > 2) assert.fail(`unexpected campaign offset ${offset}`);
      return {
        items: [{
          externalId: `campaign-${offset + 1}`,
          accountExternalId: "account-1",
          name: `Campaign ${offset + 1}`,
          status: "active",
          objective: null,
          campaignType: null,
          budget: "100.000000",
          schedule: {},
          sourceCreatedAt: `2030-01-0${offset + 1}T00:00:00.000Z`,
          sourceUpdatedAt: observedAt.toISOString(),
        }],
        nextOffset: offset < 2 ? offset + 1 : null,
      };
    },
    async listAdGroups({ offset }) {
      assert.equal(offset, 0);
      return { items: [{
        externalId: "group-1", accountExternalId: "account-1", campaignExternalId: "campaign-1", name: "Group",
        status: "active", packageSummary: null, optimizationSummary: null, bidStrategySummary: null,
        targetingLabels: [], sourceCreatedAt: observedAt.toISOString(), sourceUpdatedAt: observedAt.toISOString(),
      }], nextOffset: null };
    },
    async listAds({ offset }) {
      assert.equal(offset, 0);
      return { items: [{
        externalId: "ad-1", accountExternalId: "account-1", campaignExternalId: "campaign-1", adGroupExternalId: "group-1",
        name: "Ad", status: "active", moderationStatus: "approved", moderationReasonCode: null,
        landingOrigin: "https://example.test", landingPath: "/", sourceCreatedAt: observedAt.toISOString(), sourceUpdatedAt: observedAt.toISOString(),
        creative: { mediaKind: "video", format: "video", textBlocks: ["Safe"], cta: null, width: 1080, height: 1080,
          durationSeconds: 10, contentIds: ["content-1"], imageSourceUrl: null, videoSourceUrl: "https://cdn.example.test/video.mp4" },
      }], nextOffset: null };
    },
    async getDailyStatistics(kind, ids, dateFrom) {
      return ids.map((externalId) => ({
        objectKind: kind, externalId, metricDate: dateFrom, timezone: "Europe/Moscow", spend: "1.000000",
        impressions: "1", reach: "1", clicks: "1", conversions: {}, sourceRevision: null,
      }));
    },
    async downloadCreativeImage() { assert.fail("video metadata must not be downloaded"); },
  };
  const store = {
    async checkReady() {},
    async putImage() { assert.fail("video metadata must not be uploaded"); return { objectKey: "" }; },
  };
  const locks = { async tryAcquireSyncLease() { return { async release() {} }; } };

  let committedPages = 0;
  const first = await createVkAdsCollector({
    provider, repository, store, locks, now: () => new Date(observedAt),
    afterPageCommitted() {
      committedPages += 1;
      if (committedPages === 2) throw new Error("simulated process crash");
    },
  }).run("backfill");
  assert.equal(first.status, "partial");
  assert.equal(first.errorCode, "ads_vk_unavailable");
  assert.deepEqual(campaignOffsets, [0, 1]);
  assert.deepEqual((await repository.findResumableBackfill())?.checkpoint, { schemaVersion: 1, phase: "campaigns", offset: 2 });

  campaignOffsets.length = 0;
  const resumed = await createVkAdsCollector({ provider, repository, store, locks, now: () => new Date(observedAt) }).run("backfill");
  assert.deepEqual({ status: resumed.status, errorCode: resumed.errorCode }, { status: "succeeded", errorCode: null });
  assert.deepEqual(campaignOffsets, [2]);
  assert.equal(resumed.counters.campaigns, 3);

  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM ${adVkCampaigns}) AS campaigns,
      (SELECT count(*)::int FROM ${adVkAds}) AS ads,
      (SELECT count(*)::int FROM ${adVkCreativeVersions}) AS creatives,
      (SELECT count(*)::int FROM ${adVkDailyMetrics}) AS metrics,
      (SELECT count(*)::int FROM ${adVkCreativeVersions} WHERE active_to IS NULL) AS active_creatives
  `);
  assert.deepEqual(counts.rows[0], { campaigns: 3, ads: 1, creatives: 1, metrics: 5, active_creatives: 1 });
});
