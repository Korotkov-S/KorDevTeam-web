import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import puppeteer, { type Page } from "puppeteer";
import { sql } from "drizzle-orm";
import { createDb } from "../../src/server/db/client";
import { contentEntries } from "../../src/server/db/schema";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { startTestRuntime } from "../ssr/support/runtime";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from "../../src/lib/consent";

async function bundle() {
  const result = await build({ stdin: { contents: 'export {createViewSessionStore} from "./src/lib/contentViews/sessionStore"; export {createContentViewsController,createViewTransport} from "./src/lib/contentViews/controller";', resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "iife", globalName: "ViewTest", write: false });
  return result.outputFiles[0].text;
}
async function install(page: Page, origin: string, code: string, accepted = false) {
  await page.setUserAgent("Mozilla/5.0 Chrome/133.0.0.0 Safari/537.36");
  if (accepted) {
    await page.evaluateOnNewDocument(({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, decision: "accepted" })), { key: CONSENT_STORAGE_KEY, version: CONSENT_VERSION });
    await page.setRequestInterception(true);
    page.on("request", request => { if (/mc\.yandex|top-fwz1/.test(request.url())) void request.abort(); else void request.continue(); });
  }
  await page.goto(`${origin}/privacy/`);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  if (!accepted) await page.waitForSelector('[role="dialog"]');
  else await page.waitForSelector('script[data-kordev-analytics]');
  await page.evaluate(code + ";window.ViewTest=ViewTest;");
}
test("real IndexedDB shares first generation, refresh and exactly 30-minute rotation atomically", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const runtime = await startTestRuntime({ CONTENT_VIEWS_ENABLED: "false" }); t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); t.after(() => browser.close());
  const code = await bundle(); const pages = await Promise.all([browser.newPage(), browser.newPage()]);
  await Promise.all(pages.map(p => install(p, runtime.origin, code)));
  const get = (p: Page, now: number) => p.evaluate(now => (window as any).ViewTest.createViewSessionStore().getOrCreate(now), now);
  const [a, b] = await Promise.all(pages.map(p => get(p, 1000)));
  assert.equal(a.token, b.token); assert.equal(a.generation, 1);
  assert.equal((await get(pages[1], 999)).token, a.token, "clock regression must not create another session");
  const activity = await pages[1].evaluate(() => (window as any).ViewTest.createViewSessionStore().noteActivity(998));
  assert.equal(activity.token, a.token); assert.equal(activity.lastActivityAt, 1000);
  await pages[0].reload(); await pages[0].evaluate(code + ";window.ViewTest=ViewTest;");
  assert.equal((await get(pages[0], 1_800_999)).token, a.token);
  const rotated = await Promise.all(pages.map(p => get(p, 1_801_000)));
  assert.equal(rotated[0].token, rotated[1].token); assert.notEqual(rotated[0].token, a.token); assert.equal(rotated[0].generation, 2);
  const context = await browser.createBrowserContext(); const isolated = await context.newPage(); await install(isolated, runtime.origin, code);
  assert.notEqual((await get(isolated, 1_801_000)).token, rotated[0].token);
  await context.close();
});
test("real server expiry rotates one shared token; concurrent tabs store only one receipt per generation", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const db = createDb(process.env.TEST_DATABASE_URL!);
  const [entry] = await db.insert(contentEntries).values({ kind: "article", slug: "test", title: "Test", status: "published" }).returning();
  const runtime = await startTestRuntime({ CONTENT_VIEWS_ENABLED: "true" }); t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); t.after(() => browser.close());
  const code = await bundle(); const pages = await Promise.all([browser.newPage(), browser.newPage()]); await Promise.all(pages.map(p => install(p, runtime.origin, code, true)));
  const record = (p: Page) => p.evaluate(`(async()=>{const api=window.ViewTest; const controller=api.createContentViewsController({store:api.createViewSessionStore(),transport:api.createViewTransport(),clock:Date.now,isConsentCurrent:()=>true}); const result=await controller.record(${JSON.stringify(entry.id)}); controller.dispose();return result;})()`);
  const first = await Promise.all(pages.map(record)); assert.equal(first.filter(r => r?.counted).length, 1, JSON.stringify(first)); assert.ok(first.every(r => r?.views === "1"), JSON.stringify(first));
  await db.execute(sql`UPDATE content_view_sessions SET expires_at=now()-interval '1 second'`);
  const next = await Promise.all(pages.map(record)); assert.equal(next.filter(r => r?.counted).length, 1, JSON.stringify(next)); assert.ok(next.every(r => r?.views === "2"), JSON.stringify(next));
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM content_view_sessions WHERE expires_at > now()`)).rows[0].n, 1);
});
test("real consent revocation in tab B aborts tab A request and clears the shared identifier", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const runtime = await startTestRuntime({ CONTENT_VIEWS_ENABLED: "true" }); t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); t.after(() => browser.close());
  const a = await browser.newPage(); const b = await browser.newPage(); const code = await bundle(); await Promise.all([a,b].map(p => install(p, runtime.origin, code)));
  await a.bringToFront();
  await a.setRequestInterception(true);
  let pending = false, aborted = false;
  a.on("request", request => {
    if (request.url().includes("/api/content-views/session")) { pending = true; return; }
    if (/mc\.yandex|top-fwz1/.test(request.url())) void request.abort(); else void request.continue();
  });
  a.on("requestfailed", request => { if (request.url().includes("/api/content-views/session")) aborted = true; });
  await b.evaluate(({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, decision: "accepted" })), { key: CONSENT_STORAGE_KEY, version: CONSENT_VERSION });
  await a.waitForFunction(() => !!document.querySelector('script[data-kordev-analytics]'));
  await a.waitForFunction(async () => !!await (window as any).ViewTest.createViewSessionStore().current());
  for (let n = 0; !pending && n < 50; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(pending, true);
  await b.evaluate(({ key, version }) => localStorage.setItem(key, JSON.stringify({ version, decision: "rejected" })), { key: CONSENT_STORAGE_KEY, version: CONSENT_VERSION });
  await a.waitForFunction(async () => await (window as any).ViewTest.createViewSessionStore().current() === null);
  for (let n = 0; !aborted && n < 50; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(aborted, true);
  assert.equal(await a.evaluate(() => document.querySelector('script[data-kordev-analytics]') === null), true);
});
test("trusted wheel renews genuine activity, synthetic wheel and programmatic scrolling do not", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const runtime = await startTestRuntime({ CONTENT_VIEWS_ENABLED: "true" }); t.after(runtime.close);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); t.after(() => browser.close());
  const page = await browser.newPage(); await install(page, runtime.origin, await bundle(), true); await page.bringToFront();
  await page.waitForFunction(async () => !!await (window as any).ViewTest.createViewSessionStore().current());
  const reset = () => page.evaluate(async () => {
    const db: IDBDatabase = await new Promise(resolve => { const request = indexedDB.open("kordev-content-views", 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction("session", "readwrite"); const store = tx.objectStore("session"); const get = store.get("current"); get.onsuccess = () => store.put({ ...get.result, lastActivityAt: Date.now() - 600_000 }, "current"); tx.oncomplete = () => resolve(); }); db.close();
    return (await (window as any).ViewTest.createViewSessionStore().current()).lastActivityAt;
  });
  const previous = await reset();
  await page.evaluate(() => { window.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 })); window.scrollBy(0, 100); });
  assert.equal(await page.evaluate(async () => (await (window as any).ViewTest.createViewSessionStore().current()).lastActivityAt), previous);
  await page.mouse.move(400, 400); await page.mouse.wheel({ deltaY: 100 });
  await page.waitForFunction(async old => (await (window as any).ViewTest.createViewSessionStore().current()).lastActivityAt > old, {}, previous);
});
