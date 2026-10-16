import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import puppeteer from "puppeteer";
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

  const capture = await fetch(`${runtime.origin}/admin/reset-password/?token=${"t".repeat(43)}`, {
    redirect: "manual", headers: { accept: "text/html" },
  });
  assert.equal(capture.status, 302);
  assert.equal(capture.headers.get("location"), "/admin/reset-password/");
  assert.equal(capture.headers.get("cache-control"), "no-store");
  assert.equal(capture.headers.get("referrer-policy"), "no-referrer");
  const resetCookie = (capture.headers.get("set-cookie") ?? "").split(";", 1)[0];
  const reset = await fetch(`${runtime.origin}/admin/reset-password/`, { headers: { cookie: resetCookie, accept: "text/html" } });
  assert.equal(reset.status, 200);
  assert.equal(reset.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(reset.headers.get("cache-control"), "no-store");
  assert.equal(reset.headers.get("referrer-policy"), "no-referrer");
  const resetHtml = await reset.text();
  assert.doesNotMatch(resetHtml, new RegExp("t".repeat(43)));
  assert.match(resetHtml, /name="newPassword"/);
  assert.match(resetHtml, /name="confirmPassword"/);
});

test("production browser preserves a cross-site email reset token through capture and reload", async t => {
  const runtime = await startTestRuntime({ ...runtimeConfig, NODE_ENV: "production", TRUST_PROXY_HOPS: "0" });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const email = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<a href="${runtime.origin}/admin/reset-password/?token=${"A".repeat(43)}">Reset password</a>`);
  });
  await new Promise<void>(resolve => email.listen(0, "127.0.0.1", resolve));
  t.after(() => { email.closeAllConnections(); email.close(); });
  const address = email.address();
  assert.ok(address && typeof address !== "string");
  await page.goto(`http://localhost:${address.port}/`);
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click("a"),
  ]);
  assert.equal(response?.status(), 200);
  assert.equal(response?.request().redirectChain().length, 1);
  assert.equal(response?.request().redirectChain()[0].response()?.status(), 302);
  assert.equal(response?.headers()["cache-control"], "no-store");
  assert.equal(response?.headers()["referrer-policy"], "no-referrer");
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  assert.equal(new URL(page.url()).search, "");
  assert.ok(await page.$('input[name="newPassword"]'));
  assert.doesNotMatch(await page.content(), new RegExp("A".repeat(43)));
  const cookie = (await page.cookies()).find(value => value.name === "__Host-kordev_admin_password_reset");
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.secure, true);
  assert.equal(cookie?.sameSite, "Lax");
  await page.reload({ waitUntil: "networkidle0" });
  assert.ok(await page.$('input[name="newPassword"]'));
  await page.setJavaScriptEnabled(false);
  await page.reload({ waitUntil: "networkidle0" });
  assert.ok(await page.$('input[name="newPassword"]'));
});
