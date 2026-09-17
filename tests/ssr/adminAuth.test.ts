import assert from "node:assert/strict";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";

const runtimeConfig = {
  ADMIN_SESSION_HMAC_KEY: Buffer.alloc(32, 1).toString("base64"),
  ADMIN_RATE_LIMIT_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"),
  ADMIN_TRUSTED_ORIGIN: "https://kordev.team",
  PUBLIC_MEDIA_S3_ENDPOINT: "https://s3.example.invalid",
  PUBLIC_MEDIA_S3_REGION: "test-1",
  PUBLIC_MEDIA_S3_BUCKET: "public-test",
  PUBLIC_MEDIA_S3_ACCESS_KEY_ID: "fixture-access",
  PUBLIC_MEDIA_S3_SECRET_ACCESS_KEY: "fixture-secret",
  PUBLIC_MEDIA_S3_PREFIX: "media",
  PUBLIC_MEDIA_BASE_URL: "https://cdn.example.invalid/",
  PUBLIC_MEDIA_S3_SSE: "AES256",
};

test("production runtime permanently retires legacy admin API authentication", async t => {
  const runtime = await startTestRuntime({ ...runtimeConfig, NODE_ENV: "production", TRUST_PROXY_HOPS: "1" });
  t.after(runtime.close);

  for (const [method, path] of [["POST", "posts"], ["PUT", "projects"], ["DELETE", "content/example"], ["PATCH", "admin/me"]]) {
    const response = await fetch(`${runtime.origin}/api/${path}`, {
      method,
      headers: { authorization: "Bearer obsolete-token", "x-forwarded-proto": "https" },
    });
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "legacy_admin_gone" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("legacy read-only admin API is absent while the SSR admin route remains", async t => {
  const runtime = await startTestRuntime({ ...runtimeConfig, NODE_ENV: "production", TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);

  assert.equal((await fetch(`${runtime.origin}/api/admin/me`)).status, 404);
  const login = await fetch(`${runtime.origin}/admin/login/`);
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("x-robots-tag"), "noindex, nofollow");
});
