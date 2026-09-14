import assert from "node:assert/strict";
import test from "node:test";
import { assertLeadWebConfig, readLeadWebConfig, readLeadWorkerConfig } from "./config";

const productionEnvironment = {
  NODE_ENV: "production",
  LEAD_CONSENT_VERSION: "2026-09-14",
  LEAD_HASH_KEY: Buffer.alloc(32, 7).toString("base64"),
  LEAD_TEMP_ROOT: "/private/leads",
  LEAD_S3_ENDPOINT: "https://s3.example.invalid",
  LEAD_S3_REGION: "ru-1",
  LEAD_S3_BUCKET: "private-leads",
  LEAD_S3_ACCESS_KEY_ID: "fixture-access",
  LEAD_S3_SECRET_ACCESS_KEY: "fixture-secret",
  LEAD_S3_PREFIX: "intake/",
  LEAD_S3_SSE: "AES256",
  CLAMAV_HOST: "clamav",
  CLAMAV_PORT: "3310",
  CRM_INTAKE_ENDPOINT: "https://crm.example.invalid/api/v1/board-intake/public-id/requests",
  CRM_INTAKE_TOKEN: "fixture-token",
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "fixture-user",
  SMTP_PASSWORD: "fixture-password",
  SMTP_FROM: "team@korotkov.dev",
  LEAD_EMAIL_TO: "team@korotkov.dev",
};

test("reads structurally valid production configuration without exposing values", () => {
  const web = readLeadWebConfig(productionEnvironment);
  const worker = readLeadWorkerConfig(productionEnvironment);

  assert.equal(web.s3.endpoint.href, "https://s3.example.invalid/");
  assert.equal(web.clamav.port, 3310);
  assert.equal(worker.crm.timeoutMs, 15_000);
  assert.equal(worker.smtp.to, "team@korotkov.dev");
  assert.doesNotThrow(() => assertLeadWebConfig(productionEnvironment));
});

test("rejects incomplete or unsafe lead configuration with stable errors", () => {
  const missingHash = { ...productionEnvironment, LEAD_HASH_KEY: "" };
  const shortHash = { ...productionEnvironment, LEAD_HASH_KEY: Buffer.alloc(31).toString("base64") };
  const invalidEndpoint = { ...productionEnvironment, CRM_INTAKE_ENDPOINT: "http://crm.example.invalid/api/v1/board-intake/public-id/requests" };
  const wrongRecipient = { ...productionEnvironment, LEAD_EMAIL_TO: "other@example.invalid" };

  for (const environment of [missingHash, shortHash, invalidEndpoint, wrongRecipient]) {
    assert.throws(() => readLeadWorkerConfig(environment), /lead_config_invalid/);
  }
});
