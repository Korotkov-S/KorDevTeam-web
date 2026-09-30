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

test("legacy read-only admin API is absent while admin login exposes password recovery", async t => {
  const runtime = await startTestRuntime({ ...runtimeConfig, NODE_ENV: "production", TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);

  assert.equal((await fetch(`${runtime.origin}/api/admin/me`)).status, 404);
  const login = await fetch(`${runtime.origin}/admin/login/`);
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await login.text(), /href="\/admin\/forgot-password\/"[^>]*>Забыли пароль\?/);

  const forgot = await fetch(`${runtime.origin}/admin/forgot-password/`);
  assert.equal(forgot.status, 200);
  assert.equal(forgot.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await forgot.text(), /name="login"/);

  const resetUrl = `${runtime.origin}/admin/reset-password/?token=${"t".repeat(43)}`;
  const browserHeaders = { accept: "text/html,application/xhtml+xml" };
  const resetCapture = await fetch(resetUrl, { headers: browserHeaders, redirect: "manual" });
  const resetBrowser = await fetch(resetUrl, { headers: browserHeaders, redirect: "manual" });
  assert.equal(resetCapture.status, 200);
  assert.equal(resetCapture.headers.get("location"), null);
  assert.equal(resetBrowser.status, 200);
  assert.equal(resetBrowser.headers.get("location"), null);
  assert.equal(resetBrowser.headers.get("cache-control"), "no-store");
  assert.equal(resetBrowser.headers.get("referrer-policy"), "no-referrer");
  assert.ok(resetBrowser.headers.getSetCookie().some(value =>
    value.startsWith("__Host-kordev_admin_login_csrf=") && value.includes("Path=/; Secure; HttpOnly; SameSite=Strict"),
  ));
  assert.ok(resetBrowser.headers.getSetCookie().some(value =>
    value.startsWith("__Host-kordev_admin_password_reset=") && value.includes("Path=/; Secure; HttpOnly; SameSite=Strict"),
  ));
  assert.match(await resetBrowser.text(), /name="newPassword"/);

  const resetCanonicalRedirect = await fetch(`${resetUrl}&deploy=bad`, { headers: browserHeaders, redirect: "manual" });
  assert.equal(resetCanonicalRedirect.status, 308);
  assert.equal(resetCanonicalRedirect.headers.get("location"), resetUrl);
  assert.equal(resetCanonicalRedirect.headers.get("cache-control"), "no-store");
  assert.equal(resetCanonicalRedirect.headers.get("referrer-policy"), "no-referrer");

  const resetDuplicateTokenRedirect = await fetch(`${resetUrl}&token=${"t".repeat(43)}`, {
    headers: browserHeaders,
    redirect: "manual",
  });
  assert.equal(resetDuplicateTokenRedirect.status, 308);
  assert.equal(resetDuplicateTokenRedirect.headers.get("location"), resetUrl);
  assert.equal(resetDuplicateTokenRedirect.headers.get("cache-control"), "no-store");
  assert.equal(resetDuplicateTokenRedirect.headers.get("referrer-policy"), "no-referrer");

  const resetCookie = resetCapture.headers.getSetCookie()
    .map(value => value.split(";", 1)[0] ?? "")
    .find(value => value.startsWith("__Host-kordev_admin_password_reset="));
  assert.ok(resetCookie);
  const reset = await fetch(`${runtime.origin}/admin/reset-password/`, { headers: { cookie: resetCookie } });
  assert.equal(reset.status, 200);
  assert.equal(reset.headers.get("x-robots-tag"), "noindex, nofollow");
  const resetHtml = await reset.text();
  assert.match(resetHtml, /name="newPassword"/);
  assert.match(resetHtml, /name="confirmPassword"/);
});
