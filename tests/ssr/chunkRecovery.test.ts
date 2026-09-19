import assert from "node:assert/strict";
import test from "node:test";
import puppeteer from "puppeteer";
import { startTestRuntime } from "./support/runtime";

test("actual router route-import failures reload once per release then render the safe boundary", { timeout: 45_000 }, async t => {
  const runtime = await startTestRuntime();
  t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("kordev.analytics-consent", JSON.stringify({
    version: "2026-09-18",
    decision: "rejected",
    decidedAt: "2026-09-18T09:00:00.000Z",
  })));
  const clickDesktopBlogLink = () => page.$eval('header nav a[href="/blog/"]', anchor => {
    if (getComputedStyle(anchor.closest("nav")!).display === "none") {
      throw new Error("Desktop blog navigation must be visible");
    }
    // Dispatch through React's Link handler without pointer hit-testing the
    // Header while its entrance animation is still translating it.
    (anchor as HTMLElement).click();
  });
  let documents = 0;
  let blockedImports = 0;
  const diagnostics: string[] = [];
  page.on("console", event => diagnostics.push(`console:${event.type()}:${event.text()}`));
  page.on("pageerror", error => diagnostics.push(`pageerror:${String(error)}`));
  page.on("requestfailed", request => diagnostics.push(`requestfailed:${request.url()}:${request.failure()?.errorText}`));
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.isNavigationRequest() && request.resourceType() === "document" && request.frame() === page.mainFrame()) documents++;
    if (/\/assets\/blog-index-[^/]+\.js$/.test(request.url())) {
      blockedImports++;
      void request.abort("failed");
    } else void request.continue();
  });
  await page.goto(`${runtime.origin}/video/`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  // Header links execute React Router's installed loadRouteModule path.
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10_000 }),
      clickDesktopBlogLink(),
    ]);
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      h1: document.querySelector("h1")?.textContent,
      release: sessionStorage.getItem("kordevChunkReloadRelease"),
      hydrated: document.documentElement.dataset.hydrated,
    }));
    throw new Error(JSON.stringify({ documents, blockedImports, diagnostics, state }), { cause: error });
  }
  assert.equal(documents, 2);
  assert.ok(blockedImports > 0);
  assert.match(await page.evaluate(() => sessionStorage.getItem("kordevChunkReloadRelease")) || "", /^[a-f0-9]{40}$/);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  await clickDesktopBlogLink();
  try {
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Не удалось загрузить страницу", { timeout: 10_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ url: location.href, h1: document.querySelector("h1")?.textContent,
      body: document.body.innerText.slice(0, 1500), release: sessionStorage.getItem("kordevChunkReloadRelease"),
      routerState: (window as any).__reactRouterContext?.state }));
    throw new Error(JSON.stringify({ documents, blockedImports, diagnostics, state }), { cause: error });
  }
  assert.equal(documents, 2, "the repeated real import failure must not reload the document");
  assert.equal(await page.$eval('a[href="/"]', element => element.textContent), "На главную");
  assert.doesNotMatch(await page.$eval("body", element => element.innerText), /Failed to fetch|Error loading route module|TypeError/);
});
