import assert from "node:assert/strict";
import { test } from "node:test";

import { readPublicMediaConfig } from "./config";

const environment = {
  PUBLIC_MEDIA_S3_ENDPOINT: "https://s3.twcstorage.ru",
  PUBLIC_MEDIA_S3_REGION: "ru-1",
  PUBLIC_MEDIA_S3_BUCKET: "kordev-public",
  PUBLIC_MEDIA_S3_ACCESS_KEY_ID: "access",
  PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: "secret",
  PUBLIC_MEDIA_S3_PREFIX: "media",
  PUBLIC_MEDIA_S3_SSE: "AES256",
  PUBLIC_MEDIA_BASE_URL: "https://cdn.kordev.team/",
};

test("reads a strict public media configuration", () => {
  const config = readPublicMediaConfig(environment);
  assert.equal(config.endpoint.href, "https://s3.twcstorage.ru/");
  assert.equal(config.publicBaseUrl.href, "https://cdn.kordev.team/");
  assert.equal(config.prefix, "media");
  assert.equal(config.serverSideEncryption, "AES256");
});

test("accepts provider-managed encryption for S3-compatible storage", () => {
  const config = readPublicMediaConfig({ ...environment, PUBLIC_MEDIA_S3_SSE: "provider" });
  assert.equal(config.serverSideEncryption, "provider");
});

test("rejects unsafe endpoint, base URL, prefix and encryption", () => {
  for (const patch of [
    { PUBLIC_MEDIA_S3_ENDPOINT: "http://s3.twcstorage.ru" },
    { PUBLIC_MEDIA_BASE_URL: "https://cdn.kordev.team/?token=secret" },
    { PUBLIC_MEDIA_S3_PREFIX: "../media" },
    { PUBLIC_MEDIA_S3_SSE: "none" },
    { PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: "" },
  ]) assert.throws(() => readPublicMediaConfig({ ...environment, ...patch }), /public_media_config_invalid/);
});
