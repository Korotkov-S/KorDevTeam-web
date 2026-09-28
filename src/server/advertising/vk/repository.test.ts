import assert from "node:assert/strict";
import test from "node:test";

import { and, eq, sql } from "drizzle-orm";

import { createDb } from "../../db/client";
import {
  adVkAds,
  adVkCampaigns,
  adVkCreativeVersions,
  adVkDailyMetrics,
  adVkSyncRuns,
} from "../../db/schema";
import { resetTestDatabase } from "../../db/testDatabase";
import type {
  VkAdsAccountRecord,
  VkAdsAdGroupRecord,
  VkAdsAdRecord,
  VkAdsCampaignRecord,
  VkAdsCreativeVersionRecord,
  VkAdsDailyMetricRecord,
} from "./contracts";
import { createVkAdsRepository } from "./repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const seen = "2030-01-10T10:00:00.000Z";
const account: VkAdsAccountRecord = {
  externalId: "account-1", accountType: "agency", displayName: "Account", currency: "RUB",
  timezone: "Europe/Moscow", sourceUpdatedAt: seen, fingerprint: "a".repeat(64),
  firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
};
const campaign: VkAdsCampaignRecord = {
  externalId: "campaign-1", accountExternalId: "account-1", name: "Campaign", status: "active",
  objective: "traffic", campaignType: "auction", budget: "1000.000000", schedule: {},
  sourceCreatedAt: seen, sourceUpdatedAt: seen, fingerprint: "b".repeat(64),
  firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
};
const group: VkAdsAdGroupRecord = {
  externalId: "group-1", accountExternalId: "account-1", campaignExternalId: "campaign-1",
  name: "Group", status: "active", packageSummary: "social", optimizationSummary: "clicks",
  bidStrategySummary: "minimum", targetingLabels: ["B2B"], sourceCreatedAt: seen, sourceUpdatedAt: seen,
  fingerprint: "c".repeat(64), firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
};
const ad: VkAdsAdRecord = {
  externalId: "ad-1", accountExternalId: "account-1", campaignExternalId: "campaign-1",
  adGroupExternalId: "group-1", name: "Ad", status: "active", moderationStatus: "approved",
  moderationReasonCode: null, landingOrigin: "https://example.test", landingPath: "/support/",
  sourceCreatedAt: seen, sourceUpdatedAt: seen, fingerprint: "d".repeat(64),
  firstSeenAt: seen, lastSeenAt: seen, inactiveAt: null,
};
const creative = (fingerprint: string, activeFrom: string, imageSha256 = "e".repeat(64)): VkAdsCreativeVersionRecord => ({
  adExternalId: "ad-1", accountExternalId: "account-1", mediaKind: "image", format: "square", textBlocks: ["Support"], cta: "More",
  width: 1080, height: 1080, durationSeconds: null, contentIds: ["content-1"], imageSourceUrl: null,
  videoSourceUrl: null, fingerprint, imageSha256, imageObjectKey: `ads/vk/creatives/11111111-2222-4333-8444-${fingerprint.slice(0, 12)}`,
  activeFrom, activeTo: null,
});
const metric = (clicks: string, fingerprint: string): VkAdsDailyMetricRecord => ({
  objectKind: "ad", externalId: "ad-1", metricDate: "2030-01-09", timezone: "Europe/Moscow",
  spend: "123.450000", impressions: "1000", reach: "900", clicks, conversions: { leads: "2" },
  sourceRevision: "revision-1", fingerprint, collectedAt: seen,
});

databaseTest("mirror writes are idempotent, transactional and preserve creative history", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(db);
  const run = await repository.startRun({ mode: "backfill", stage: "campaigns", checkpoint: { schemaVersion: 1, phase: "campaigns", offset: 0 } });
  await repository.storeAccount(account);
  await repository.storeAccount(account);
  await repository.storeCampaignPage({ runId: run.id, items: [campaign], checkpoint: { schemaVersion: 1, phase: "ad_groups", offset: 0 }, counters: { campaignsRead: 1 } });
  await repository.storeCampaignPage({ runId: run.id, items: [campaign], checkpoint: { schemaVersion: 1, phase: "ad_groups", offset: 0 }, counters: {} });
  await repository.storeAdGroupPage({ runId: run.id, items: [group], checkpoint: { schemaVersion: 1, phase: "ads", offset: 0 }, counters: { adGroupsRead: 1 } });
  await repository.storeAdPage({ runId: run.id, items: [ad], checkpoint: { schemaVersion: 1, phase: "ads", offset: 1 }, counters: { adsRead: 1 } });

  assert.equal(await repository.storeCreativeVersion(creative("f".repeat(64), "2030-01-10T10:00:00.000Z")), "created");
  assert.equal(await repository.storeCreativeVersion(creative("f".repeat(64), "2030-01-10T11:00:00.000Z")), "unchanged");
  assert.equal(await repository.storeCreativeVersion(creative("1".repeat(64), "2030-01-10T12:00:00.000Z", "9".repeat(64))), "created");
  assert.equal(await repository.findStoredImageBySha256("e".repeat(64)), creative("f".repeat(64), seen).imageObjectKey);

  await repository.storeMetricWindow({ runId: run.id, items: [metric("10", "2".repeat(64))], checkpoint: null, counters: { metricRows: 1 } });
  await repository.storeMetricWindow({ runId: run.id, items: [metric("12", "3".repeat(64))], checkpoint: null, counters: { correctedRows: 1 } });

  const [storedRun] = await db.select().from(adVkSyncRuns).where(eq(adVkSyncRuns.id, run.id));
  assert.deepEqual(storedRun.counters, { campaignsRead: 1, adGroupsRead: 1, adsRead: 1, metricRows: 1, correctedRows: 1 });
  assert.equal(storedRun.checkpoint, null);
  assert.equal((await db.select().from(adVkCampaigns)).length, 1);
  assert.equal((await db.select().from(adVkAds)).length, 1);
  const versions = await db.select().from(adVkCreativeVersions).orderBy(adVkCreativeVersions.activeFrom);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].activeTo?.toISOString(), "2030-01-10T12:00:00.000Z");
  assert.equal(versions[1].activeTo, null);
  const [storedMetric] = await db.select().from(adVkDailyMetrics);
  assert.equal(storedMetric.clicks, 12n);
  assert.match(storedMetric.fingerprint, /^[a-f0-9]{64}$/u);
  assert.notEqual(storedMetric.fingerprint, "3".repeat(64));

  const resumable = await repository.findResumableBackfill();
  assert.equal(resumable?.id, run.id);
  await repository.finishRun(run.id, { status: "partial", errorCode: "ads_vk_sync_partial", coveredDateFrom: "2030-01-01", coveredDateTo: "2030-01-09" });
  assert.equal((await repository.findResumableBackfill())?.id, run.id);
});

databaseTest("explicit blocked status marks inactive while absence changes nothing and returns stay safe", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createVkAdsRepository(db);
  const run = await repository.startRun({ mode: "daily", stage: "campaigns", checkpoint: null });
  await repository.storeAccount(account);
  await repository.storeCampaignPage({ runId: run.id, items: [campaign], checkpoint: null, counters: {} });
  const [before] = await db.select().from(adVkCampaigns);
  assert.equal(before.inactiveAt, null);
  await repository.updateRunCheckpoint(run.id, { stage: "idle", checkpoint: null, counters: {} });
  const [absent] = await db.select().from(adVkCampaigns);
  assert.equal(absent.inactiveAt, null);
  await repository.storeCampaignPage({ runId: run.id, items: [{ ...campaign, status: "blocked", lastSeenAt: "2030-01-11T10:00:00.000Z" }], checkpoint: null, counters: {} });
  const [blocked] = await db.select().from(adVkCampaigns);
  assert.equal(blocked.inactiveAt?.toISOString(), "2030-01-11T10:00:00.000Z");

  const safe = JSON.stringify(await repository.getSyncStatusRow());
  assert.doesNotMatch(safe, /targeting|encrypted|owner@|\?utm_/iu);
  assert.equal((await db.execute(sql`SELECT count(*)::int AS count FROM ${adVkCampaigns}`)).rows[0].count, 1);
});
