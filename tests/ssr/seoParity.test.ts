import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { createDb } from "../../src/server/db/client";
import { createContentService } from "../../src/server/content/service";
import { importLegacyContent } from "../../scripts/migrate-content-to-postgres";
import { startTestRuntime } from "./support/runtime";
import { seoSnapshot } from "./support/seoSnapshot";

test("published pages preserve SEO and meaningful visible HTML through hydration and without JavaScript", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await importLegacyContent({ db: createDb(databaseUrl), batchId: "ssr-parity" });
  const service = createContentService(createDb(databaseUrl));
  for (const kind of ["article", "case"] as const) {
    await service.saveDraft({ kind, slug: "not-published", title: "Закрытый черновик", bodyMd: "PRIVATE_DRAFT_SENTINEL" }, randomUUID());
  }
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  for (const pathname of ["/", "/blog/", "/blog/business-automation/", "/cases/web-site/", "/video/", "/journal/", "/journal/issue-0/", "/under-metup/video-1/"]) {
    await t.test(pathname, async () => {
      const response = await fetch(`${runtime.origin}${pathname}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-cache");
      const serverHtml = await response.text();
      assert.doesNotMatch(serverHtml, /PRIVATE_DRAFT_SENTINEL|Закрытый черновик/);
      const server = seoSnapshot(serverHtml);
      assert.equal(server.lang, "ru");
      assert.equal(server.title.length, 1);
      assert.ok(server.title[0].length > 5);
      assert.equal(server.description.length, 1);
      assert.deepEqual(server.canonical, [`https://kordev.team${pathname}`]);
      assert.equal(server.h1.length, 1);
      assert.ok(server.h1[0].length > 3);
      assert.ok(server.og.length >= 4);
      assert.ok(server.twitter.length >= 3);
      assert.deepEqual(server.robots, ["index, follow"]);
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("console", message => { if (message.type() === "error" && /hydration|Minified React error/i.test(message.text())) errors.push(message.text()); });
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(`${runtime.origin}${pathname}`, { waitUntil: "networkidle2" });
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
      assert.deepEqual(seoSnapshot(await page.content()), server);
      assert.deepEqual(errors, []);
      await page.close();
      const noJs = await browser.newPage();
      await noJs.setJavaScriptEnabled(false);
      await noJs.goto(`${runtime.origin}${pathname}`, { waitUntil: "domcontentloaded" });
      assert.deepEqual(seoSnapshot(await noJs.content()), server);
      assert.equal(await noJs.$eval("h1", el => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        }
        return el.getBoundingClientRect().height > 0 && !el.classList.contains("sr-only");
      }), true);
      if (pathname === "/") {
        for (const id of ["projects", "services", "technologies", "blog", "contact"]) {
          assert.ok((await noJs.$eval(`#${id}`, el => el.textContent))!.trim().length > 40);
        }
      }
      if (pathname.includes("business-automation") || pathname.includes("web-site")) {
        assert.ok((await noJs.$eval("article", el => el.textContent))!.trim().length > 300);
      }
      await noJs.close();
    });
  }
  await t.test("mobile keeps ordinary animation; reduced motion and stored light theme are honored", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument(() => localStorage.setItem("theme", "light"));
    await page.goto(runtime.origin, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    assert.equal(await page.$eval("html", element => element.classList.contains("dark")), false);
    assert.notEqual(await page.$eval(".animate-blob", element => getComputedStyle(element).animationName), "none");
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    assert.equal(await page.$eval(".animate-blob", element => getComputedStyle(element).animationName), "none");
    await page.close();
  });
  const missing = await fetch(`${runtime.origin}/blog/not-published/`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-cache");
  assert.match(await missing.text(), /Страница не найдена/);
  const privateCase = await fetch(`${runtime.origin}/cases/not-published/`);
  assert.equal(privateCase.status, 404);
  const redirect = await fetch(`${runtime.origin}/video?utm_source=test&deploy=bad`, { redirect: "manual", headers: { accept: "text/html" } });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), `${runtime.origin}/video/?utm_source=test`);
  const legacy = await new Promise<{ status?: number; location?: string }>((resolve, reject) => {
    const request = httpRequest(`${runtime.origin}/project/web-site?utm_source=test&deploy=bad`, { headers: { host: "www.kordev.team", accept: "text/html" } }, response => {
      response.resume();
      resolve({ status: response.statusCode, location: response.headers.location });
    });
    request.on("error", reject);
    request.end();
  });
  assert.equal(legacy.status, 301);
  assert.equal(legacy.location, "https://kordev.team/cases/web-site/?utm_source=test");
  const unknownLegacy = await fetch(`${runtime.origin}/project/not-published`, { redirect: "manual", headers: { accept: "text/html" } });
  assert.equal(unknownLegacy.status, 404);
});
