import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import puppeteer from "puppeteer";

import { closeAdminBrowser, createTestAdmin, loginAdmin, requestAdminRuntime, resetAdminTestDatabase, startAdminRuntime } from "./support/admin-runtime.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("admin security boundary enforces headers, csrf, expiry and safe returns", { skip: !databaseUrl, timeout: 120_000 }, async t => {
  resetAdminTestDatabase(databaseUrl);
  const admin = await createTestAdmin(databaseUrl);
  const runtime = await startAdminRuntime(databaseUrl);
  const browser = await puppeteer.launch({
    headless: true,
    acceptInsecureCerts: true,
    args: ["--no-sandbox"],
  });
  t.after(async () => {
    await closeAdminBrowser(browser);
    await runtime.close();
  });

  const guest = await requestAdminRuntime(runtime.origin, "/admin/");
  assert.equal(guest.status, 302);
  assert.match(guest.headers.location ?? "", /^\/admin\/login\//);
  assert.equal(guest.headers["cache-control"], "no-store");
  assert.equal(guest.headers["x-robots-tag"], "noindex, nofollow");
  const loginHtml = (await requestAdminRuntime(runtime.origin, "/admin/login/?returnTo=https://evil.example/")).body;
  assert.doesNotMatch(loginHtml, /evil\.example|ADMIN_SESSION|fixture-secret|password_digest/i);

  const page = await browser.newPage();
  await loginAdmin(page, runtime.origin, admin);
  const csrfStatus = await page.evaluate(async () => (await fetch("/admin/settings/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "key=organization&value=%7B%7D&expectedVersion=0",
  })).status);
  assert.equal(csrfStatus, 403);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      update admin_sessions
      set created_at = now() - interval '13 hours',
          last_seen_at = now() - interval '13 hours',
          expires_at = now() - interval '1 second'
    `);
  } finally {
    await client.end();
  }
  const expired = await page.goto(`${runtime.origin}/admin/`, { waitUntil: "domcontentloaded" });
  assert.ok(expired.url().includes("/admin/login/"));
  assert.doesNotMatch(runtime.output(), new RegExp(admin.password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
