import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import puppeteer from "puppeteer";

test("positions cards, search and city/device selection work in the browser without collecting data", async t => {
  const check = (id: string, position: number | null) => ({ queryId: id, regionId: "ru", device: "desktop", checkDate: "2026-10-19",
    status: position === null ? "not_found" : "found", position, resultUrl: position === null ? null : `https://kordev.team/services/${id}/`,
    resultLimit: 100, deltaDay: null, deltaWeek: null, movementDay: null, movementWeek: null });
  const control = {
    regions: [{ id: "ru", code: "ru", displayName: "Россия", sortOrder: 0 }, { id: "moscow", code: "ru-mow", displayName: "Москва", sortOrder: 1 }],
    rows: [1, 2, 88, null, undefined].map((position, i) => {
      const id = `q${i + 1}`;
      return { id, queryId: id, queryText: ["Разработка CRM для филиальной сети", "Учёт часов технической поддержки", "Автоматизация расчёта групповых туров", "Интеграция CRM с учётной системой", "Ещё не проверенный запрос"][i],
        targetPath: `/services/${id}/`, wordstatFrequency: null, frequencyBand: "unclassified",
        checks: { ru: { desktop: position === undefined ? null : check(id, position), mobile: null },
          "ru-mow": { desktop: null, mobile: i === 3 ? { ...check(id, 3), device: "mobile", regionId: "moscow" } : null } } };
    }),
  };
  const bundled = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{createMemoryRouter,RouterProvider}from'react-router';import{RankQueryDrilldown}from'./src/routes/admin/seo-position-drilldown';const control=${JSON.stringify(control)};const router=createMemoryRouter([{path:'*',element:<RankQueryDrilldown control={control}/> }],{initialEntries:['/admin/seo/positions/?range=custom&from=2026-10-01&to=2026-10-19']});createRoot(document.getElementById('root')).render(<RouterProvider router={router}/>);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", platform: "browser", define: { "process.env.NODE_ENV": '"production"' } });
  const assets = path.resolve("build/client/assets");
  const css = (await Promise.all((await readdir(assets)).filter(name => name.endsWith(".css")).map(name => readFile(path.join(assets, name), "utf8")))).join("\n");
  const directory = await mkdtemp(path.join(tmpdir(), "kordev-seo-positions-"));
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on("request", request => { if (/^https?:/u.test(request.url())) requests.push(request.url()); });
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.setContent(`<html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main id="root" style="padding:16px;max-width:1200px;margin:auto;min-width:0"></main></body></html>`);
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    await page.waitForSelector("[data-query-id='q5']");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.click("a[data-rank-bucket='top3']");
    await page.waitForFunction(() => document.querySelectorAll("tr[data-query-id]").length === 2);
    assert.deepEqual(await page.$$eval("tr[data-query-id]", rows => rows.map(row => row.getAttribute("data-query-id"))), ["q1", "q2"]);
    await page.screenshot({ path: path.join(directory, `${width}-top3.png`), fullPage: true });
    await page.click("a[data-rank-bucket='unchecked']");
    await page.waitForSelector("tr[data-query-id='q5']");
    assert.equal(await page.$("tr[data-query-id='q4']"), null);
    await page.select("select[name='rankRegion']", "ru-mow");
    await page.select("select[name='rankDevice']", "mobile");
    await page.click("button[type='submit'], button:not([type])");
    await page.waitForFunction(() => document.querySelector("[data-rank-drilldown]")?.textContent?.includes("Москва · Смартфон"));
    await page.click("a[data-rank-bucket='top3']");
    await page.waitForSelector("tr[data-query-id='q4']");
    assert.equal(await page.$$eval("tr[data-query-id]", rows => rows.length), 1);
    assert.equal(await page.$eval("a[data-rank-bucket='top3'] [data-rank-count]", el => el.textContent), "1");
    await page.screenshot({ path: path.join(directory, `${width}-moscow-mobile.png`), fullPage: true });
    await page.type("input[name='rankQuery']", "несуществующая фраза");
    await page.click("button[type='submit'], button:not([type])");
    await page.waitForFunction(() => document.querySelectorAll("tr[data-query-id]").length === 0);
    assert.equal(await page.$eval("a[data-rank-bucket='all'] [data-rank-count]", el => el.textContent), "0");
  }
  assert.deepEqual(requests, []);
  t.diagnostic(`Positions screenshots: ${directory}`);
});
