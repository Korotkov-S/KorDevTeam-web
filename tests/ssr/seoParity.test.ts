import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { createDb } from "../../src/server/db/client";
import { contentEntries, contentRelations } from "../../src/server/db/schema";
import { createContentService } from "../../src/server/content/service";
import { and, eq } from "drizzle-orm";
import { importLegacyContent } from "../../scripts/migrate-content-to-postgres";
import { applyPortfolioImport, planPortfolioImport } from "../../src/server/portfolio/importer";
import { loadPortfolioSources } from "../../src/server/portfolio/loader";
import { startTestRuntime } from "./support/runtime";
import { seoSnapshot } from "./support/seoSnapshot";
import { seedHomeServices } from "./support/homeFixtures";

test("published pages preserve SEO and meaningful visible HTML through hydration and without JavaScript", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  await importLegacyContent({ db, batchId: "ssr-parity" });
  const portfolioSources = await loadPortfolioSources();
  await applyPortfolioImport(db, await planPortfolioImport(db, portfolioSources));
  await seedHomeServices(databaseUrl);
  const [fixtureCase] = await db.select({ id: contentEntries.id }).from(contentEntries).where(and(eq(contentEntries.kind, "case"), eq(contentEntries.slug, "alliance-stroy-garant")));
  const [fixtureService] = await db.select({ id: contentEntries.id }).from(contentEntries).where(and(eq(contentEntries.kind, "service"), eq(contentEntries.slug, "web-services")));
  assert.ok(fixtureCase && fixtureService);
  await db.insert(contentRelations).values({ sourceId: fixtureCase.id, targetId: fixtureService.id, type: "related_service" });
  const service = createContentService(createDb(databaseUrl));
  for (const kind of ["article", "case"] as const) {
    await service.saveDraft({ kind, slug: "not-published", title: "Закрытый черновик", bodyMd: "PRIVATE_DRAFT_SENTINEL" }, randomUUID());
  }
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const serviceDetailPaths = [
    "/services/business-process-automation/",
    "/services/crm-development/",
    "/services/web-services/",
    "/services/mobile-app-development/",
    "/services/integrations/",
    "/services/ai-automation/",
  ];
  for (const pathname of ["/", "/services/", ...serviceDetailPaths, "/blog/", "/blog/business-automation/", "/cases/", "/cases/alliance-stroy-garant/", "/video/", "/journal/", "/journal/issue-0/", "/under-metup/video-1/", "/requisites/", "/privacy/"]) {
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
        for (const id of ["home-hero", "proof", "cases", "services", "krasotula", "process", "insights", "contact"]) {
          assert.ok((await noJs.$eval(`#${id}`, el => el.textContent))!.trim().length > 40);
          assert.equal(await noJs.$eval(`#${id}`, el => {
            for (let node: Element | null = el; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
            }
            return el.getBoundingClientRect().height > 0;
          }), true);
        }
      }
      if (pathname.includes("business-automation") || pathname.includes("alliance-stroy-garant")) {
        assert.ok((await noJs.$eval("article", el => el.textContent))!.trim().length > 300);
      }
      if (pathname === "/cases/") {
        const detailLinks = await noJs.$$eval('a[href^="/cases/"]', links => [...new Set(links.map(link => link.getAttribute("href")).filter(href => href && href !== "/cases/"))]);
        assert.equal(detailLinks.length, 26);
        assert.ok(detailLinks.includes("/cases/alliance-stroy-garant/"));
      }
      if (pathname === "/cases/alliance-stroy-garant/") {
        assert.ok(await noJs.$('a[href="/services/web-services/"]'));
        assert.ok(await noJs.$('form input[name="pagePath"][value="/cases/alliance-stroy-garant/"]'));
      }
      if (serviceDetailPaths.includes(pathname)) {
        assert.ok((await noJs.$eval("article", el => el.textContent))!.trim().length > 300);
        assert.ok(await noJs.$('form input[name="pagePath"]'));
      }
      if (pathname === "/privacy/") {
        const policyText = await noJs.$eval("article", element => element.textContent ?? "");
        for (const required of ["2026-09-18", "Яндекс.Метрика", "Top.Mail.Ru", "отказ"]) {
          assert.match(policyText, new RegExp(required, "i"));
        }
        assert.ok(await noJs.$('button[data-consent-settings="true"]'));
      }
      if (pathname === "/requisites/") {
        const details = await noJs.$eval("article", element => element.textContent ?? "");
        for (const required of [/Индивидуальный предприниматель Коротков Александр Евгеньевич/, /ИНН\s*519098647630/, /ОГРНИП\s*324330000002550/, /team@korotkov\.dev/]) {
          assert.match(details, required);
        }
        assert.doesNotMatch(details, /банковск|расч[её]тный сч[её]т|домашн.*адрес/i);
      }
      await noJs.close();
    });
  }
  await t.test("mobile avoids infinite animation; reduced motion and stored light theme are honored", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument(() => localStorage.setItem("theme", "light"));
    await page.goto(runtime.origin, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    assert.equal(await page.$eval("html", element => element.classList.contains("dark")), false);
    assert.equal(await page.$$eval("main *", elements => elements.some(element => getComputedStyle(element).animationIterationCount === "infinite")), false);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    assert.equal(await page.$$eval("main *", elements => elements.some(element => getComputedStyle(element).animationIterationCount === "infinite")), false);
    assert.equal(await page.$eval("#home-hero h1", element => getComputedStyle(element).opacity), "1");
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
  assert.equal(legacy.location, "https://kordev.team/cases/alliance-stroy-garant/?utm_source=test");
  const legacyTarget = await fetch(`${runtime.origin}${new URL(legacy.location).pathname}`, { redirect: "manual", headers: { accept: "text/html" } });
  assert.equal(legacyTarget.status, 200);
  const unknownLegacy = await fetch(`${runtime.origin}/project/not-published`, { redirect: "manual", headers: { accept: "text/html" } });
  assert.equal(unknownLegacy.status, 404);
});
