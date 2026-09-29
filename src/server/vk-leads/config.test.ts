import assert from "node:assert/strict";
import test from "node:test";

import { readVkLeadWebhookConfig } from "./config";

const environment = {
  LEAD_HASH_KEY: Buffer.alloc(32, 7).toString("base64"),
  VK_LEAD_WEBHOOK_PATH_TOKEN: "a".repeat(64),
  VK_LEAD_FORM_IDS: "1001168,1001220",
  VK_LEAD_CONSENT_VERSION: "vk-form-2026-09-23",
};

test("reads the webhook token and exact allowlist without exposing provider credentials", () => {
  const config = readVkLeadWebhookConfig(environment);

  assert.equal(config.pathToken, "a".repeat(64));
  assert.deepEqual([...config.forms.keys()], ["1001168", "1001220"]);
  assert.equal(config.consentVersion, "vk-form-2026-09-23");
});

test("rejects weak tokens, malformed form allowlists and incomplete consent metadata", () => {
  const invalid = [
    { ...environment, VK_LEAD_WEBHOOK_PATH_TOKEN: "short" },
    { ...environment, VK_LEAD_WEBHOOK_PATH_TOKEN: "z".repeat(64) },
    { ...environment, VK_LEAD_FORM_IDS: "1001168,1001168" },
    { ...environment, VK_LEAD_FORM_IDS: "1001168,not-an-id" },
    { ...environment, VK_LEAD_FORM_IDS: "" },
    { ...environment, VK_LEAD_CONSENT_VERSION: "" },
    { ...environment, LEAD_HASH_KEY: Buffer.alloc(8).toString("base64") },
  ];

  for (const value of invalid) {
    assert.throws(() => readVkLeadWebhookConfig(value), /vk_lead_config_invalid/);
  }
});
