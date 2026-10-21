import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import puppeteer, { type Page, type BrowserContext } from "puppeteer";
import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { contentEntries, contentRelations, contentRevisions, seoQueries } from "../../src/server/db/schema";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from "../../src/lib/consent";
import { startTestRuntime } from "../ssr/support/runtime";
const enabled = !!process.env.TEST_DATABASE_URL;
async function setup(t: TestContext) {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const db = createDb(process.env.TEST_DATABASE_URL!);
  const entries = await db.insert(contentEntries).values([
    { kind: "article", slug: "a", title: "Как автоматизировать работу команды", excerpt: "Практический разбор процесса.", bodyMd: "## Порядок работы\n\nСохранённый текст статьи А.", status: "published", publishedAt: new Date("2026-10-01Z"), payload: { readTime: "5 мин", category: "business-automation", relatedArticleSlugs: ["b"] } },
    { kind: "article", slug: "b", title: "Интеграция CRM и сайта", excerpt: "Как связать рабочие системы.", bodyMd: "## Интеграция\n\nСохранённый текст статьи Б.", status: "published", publishedAt: new Date("2026-10-02Z"), payload: { coverUrl: "/projects/wowbanner.png", category: "crm-sales" } },
    { kind: "case", slug: "c", title: "Запуск CRM для команды", excerpt: "Управляемая воронка.", bodyMd: "## Решение\n\nСохранённый текст кейса.", status: "published", payload: {} },
    { kind: "service", slug: "s", title: "Автоматизация", bodyMd: "Сохранённая услуга.", status: "published" },
  ]).returning();
  await db.insert(contentRevisions).values({ entryId: entries[0].id, version: 1, snapshot: { bodyMd: entries[0].bodyMd } });
  await db.insert(contentRelations).values({ sourceId: entries[3].id, targetId: entries[0].id, type: "related_article" });
  await db.insert(seoQueries).values({ queryText: "автоматизация команды", normalizedQuery: "автоматизация команды", targetPath: "/blog/a/", origin: "manual", status: "active", tracked: true });
  const snapshot = async () => createHash("sha256").update(JSON.stringify(await Promise.all([db.select().from(contentEntries), db.select().from(contentRelations), db.select().from(contentRevisions), db.select().from(seoQueries)]))).digest("hex");
  const before = await snapshot();
  const runtime = await startTestRuntime({ CONTENT_VIEWS_ENABLED: "true" }); t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); t.after(() => browser.close());
  return { db, runtime, browser, unchanged: async () => assert.equal(await snapshot(), before),
    totals: async () => Object.fromEntries((await db.execute(sql`SELECT e.slug,coalesce(v.views,0)::text AS views FROM content_entries e LEFT JOIN content_view_totals v ON v.entry_id=e.id WHERE e.kind IN ('article','case') ORDER BY e.slug`)).rows.map(row => [row.slug, row.views])) };
}
async function page(context: BrowserContext, consent: "accepted" | "rejected" | "old" = "accepted", status?: number, blockedStorage = false) {
  const p = await context.newPage(); let requests = 0;
  await p.setUserAgent("Mozilla/5.0 Chrome/133.0.0.0 Safari/537.36");
  await p.setViewport({ width: 1440, height: 1100 });
  await p.evaluateOnNewDocument(({ key, version, consent }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: consent === "old" ? "2026-09-18" : version, decision: consent === "old" ? "accepted" : consent }));
  }, { key: CONSENT_STORAGE_KEY, version: CONSENT_VERSION, consent });
  if (blockedStorage) await p.evaluateOnNewDocument("Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('blocked','SecurityError')}})");
  await p.setRequestInterception(true);
  p.on("request", request => {
    if (/mc\.yandex|top-fwz1/.test(request.url())) { void request.respond({ status: 200, contentType: "application/javascript", body: "/* intercepted vendor: queue assertion is not a provider receipt */" }); return; }
    if (request.url().includes("/api/content-views/")) { requests++; if (status) { void request.respond({ status, contentType: "application/json", body: JSON.stringify({ error: { code: status === 429 ? "rate_limited" : "unavailable" } }) }); return; } }
    void request.continue();
  });
  return { p, requests: () => requests };
}
async function visit(p: Page, origin: string, pathname: string) { await p.goto(origin + pathname); await p.waitForFunction(() => document.documentElement.dataset.hydrated === "true"); }
async function count(p: Page, expected: string) {
  await p.waitForFunction(expected => document.querySelector('[data-kordev-content-entry-id] [data-view-count]')?.getAttribute("data-view-count") === expected, {}, expected);
}
test("real opens, refresh, tabs, navigation and independent contexts obey session counters", { skip: !enabled }, async t => {
  const f = await setup(t); const context = f.browser.defaultBrowserContext(); const a = await page(context); await a.p.bringToFront();
  await visit(a.p, f.runtime.origin, "/blog/a/"); await count(a.p, "1");
  const deliveredToQueues = await a.p.evaluate(() => ({ yandex: ((window as any).ym?.a ?? []).filter((call: any[]) => call[1] === "reachGoal"), mail: ((window as any)._tmr ?? []).filter((call: any) => call.type === "reachGoal") }));
  assert.equal(deliveredToQueues.yandex.filter((call: any[]) => call[2] === "article_open_unique").length, 1);
  assert.equal(deliveredToQueues.mail.filter((call: any) => call.goal === "article_open_unique").length, 1);
  await a.p.reload(); await count(a.p, "1");
  const b = await page(context); await b.p.bringToFront(); await visit(b.p, f.runtime.origin, "/blog/a/"); await count(b.p, "1");
  await b.p.click('a[href="/blog/b/"]'); await b.p.waitForFunction(() => location.pathname === "/blog/b/"); await count(b.p, "1");
  await b.p.goBack(); await b.p.waitForFunction(() => location.pathname === "/blog/a/"); await count(b.p, "1");
  await b.p.goForward(); await b.p.waitForFunction(() => location.pathname === "/blog/b/"); await count(b.p, "1");
  await visit(b.p, f.runtime.origin, "/cases/c/"); await count(b.p, "1");
  assert.deepEqual(await f.totals(), { a: "1", b: "1", c: "1" });
  const secondContext = await f.browser.createBrowserContext(); const other = await page(secondContext); await other.p.bringToFront(); await visit(other.p, f.runtime.origin, "/blog/a/"); await count(other.p, "2");
  const source = await (await fetch(f.runtime.origin + "/blog/a/")).text(); assert.match(source, /aria-label="2 просмотра"/); assert.match(source, /Сохранённый текст статьи А/);
  for (const pathname of ["/", "/blog/", "/cases/", "/services/s/"]) { const html = await (await fetch(f.runtime.origin + pathname)).text(); assert.match(html, /data-view-count="[012]"/); }
  await visit(other.p, f.runtime.origin, "/blog/");
  const modes = await other.p.$$eval("article img", images => images.map(image => ({ src: image.getAttribute("src"), classes: image.className })));
  assert.ok(modes.some(image => image.classes.includes("object-contain") && image.classes.includes("p-6"))); assert.ok(modes.some(image => image.src === "/projects/wowbanner.png" && image.classes.includes("object-cover")));
  const artifacts = await mkdtemp(path.join(tmpdir(), "kordev-content-views-"));
  for (const viewport of [{ name: "desktop", width: 1440, height: 1100 }, { name: "mobile", width: 390, height: 844 }]) {
    await other.p.setViewport(viewport); await visit(other.p, f.runtime.origin, "/blog/a/"); await count(other.p, "2");
    assert.equal(await other.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await other.p.screenshot({ path: path.join(artifacts, `${viewport.name}.png`), fullPage: true });
  }
  t.diagnostic(`visual artifacts: ${artifacts}`);
  const goals = await other.p.evaluate(() => ((window as any)._tmr ?? []).filter((item: any) => item.type === "reachGoal"));
  // Reloaded pages have no new unique receipt, hence no fabricated goal.
  assert.equal(goals.length, 0);
  await f.unchanged();
});
test("native BFCache reopening preserves current sessions, rotates expired ones and rereads consent", { skip: !enabled }, async t => {
  const f = await setup(t);
  // Puppeteer's default flag disables BFCache; use a separate browser with it enabled.
  const browser = await puppeteer.launch({ headless: true, ignoreDefaultArgs: ["--disable-back-forward-cache"], args: ["--no-sandbox"] }); t.after(() => browser.close());
  const blank = createServer((_req, res) => res.end("<!doctype html><title>Another document</title>"));
  await new Promise<void>(resolve => blank.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise<void>(resolve => blank.close(() => resolve())));
  const address = blank.address(); assert.ok(address && typeof address !== "string");
  const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 1100 });
  await p.setUserAgent("Mozilla/5.0 Chrome/133.0.0.0 Safari/537.36");
  const cdp = await p.createCDPSession(); await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: ["*mc.yandex.ru*", "*top-fwz1.mail.ru*"] });
  await p.evaluateOnNewDocument(({ key, version }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version, decision: "accepted" }));
    const now = Date.now.bind(Date); (window as any).clockOffset = 0; Date.now = () => now() + (window as any).clockOffset;
    (window as any).restores = 0; window.addEventListener("pageshow", event => { if (event.persisted) (window as any).restores++; });
  }, { key: CONSENT_STORAGE_KEY, version: CONSENT_VERSION });
  await visit(p, f.runtime.origin, "/blog/a/"); await count(p, "1");
  const reopen = async () => {
    await p.goto(`http://127.0.0.1:${address.port}/`);
    await p.goBack();
    await p.waitForFunction(() => (window as any).restores > 0);
  };
  await reopen(); await count(p, "1");
  await p.waitForFunction(() => (window as any)._tmr?.filter((item: any) => item.type === "pageView").length === 2);
  assert.equal(await p.evaluate(() => (window as any)._tmr.filter((item: any) => item.type === "reachGoal").length), 1);
  await p.evaluate(() => { (window as any).clockOffset = 1_800_001; });
  await reopen(); await count(p, "2");
  assert.equal(await p.evaluate(() => (window as any)._tmr.filter((item: any) => item.type === "pageView").length), 3);
  assert.deepEqual(await f.totals(), { a: "2", b: "0", c: "0" });
  await p.goto(`http://127.0.0.1:${address.port}/`);
  const other = await browser.newPage();
  await other.goto(f.runtime.origin + "/privacy/");
  await other.evaluate(({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, decision: "rejected" })), { key: CONSENT_STORAGE_KEY, version: CONSENT_VERSION });
  await other.close(); await p.bringToFront(); await p.goBack();
  await p.waitForFunction(() => (window as any).restores >= 3 && !(window as any)._tmr);
  assert.deepEqual(await f.totals(), { a: "2", b: "0", c: "0" }); await f.unchanged();
});
test("hover prefetch and background tab do not count before visible activation", { skip: !enabled }, async t => {
  const f = await setup(t); const front = await page(f.browser.defaultBrowserContext()); const hidden = await page(f.browser.defaultBrowserContext());
  await front.p.bringToFront(); await visit(front.p, f.runtime.origin, "/blog/");
  await front.p.hover('a[href="/blog/a/"]');
  await hidden.p.goto(f.runtime.origin + "/blog/a/"); await hidden.p.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  assert.equal(await hidden.p.evaluate(() => document.visibilityState), "hidden");
  assert.deepEqual(await f.totals(), { a: "0", b: "0", c: "0" });
  await hidden.p.bringToFront(); await count(hidden.p, "1"); await f.unchanged();
});
test("declined, legacy consent and unavailable IndexedDB leave readable zero counts", { skip: !enabled }, async t => {
  const f = await setup(t);
  for (const consent of ["rejected", "old", "accepted"] as const) {
    const context = await f.browser.createBrowserContext(); const current = await page(context, consent, undefined, consent === "accepted"); await current.p.bringToFront(); await visit(current.p, f.runtime.origin, "/blog/a/");
    await count(current.p, "0"); await current.p.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    assert.equal(current.requests(), 0); assert.ok(await current.p.$("h1")); await context.close();
  }
  assert.deepEqual(await f.totals(), { a: "0", b: "0", c: "0" }); await f.unchanged();
});
test("429 and 503 never retry-loop or hide the article", { skip: !enabled }, async t => {
  const f = await setup(t);
  for (const status of [429, 503]) {
    const context = await f.browser.createBrowserContext(); const current = await page(context, "accepted", status); await current.p.bringToFront();
    const response = current.p.waitForResponse(response => response.url().includes("/api/content-views/") && response.status() === status);
    await visit(current.p, f.runtime.origin, "/blog/a/"); await response;
    await count(current.p, "0"); assert.ok(current.requests() <= 2); assert.ok(await current.p.$("h1")); await context.close();
  }
  await f.unchanged();
});
