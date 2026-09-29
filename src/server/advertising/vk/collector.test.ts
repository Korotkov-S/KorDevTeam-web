import assert from "node:assert/strict";
import test from "node:test";

import type { VkAdsSyncReport } from "./contracts";
import { createVkAdsCollector } from "./collector";
import { VkAdsError } from "./errors";
import type { VkAdsProvider } from "./provider";
import type { VkAdsRepository } from "./repository";

const now = new Date("2030-01-10T10:00:00.000Z");

function dependencies(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const counters: Record<string, number> = {};
  const run = { id: "run-1", correlationId: "00000000-0000-4000-8000-000000000001", startedAt: now.toISOString() };
  const repository = {
    async checkReady() { calls.push("db:check"); },
    async findResumableBackfill() { return null; },
    async resumeBackfillRun() { calls.push("resume"); return run; },
    async startRun() { calls.push("run:start"); return run; },
    async storeAccount() { calls.push("account:store"); },
    async storeCampaignPage(input: { items: unknown[]; counters: Record<string, number> }) { calls.push("campaigns:store"); Object.assign(counters, add(counters, input.counters)); },
    async storeAdGroupPage(input: { items: unknown[]; counters: Record<string, number> }) { calls.push("groups:store"); Object.assign(counters, add(counters, input.counters)); },
    async storeAdPage(input: { items: unknown[]; creatives?: unknown[]; counters: Record<string, number> }) { calls.push(`ads:store:${input.creatives?.length ?? 0}`); Object.assign(counters, add(counters, input.counters)); },
    async storeMetricWindow(input: { items: unknown[]; counters: Record<string, number> }) { calls.push("metrics:store"); Object.assign(counters, add(counters, input.counters)); },
    async updateRunCheckpoint() {},
    async finishRun(_id: string, input: { status: string; errorCode: string | null }) { calls.push(`run:${input.status}:${input.errorCode ?? "ok"}`); },
    async getSyncStatusRow() { return { counters }; },
    async findStoredImageBySha256(sha: string) { calls.push(`sha:${sha}`); return sha.startsWith("a") ? "ads/vk/creatives/reused" : null; },
    async getEarliestCampaignCreatedAt() { return new Date("2030-01-01T00:00:00.000Z"); },
    async getLatestSourceUpdate() { return new Date("2030-01-08T12:00:00.000Z"); },
    async listExternalIds(kind: string) { return kind === "campaign" ? ["campaign-1"] : kind === "ad_group" ? ["group-1"] : ["ad-1"]; },
  } as unknown as VkAdsRepository;
  const provider: VkAdsProvider = {
    async checkAccount() { calls.push("provider:account"); return { externalId: "account-1", accountType: null, displayName: null, currency: "RUB", timezone: "Europe/Moscow", sourceUpdatedAt: now.toISOString() }; },
    async listCampaigns() { calls.push("provider:campaigns"); return { items: [{ externalId: "campaign-1", accountExternalId: "account-1", name: "Campaign", status: "active", objective: null, campaignType: null, budget: "100", schedule: {}, sourceCreatedAt: "2030-01-01T00:00:00.000Z", sourceUpdatedAt: now.toISOString() }], nextOffset: null }; },
    async listAdGroups(_page, since) { calls.push(`provider:groups:${since ?? "all"}`); return { items: [{ externalId: "group-1", accountExternalId: "account-1", campaignExternalId: "campaign-1", name: "Group", status: "active", packageSummary: null, optimizationSummary: null, bidStrategySummary: null, targetingLabels: [], sourceCreatedAt: now.toISOString(), sourceUpdatedAt: now.toISOString() }], nextOffset: null }; },
    async listAds(_page, since) { calls.push(`provider:ads:${since ?? "all"}`); return { items: [
      { externalId: "ad-1", accountExternalId: "account-1", campaignExternalId: "campaign-1", adGroupExternalId: "group-1", name: "Image", status: "active", moderationStatus: "approved", moderationReasonCode: null, landingOrigin: null, landingPath: null, sourceCreatedAt: now.toISOString(), sourceUpdatedAt: now.toISOString(), creative: { mediaKind: "image", format: "square", textBlocks: [], cta: null, width: 1, height: 1, durationSeconds: null, contentIds: [], imageSourceUrl: "https://cdn.example.test/a.png", videoSourceUrl: null } },
      { externalId: "ad-2", accountExternalId: "account-1", campaignExternalId: "campaign-1", adGroupExternalId: "group-1", name: "Video", status: "active", moderationStatus: "approved", moderationReasonCode: null, landingOrigin: null, landingPath: null, sourceCreatedAt: now.toISOString(), sourceUpdatedAt: now.toISOString(), creative: { mediaKind: "video", format: "video", textBlocks: [], cta: null, width: 1, height: 1, durationSeconds: 10, contentIds: [], imageSourceUrl: null, videoSourceUrl: "https://cdn.example.test/v.mp4" } },
    ], nextOffset: null }; },
    async getDailyStatistics(kind, ids, from, to) { calls.push(`stats:${kind}:${from}:${to}`); return ids.map((externalId) => ({ objectKind: kind, externalId, metricDate: from, timezone: "Europe/Moscow", spend: "1.000000", impressions: "1", reach: "1", clicks: "1", conversions: {}, sourceRevision: null })); },
    async downloadCreativeImage() { calls.push("image:download"); return { bytes: Buffer.from("image"), mimeType: "image/png", sha256: "a".repeat(64) }; },
  };
  const store = {
    async checkReady() { calls.push("storage:check"); },
    async putImage() { calls.push("image:put"); return { objectKey: "ads/vk/creatives/new" }; },
  };
  const locks = { async tryAcquireSyncLease() { calls.push("lock"); return { async release() { calls.push("release"); } }; } };
  return { calls, repository, provider, store, locks, now: () => new Date(now), ...overrides };
}

function add(left: Record<string, number>, right: Record<string, number>) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) result[key] = (result[key] ?? 0) + value;
  return result;
}

test("check validates account, database and storage without mirror writes", async () => {
  const deps = dependencies();
  const report = await createVkAdsCollector(deps).run("check");
  assert.equal(report.status, "succeeded");
  assert.deepEqual(deps.calls, ["lock", "db:check", "provider:account", "storage:check", "release"]);
});

test("backfill visits all entities, reuses image SHA, keeps video metadata and imports history", async () => {
  const deps = dependencies();
  const report = await createVkAdsCollector(deps).run("backfill");
  assert.equal(report.status, "succeeded");
  assert.equal(deps.calls.includes("image:put"), false);
  assert.equal(deps.calls.includes("ads:store:2"), true);
  assert.equal(deps.calls.some((call) => call.startsWith("stats:campaign:2030-01-01")), true);
  assert.equal(deps.calls.at(-1), "release");
});

test("daily uses one-day entity overlap and exactly seven Moscow dates", async () => {
  const deps = dependencies();
  const report = await createVkAdsCollector(deps).run("daily");
  assert.equal(report.status, "succeeded");
  assert.equal(deps.calls.includes("provider:groups:2030-01-07T12:00:00.000Z"), true);
  assert.equal(deps.calls.includes("provider:ads:2030-01-07T12:00:00.000Z"), true);
  assert.equal(deps.calls.some((call) => call === "stats:ad:2030-01-04:2030-01-10"), true);
});

test("lock contention performs no provider work and provider errors become bounded reports", async () => {
  const locked = dependencies({ locks: { async tryAcquireSyncLease() { return null; } } });
  const lockedReport = await createVkAdsCollector(locked).run("daily");
  assert.deepEqual({ status: lockedReport.status, errorCode: lockedReport.errorCode }, { status: "failed", errorCode: "ads_vk_sync_locked" });
  assert.equal(locked.calls.length, 0);

  const failed = dependencies();
  failed.provider.listCampaigns = async () => { throw new VkAdsError("ads_vk_rate_limited"); };
  const failedReport: VkAdsSyncReport = await createVkAdsCollector(failed).run("backfill");
  assert.deepEqual({ status: failedReport.status, errorCode: failedReport.errorCode }, { status: "failed", errorCode: "ads_vk_rate_limited" });
  assert.equal(failed.calls.at(-1), "release");
});

test("provider, contract, and storage failures keep only bounded error codes", async () => {
  for (const code of ["ads_vk_provider_unavailable", "ads_vk_contract_invalid"] as const) {
    const deps = dependencies();
    deps.provider.listCampaigns = async () => { throw new VkAdsError(code); };
    const report = await createVkAdsCollector(deps).run("daily");
    assert.deepEqual({ status: report.status, errorCode: report.errorCode }, { status: "failed", errorCode: code });
  }

  const storage = dependencies();
  storage.repository.findStoredImageBySha256 = async () => null;
  storage.store.putImage = async () => { throw new VkAdsError("ads_vk_storage_unavailable"); };
  const report = await createVkAdsCollector(storage).run("backfill");
  assert.deepEqual({ status: report.status, errorCode: report.errorCode }, {
    status: "partial",
    errorCode: "ads_vk_storage_unavailable",
  });
});

test("duplicate IDs across provider pages fail before being counted twice", async () => {
  const deps = dependencies();
  let page = 0;
  const original = deps.provider.listCampaigns;
  deps.provider.listCampaigns = async (input) => {
    const result = await original(input);
    page += 1;
    return { ...result, nextOffset: page === 1 ? 1 : null };
  };
  const report = await createVkAdsCollector(deps).run("backfill");
  assert.deepEqual({ status: report.status, errorCode: report.errorCode }, { status: "partial", errorCode: "ads_vk_contract_invalid" });
  assert.equal(deps.calls.filter((call) => call === "campaigns:store").length, 1);
});

test("a non-advancing provider offset terminates before any page write", async () => {
  const deps = dependencies();
  deps.provider.listCampaigns = async () => ({ items: [], nextOffset: 0 });
  const report = await createVkAdsCollector(deps).run("backfill");
  assert.deepEqual({ status: report.status, errorCode: report.errorCode }, {
    status: "failed",
    errorCode: "ads_vk_contract_invalid",
  });
  assert.equal(deps.calls.includes("campaigns:store"), false);
});
