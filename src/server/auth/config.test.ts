import assert from "node:assert/strict";
import { test } from "node:test";

import { readAdminAuthConfig } from "./config";

const firstKey = Buffer.alloc(32, 1).toString("base64");
const secondKey = Buffer.alloc(32, 2).toString("base64");

test("reads separate canonical admin secrets and an HTTPS origin", () => {
  const config = readAdminAuthConfig({
    NODE_ENV: "production",
    ADMIN_SESSION_HMAC_KEY: firstKey,
    ADMIN_RATE_LIMIT_HMAC_KEY: secondKey,
    ADMIN_TRUSTED_ORIGIN: "https://kordev.team",
  });

  assert.equal(config.sessionHmacKey.byteLength, 32);
  assert.equal(config.rateLimitHmacKey.byteLength, 32);
  assert.equal(config.trustedOrigin.href, "https://kordev.team/");
  assert.equal(config.sessionTtlMs, 43_200_000);
});

test("rejects missing, weak, reused or noncanonical admin secrets", () => {
  const base = {
    NODE_ENV: "production",
    ADMIN_SESSION_HMAC_KEY: firstKey,
    ADMIN_RATE_LIMIT_HMAC_KEY: secondKey,
    ADMIN_TRUSTED_ORIGIN: "https://kordev.team",
  };

  for (const patch of [
    { ADMIN_SESSION_HMAC_KEY: "" },
    { ADMIN_SESSION_HMAC_KEY: Buffer.alloc(31).toString("base64") },
    { ADMIN_SESSION_HMAC_KEY: `${firstKey}\n` },
    { ADMIN_RATE_LIMIT_HMAC_KEY: firstKey },
    { ADMIN_TRUSTED_ORIGIN: "http://kordev.team" },
    { ADMIN_TRUSTED_ORIGIN: "https://user:pass@kordev.team" },
    { ADMIN_TRUSTED_ORIGIN: "https://kordev.team/path" },
  ]) {
    assert.throws(() => readAdminAuthConfig({ ...base, ...patch }), /admin_auth_config_invalid/);
  }
});

test("allows plain HTTP only for local non-production development", () => {
  assert.doesNotThrow(() => readAdminAuthConfig({
    NODE_ENV: "development",
    ADMIN_SESSION_HMAC_KEY: firstKey,
    ADMIN_RATE_LIMIT_HMAC_KEY: secondKey,
    ADMIN_TRUSTED_ORIGIN: "http://127.0.0.1:5173",
  }));
});
