import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import puppeteer from "puppeteer";

import { closeAdminBrowser, createTestAdmin, loginAdmin, requestAdminRuntime, resetAdminTestDatabase, startAdminRuntime } from "./support/admin-runtime.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("admin browser flow previews, publishes, unpublishes, restores and deletes without rebuild", { skip: !databaseUrl, timeout: 120_000 }, async t => {
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
  const page = await browser.newPage();
  await loginAdmin(page, runtime.origin, admin).catch(error => {
    throw new Error(`${error.message}\nruntime=${runtime.output()}`, { cause: error });
  });

  const slug = `e2e-${randomBytes(5).toString("hex")}`;
  await page.goto(`${runtime.origin}/admin/content/article/new/`, { waitUntil: "networkidle2" });
  await page.type('input[name="slug"]', slug);
  await page.type('input[name="title"]', "Проверочный материал");
  await page.type('textarea[name="bodyMd"]', "Текст сквозной проверки");
  await page.type('input[name="seoTitle"]', "Проверочный SEO-заголовок");
  await page.type('textarea[name="seoDescription"]', "Проверочное SEO-описание");
  const saveResponsePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/new.data"),
  );
  await page.click('button[name="intent"][value="save-draft"]');
  const saveResponse = await saveResponsePromise;
  try {
    await page.waitForFunction(() => /^\/admin\/content\/article\/[0-9a-f-]+\/$/.test(location.pathname), { timeout: 5_000 });
  } catch (error) {
    throw new Error(`admin_save_failed:status=${saveResponse.status()}:url=${page.url()}:response=${(await saveResponse.text()).slice(0, 1_000)}:page=${(await page.$eval("body", element => element.textContent ?? "")).slice(0, 1_000)}:runtime=${runtime.output()}`, { cause: error });
  }
  assert.match(page.url(), new RegExp(`/admin/content/article/[0-9a-f-]+/$`));
  const editorUrl = page.url();

  await page.click('button[name="intent"][value="preview"]');
  await page.waitForFunction(() => location.pathname.endsWith("/preview/"));
  assert.match(await page.$eval("body", element => element.textContent ?? ""), /Проверочный материал/);
  await page.goto(editorUrl, { waitUntil: "networkidle2" });

  await page.click('button[name="intent"][value="publish"]');
  await page.waitForFunction(() => document.body.textContent?.includes("Опубликовано · v2"));
  let publicResponse = await requestAdminRuntime(runtime.origin, `/blog/${slug}/`);
  assert.equal(publicResponse.status, 200);
  assert.match(publicResponse.body, /Проверочный материал/);

  await page.click('button[name="intent"][value="unpublish"]');
  await page.waitForFunction(() => document.body.textContent?.includes("Черновик · v3"));
  assert.equal((await requestAdminRuntime(runtime.origin, `/blog/${slug}/`)).status, 404);

  const restore = await page.$('button[name="intent"][value="restore"]');
  assert.ok(restore);
  await restore.click();
  await page.waitForFunction(() => document.body.textContent?.includes("Опубликовано · v4"));
  assert.equal((await requestAdminRuntime(runtime.origin, `/blog/${slug}/`)).status, 200);

  await page.type('input[name="confirmSlug"]', slug);
  await page.click('button[name="intent"][value="delete"]');
  await page.waitForFunction(() => location.pathname === "/admin/content/article/");
  assert.ok(page.url().endsWith("/admin/content/article/"));
  assert.equal((await requestAdminRuntime(runtime.origin, `/blog/${slug}/`)).status, 404);
  assert.doesNotMatch(runtime.output(), /Admin-[A-Za-z0-9_-]+!/);
});
