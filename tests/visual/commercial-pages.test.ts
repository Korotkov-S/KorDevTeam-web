import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer";
import sharp from "sharp";

import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { startTestRuntime } from "../ssr/support/runtime";
import { seedCommercialFixtures } from "./support/commercialFixtures";

const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const routes = [
  { slug: "home", pathname: "/" },
  { slug: "services", pathname: "/services/" },
  { slug: "service", pathname: "/services/business-process-automation/" },
  { slug: "cases", pathname: "/cases/" },
  { slug: "case", pathname: "/cases/long-case/" },
  { slug: "blog", pathname: "/blog/" },
  { slug: "article", pathname: "/blog/long-article/" },
  { slug: "journal", pathname: "/journal/" },
  { slug: "privacy", pathname: "/privacy/" },
] as const;

const vendorPattern = /(?:mc\.yandex\.ru|top-fwz1\.mail\.ru)/;

async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
}

async function assertPageLayout(page: Page, pathname: string): Promise<void> {
  assert.equal(await page.$$eval("h1", nodes => nodes.length), 1, `${pathname} must have one h1`);
  assert.equal(await page.$eval("h1", element => {
    const box = element.getBoundingClientRect();
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return box.width > 0 && box.height > 0;
  }), true, `${pathname} h1 must be visible`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${pathname} must not overflow horizontally`);
  assert.equal(await page.$eval("main", element => {
    const box = element.getBoundingClientRect();
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute("hidden") || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return box.width > 0 && box.height > 100;
  }), true, `${pathname} main content must be visible`);
}

async function dismissConsent(page: Page): Promise<void> {
  const button = await page.$('button[data-consent-action="choice"]');
  if (button) {
    const choices = await page.$$('button[data-consent-action="choice"]');
    await choices.at(-1)?.click();
    await page.waitForSelector('[role="dialog"][aria-labelledby="consent-dialog-title"]', { hidden: true });
  }
}

test("commercial pages remain responsive, visible and decodable at desktop and mobile sizes", { timeout: 180_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await seedCommercialFixtures(databaseUrl);
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const screenshotDirectory = await mkdtemp(path.join(tmpdir(), "kordev-commercial-"));
  if (process.env.KORDEV_KEEP_VISUALS !== "1") {
    t.after(() => rm(screenshotDirectory, { recursive: true, force: true }));
  } else {
    t.diagnostic(`visual artifacts: ${screenshotDirectory}`);
  }

  for (const viewport of viewports) {
    for (const route of routes) {
      await t.test(`${viewport.name} ${route.pathname}`, async () => {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.evaluateOnNewDocument(() => localStorage.setItem("kordev.analytics-consent", JSON.stringify({ version: "2026-09-18", decision: "rejected", decidedAt: "2026-09-18T09:00:00.000Z" })));
        await page.goto(`${runtime.origin}${route.pathname}`, { waitUntil: "networkidle2" });
        await waitForHydration(page);
        await dismissConsent(page);
        await assertPageLayout(page, route.pathname);

        if (route.pathname === "/") {
          for (const id of ["home-hero", "cases", "services", "krasotula", "process", "contact"]) {
            assert.equal(await page.$eval(`#${id}`, element => element.getBoundingClientRect().height > 40), true, `#${id} must be visible`);
          }
        }

        const screenshotPath = path.join(screenshotDirectory, `kordev-${viewport.width}-${route.slug}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        assert.ok((await stat(screenshotPath)).size > 0, `${route.pathname} screenshot must not be empty`);
        const metadata = await sharp(screenshotPath).metadata();
        assert.equal(metadata.format, "png");
        assert.equal(metadata.width, viewport.width);
        assert.ok((metadata.height ?? 0) >= viewport.height, `${route.pathname} screenshot must include the viewport`);
        await page.close();
      });
    }
  }
});

test("commercial pages keep meaningful layout without JavaScript", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await seedCommercialFixtures(databaseUrl);
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());

  for (const viewport of viewports) {
    for (const route of routes) {
      await t.test(`${viewport.name} no-JS ${route.pathname}`, async () => {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.setJavaScriptEnabled(false);
        const response = await page.goto(`${runtime.origin}${route.pathname}`, { waitUntil: "networkidle0" });
        assert.equal(response?.status(), 200);
        const appliedPublicStyles = await page.evaluate(() => {
          const shell = document.querySelector<HTMLElement>("body > div.min-h-screen");
          return {
            surfaceToken: getComputedStyle(document.documentElement).getPropertyValue("--public-surface").trim().toUpperCase(),
            shellBackground: shell ? getComputedStyle(shell).backgroundColor : "",
          };
        });
        assert.deepEqual(appliedPublicStyles, {
          surfaceToken: "#F7F8FC",
          shellBackground: "rgb(247, 248, 252)",
        }, `${route.pathname} must apply the public stylesheet without JavaScript`);
        await assertPageLayout(page, route.pathname);
        await page.close();
      });
    }
  }
});

test("mobile navigation traps focus, closes on Escape and restores the trigger", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await seedCommercialFixtures(databaseUrl);
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(runtime.origin, { waitUntil: "networkidle2" });
  await waitForHydration(page);
  await dismissConsent(page);

  const menuTrigger = await page.$('button[aria-label="Открыть меню"]');
  assert.ok(menuTrigger);
  await menuTrigger.click();
  const dialog = await page.waitForSelector('#public-mobile-navigation[role="dialog"][aria-modal="true"]');
  assert.ok(dialog);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Услуги");
  const focusables = await page.$$eval("#public-mobile-navigation a[href], #public-mobile-navigation button:not([disabled])", elements => elements.map(element => element.textContent?.trim() ?? ""));
  assert.ok(focusables.length >= 3);

  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), focusables.at(-1));
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), focusables[0]);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#public-mobile-navigation", { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Открыть меню");
});

test("analytics vendors are requested only after explicit consent", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await seedCommercialFixtures(databaseUrl);
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (vendorPattern.test(request.url())) {
      void request.abort();
      return;
    }
    void request.continue();
  });

  await page.goto(runtime.origin, { waitUntil: "networkidle2" });
  await waitForHydration(page);
  await page.waitForSelector('[role="dialog"][aria-labelledby="consent-dialog-title"]');
  assert.equal(await page.evaluate(() => document.querySelectorAll('script[data-kordev-analytics]').length), 0);
  const consentChoices = await page.$$('button[data-consent-action="choice"]');
  assert.equal(consentChoices.length, 2);
  const yandexRequest = page.waitForRequest(request => request.url().includes("mc.yandex.ru"));
  const topMailRequest = page.waitForRequest(request => request.url().includes("top-fwz1.mail.ru"));
  await consentChoices[0].click();
  const [yandex, topMail] = await Promise.all([yandexRequest, topMailRequest]);
  assert.match(yandex.url(), /mc\.yandex\.ru/);
  assert.match(topMail.url(), /top-fwz1\.mail\.ru/);
  assert.deepEqual(await page.evaluate(() => {
    const raw = localStorage.getItem("kordev.analytics-consent");
    if (!raw) return null;
    const value = JSON.parse(raw) as { version?: unknown; decision?: unknown };
    return { version: value.version, decision: value.decision };
  }), { version: "2026-09-18", decision: "accepted" });
});

test("reduced motion removes infinite animation without hiding the commercial hero", { timeout: 120_000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  await seedCommercialFixtures(databaseUrl);
  const runtime = await startTestRuntime({ DATABASE_URL: databaseUrl });
  t.after(runtime.close);
  const browser: Browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(runtime.origin, { waitUntil: "networkidle2" });
  await waitForHydration(page);
  await dismissConsent(page);
  assert.equal(await page.$$eval("main *", elements => elements.some(element => getComputedStyle(element).animationIterationCount === "infinite")), false);
  assert.equal(await page.$eval("#home-hero h1", element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity === "1" && box.width > 0 && box.height > 0;
  }), true);
});
