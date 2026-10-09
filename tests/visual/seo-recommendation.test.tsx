import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import puppeteer from "puppeteer";
import { SeoRecommendationCard } from "../../src/routes/admin/seo-recommendation-card";
test("long Russian approval diff remains reviewable on mobile and desktop", async t => {
  const assets = path.resolve("build/client/assets");
  const css = (await Promise.all((await readdir(assets)).filter(name => name.endsWith(".css")).map(name => readFile(path.join(assets, name), "utf8")))).join("\n");
  const recommendation = { id: "00000000-0000-4000-8000-000000000001", title: "Уточнить практический процесс", rationale: "Проверяем конкретные изменения, а не обещаем рост позиций", pagePath: "/blog/test/", confidence: "high", status: "new", updatedAt: "2026-10-09T10:00:00Z" };
  const router = createMemoryRouter([{ path: "*", element: <SeoRecommendationCard recommendation={recommendation} csrfToken="fixture" work={{ state: "blocked", errorCode: "seo_execution_approval_required", canApprove: true, supported: true, baseVersion: 3, baseHash: "a".repeat(64), execution: null,
    criteria: [{ id: "step", description: "Виден конкретный практический шаг" }], diff: [{ fieldPath: "bodyMd", before: "Прежний текст", after: "Подробный русский текст с пояснениями. ".repeat(120) + "КОНЕЦ_ПОЛНОГО_DIFF" }] }} /> }]);
  const markup = renderToStaticMarkup(<RouterProvider router={router} />);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); t.after(() => browser.close());
  const directory = await mkdtemp(path.join(tmpdir(), "kordev-seo-approval-"));
  const page = await browser.newPage();
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.setContent(`<html lang="ru"><head><style>${css}</style></head><body><main style="padding:16px;max-width:1200px;margin:auto">${markup}</main></body></html>`);
    await page.click("summary");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.ok(await page.$eval("details", el => el.textContent!.includes("КОНЕЦ_ПОЛНОГО_DIFF")));
    await page.screenshot({ path: path.join(directory, `${width}.png`), fullPage: true });
  }
  t.diagnostic(`Approval screenshots: ${directory}`);
});
