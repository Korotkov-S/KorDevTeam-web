import assert from "node:assert/strict";
import test from "node:test";
import { readContentViewsConfig } from "./config";
const base = { NODE_ENV: "production", CONTENT_VIEWS_ENABLED: "true", CONTENT_VIEWS_TRUSTED_ORIGIN: "https://kordev.team", CONTENT_VIEWS_HASH_KEY: Buffer.alloc(32, 9).toString("base64") };
test("disabled feature needs no secret; enabled rejects unsafe origins and weak/noncanonical keys", () => {
  assert.equal(readContentViewsConfig({}).enabled, false);
  assert.equal(readContentViewsConfig(base).hashKey?.length, 32);
  for (const patch of [{ CONTENT_VIEWS_ENABLED: "yes" }, { CONTENT_VIEWS_HASH_KEY: "" }, { CONTENT_VIEWS_HASH_KEY: Buffer.alloc(31).toString("base64") }, { CONTENT_VIEWS_HASH_KEY: `${base.CONTENT_VIEWS_HASH_KEY}\n` }, { CONTENT_VIEWS_TRUSTED_ORIGIN: "http://kordev.team" }, { CONTENT_VIEWS_TRUSTED_ORIGIN: "https://user:pass@kordev.team" }, { CONTENT_VIEWS_TRUSTED_ORIGIN: "https://kordev.team/path" }]) assert.throws(() => readContentViewsConfig({ ...base, ...patch }), /content_views_config_invalid/);
});
test("HTTP fixture origins are allowed only on test loopback", () => {
  assert.doesNotThrow(() => readContentViewsConfig({ ...base, NODE_ENV: "test", CONTENT_VIEWS_TRUSTED_ORIGIN: "http://127.0.0.1:1234" }));
  for (const patch of [{ NODE_ENV: "development", CONTENT_VIEWS_TRUSTED_ORIGIN: "http://127.0.0.1:1234" }, { NODE_ENV: "test", CONTENT_VIEWS_TRUSTED_ORIGIN: "http://example.com" }]) assert.throws(() => readContentViewsConfig({ ...base, ...patch }));
});
