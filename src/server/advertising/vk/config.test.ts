import assert from "node:assert/strict";
import test from "node:test";

import {
  VK_ADS_DAILY_LOOKBACK_DAYS,
  VK_ADS_IMAGE_MAX_BYTES,
  VK_ADS_MCP_IMAGE_MAX_BYTES,
  VK_ADS_ORIGIN,
  readVkAdsConfig,
  safeVkAdsConfigSummary,
} from "./config";
import { redactVkAdsLogRecord, VkAdsError } from "./errors";

const enabledEnvironment = (overrides: Record<string, string | undefined> = {}) => ({
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
  ...overrides,
});

test("disabled config is inert and secret-free", () => {
  const config = readVkAdsConfig({
    VK_ADS_CLIENT_SECRET: "ignored-secret",
    VK_ADS_TOKEN_ENCRYPTION_KEY_B64: "not-base64",
    VK_ADS_S3_ENDPOINT: "http://127.0.0.1/private",
  });

  assert.deepEqual(config, {
    enabled: false,
    origin: new URL("https://ads.vk.ru"),
    lookbackDays: 7,
  });
  assert.equal(VK_ADS_DAILY_LOOKBACK_DAYS, 7);
  assert.equal(VK_ADS_IMAGE_MAX_BYTES, 20 * 1024 * 1024);
  assert.equal(VK_ADS_MCP_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.doesNotMatch(JSON.stringify(config), /ignored-secret|not-base64|127\.0\.0\.1/u);
});

test("enabled config requires exact credentials and a 32-byte base64 key", () => {
  assert.throws(
    () => readVkAdsConfig({ VK_ADS_SYNC_ENABLED: "true" }),
    (error: unknown) => error instanceof VkAdsError && error.code === "ads_vk_config_invalid",
  );

  for (const value of [Buffer.alloc(31).toString("base64"), Buffer.alloc(33).toString("base64"), "not-base64!"]) {
    assert.throws(() => readVkAdsConfig(enabledEnvironment({ VK_ADS_TOKEN_ENCRYPTION_KEY_B64: value })), /ads_vk_config_invalid/u);
  }
  for (const [name, value] of [
    ["VK_ADS_CLIENT_ID", " synthetic-client-id"],
    ["VK_ADS_CLIENT_SECRET", ""],
    ["VK_ADS_S3_REGION", "ru-1 "],
    ["VK_ADS_S3_BUCKET", ""],
    ["VK_ADS_S3_ACCESS_KEY_ID", " id"],
    ["VK_ADS_S3_SECRET_ACCESS_KEY", "secret "],
  ] as const) {
    assert.throws(() => readVkAdsConfig(enabledEnvironment({ [name]: value })), /ads_vk_config_invalid/u);
  }

  const config = readVkAdsConfig(enabledEnvironment());
  assert.equal(config.enabled, true);
  if (!config.enabled) assert.fail("enabled config expected");
  assert.equal(config.origin.href, "https://ads.vk.ru/");
  assert.equal(config.lookbackDays, 7);
  assert.equal(config.tokenEncryptionKey.length, 32);
  assert.deepEqual(config.storage, {
    endpoint: new URL("https://s3.example.test/"),
    region: "ru-1",
    bucket: "private-bucket",
    accessKeyId: "synthetic-storage-id",
    secretAccessKey: "synthetic-storage-secret",
    prefix: "ads/vk/creatives",
    serverSideEncryption: "AES256",
  });
});

test("production constants cannot be overridden", () => {
  const config = readVkAdsConfig(enabledEnvironment({
    VK_ADS_ORIGIN: "https://attacker.example.test",
    VK_ADS_DAILY_LOOKBACK_DAYS: "90",
  }));
  assert.equal(config.origin.href, "https://ads.vk.ru/");
  assert.equal(config.lookbackDays, 7);

  for (const value of ["TRUE", "1", "yes", " false", "false "]) {
    assert.throws(() => readVkAdsConfig({ VK_ADS_SYNC_ENABLED: value }), /ads_vk_config_invalid/u);
  }
  assert.equal(readVkAdsConfig({ VK_ADS_SYNC_ENABLED: "false" }).enabled, false);

  for (const endpoint of [
    "http://s3.example.test",
    "https://user:password@s3.example.test",
    "https://s3.example.test:8443",
    "https://s3.example.test/path",
    "https://s3.example.test?token=secret",
    "https://s3.example.test#fragment",
  ]) {
    assert.throws(() => readVkAdsConfig(enabledEnvironment({ VK_ADS_S3_ENDPOINT: endpoint })), /ads_vk_config_invalid/u);
  }
  assert.throws(() => readVkAdsConfig(enabledEnvironment({ VK_ADS_S3_SSE: "aws:kms" })), /ads_vk_config_invalid/u);
});

test("production origin cannot be mutated by a consumer", () => {
  const exposed = VK_ADS_ORIGIN as unknown;
  if (exposed instanceof URL) exposed.hostname = "attacker.example.test";

  assert.equal(readVkAdsConfig(enabledEnvironment()).origin.href, "https://ads.vk.ru/");
});

test("safe summary exposes fingerprints but no credential material", () => {
  const config = readVkAdsConfig(enabledEnvironment());
  const summary = safeVkAdsConfigSummary(config);
  const serialized = JSON.stringify(summary);

  assert.deepEqual(Object.keys(summary).sort(), ["clientIdFingerprint", "enabled", "lookbackDays", "origin", "storageReady"]);
  assert.equal(summary.enabled, true);
  assert.equal(summary.origin, "https://ads.vk.ru");
  assert.equal(summary.lookbackDays, 7);
  assert.equal(summary.storageReady, true);
  assert.match(String(summary.clientIdFingerprint), /^[a-f0-9]{16}$/u);
  assert.doesNotMatch(serialized, /synthetic-client-id|synthetic-client-secret|synthetic-storage|private-bucket|encryption/u);

  assert.deepEqual(safeVkAdsConfigSummary(readVkAdsConfig({})), {
    enabled: false,
    origin: "https://ads.vk.ru",
    lookbackDays: 7,
    storageReady: false,
  });
});

test("structured log redaction removes secrets and contacts recursively", () => {
  const input = {
    event: "vk_sync",
    accessToken: "plain-access-token",
    nested: {
      client_secret: "plain-client-secret",
      email: "owner@example.test",
      note: "Call +7 (999) 123-45-67 or write person@example.test",
      correlationId: "11111111-1111-4111-8111-111111111111",
      fingerprint: "a".repeat(64),
      values: Array.from({ length: 105 }, (_, index) => index),
    },
    long: "x".repeat(5_000),
  };

  const redacted = redactVkAdsLogRecord(input) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);
  assert.doesNotMatch(serialized, /plain-access-token|plain-client-secret|owner@example|person@example|123-45-67/u);
  assert.equal("accessToken" in redacted, false);
  const nested = redacted.nested as Record<string, unknown>;
  assert.equal("client_secret" in nested, false);
  assert.equal("email" in nested, false);
  assert.equal(nested.note, "[redacted]");
  assert.equal(nested.correlationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(nested.fingerprint, "a".repeat(64));
  assert.equal((nested.values as unknown[]).length, 100);
  assert.equal(String(redacted.long).length, 4_000);

  const error = new VkAdsError("ads_vk_provider_unavailable");
  assert.equal(error.message, "ads_vk_provider_unavailable");
  assert.equal(error.code, "ads_vk_provider_unavailable");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { code: "ads_vk_provider_unavailable" });
});
