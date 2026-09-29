import assert from "node:assert/strict";
import test from "node:test";

import type { VkAdsConfig, VkAdsSyncReport } from "./contracts";
import { VkAdsError } from "./errors";
import { createVkAdsRuntime } from "./runtime";

const success = (mode: "check" | "backfill" | "daily"): VkAdsSyncReport => ({
  mode, status: "succeeded", errorCode: null, correlationId: "00000000-0000-4000-8000-000000000001",
  counters: {}, coveredDateFrom: null, coveredDateTo: null,
});

const enabledEnvironment = {
  DATABASE_URL: "postgresql://synthetic:synthetic@example.test:5432/synthetic",
  VK_ADS_SYNC_ENABLED: "true",
  VK_ADS_CLIENT_ID: "synthetic-client-id",
  VK_ADS_CLIENT_SECRET: "synthetic-client-secret",
  VK_ADS_TOKEN_ENCRYPTION_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
  VK_ADS_S3_ENDPOINT: "https://s3.example.test",
  VK_ADS_S3_REGION: "ru-1",
  VK_ADS_S3_BUCKET: "private-bucket",
  VK_ADS_S3_ACCESS_KEY_ID: "synthetic-storage-id",
  VK_ADS_S3_SECRET_ACCESS_KEY: "synthetic-storage-secret",
  VK_ADS_S3_SSE: "AES256",
  VK_ADS_ORIGIN: "https://attacker.example.test",
  VK_ADS_DAILY_LOOKBACK_DAYS: "90",
};

test("disabled runtime returns before constructing database, storage, OAuth, or provider dependencies", async () => {
  let constructed = 0;
  const runtime = createVkAdsRuntime({}, {
    buildCollector() { constructed += 1; throw new Error("must stay inert"); },
    buildReadService() { constructed += 1; throw new Error("must stay inert"); },
  });
  const report = await runtime.run("daily");
  assert.deepEqual({ status: report.status, errorCode: report.errorCode }, { status: "failed", errorCode: "ads_vk_disabled" });
  assert.equal(constructed, 0);
  assert.throws(() => runtime.getReadService(), (error: unknown) => error instanceof VkAdsError && error.code === "ads_vk_config_invalid");
});

test("read runtime needs only database and private read-storage credentials", () => {
  let collectorBuilds = 0;
  let readBuilds = 0;
  const { VK_ADS_CLIENT_ID: _clientId, VK_ADS_CLIENT_SECRET: _clientSecret,
    VK_ADS_TOKEN_ENCRYPTION_KEY_B64: _key, VK_ADS_SYNC_ENABLED: _enabled, ...readEnvironment } = enabledEnvironment;
  const runtime = createVkAdsRuntime(readEnvironment, {
    buildCollector() { collectorBuilds += 1; throw new Error("collector must stay isolated"); },
    buildReadService(storage, databaseUrl) {
      readBuilds += 1;
      assert.equal(storage.bucket, "private-bucket");
      assert.equal(databaseUrl, enabledEnvironment.DATABASE_URL);
      return { marker: "read" } as never;
    },
  });
  assert.deepEqual(runtime.getReadService(), { marker: "read" });
  assert.deepEqual(runtime.getReadService(), { marker: "read" });
  assert.equal(readBuilds, 1);
  assert.equal(collectorBuilds, 0);
});

test("enabled runtime keeps the production origin and fixed lookback", async () => {
  const seen: VkAdsConfig[] = [];
  const runtime = createVkAdsRuntime(enabledEnvironment, {
    buildCollector(config) {
      seen.push(config);
      return { run: async (mode) => success(mode) };
    },
    buildReadService() { return { marker: "read" } as never; },
  });
  assert.equal((await runtime.run("daily")).status, "succeeded");
  assert.equal(seen[0].origin.origin, "https://ads.vk.ru");
  assert.equal(seen[0].lookbackDays, 7);
});

test("invalid configuration and missing database URL become bounded failure reports", async () => {
  const invalid = createVkAdsRuntime({ VK_ADS_SYNC_ENABLED: "true" });
  assert.equal((await invalid.run("check")).errorCode, "ads_vk_config_invalid");
  const missingDatabase = createVkAdsRuntime({ ...enabledEnvironment, DATABASE_URL: undefined });
  assert.equal((await missingDatabase.run("backfill")).errorCode, "ads_vk_config_invalid");
});
