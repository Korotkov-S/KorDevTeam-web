import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { load } from "cheerio";
import { SeoPositionsPage } from "./seo-positions";
import type { RankControl, RankControlCell } from "./seo-shared";

const filters = { range: "custom" as const, dateFrom: "2026-10-01", dateTo: "2026-10-19",
  source: "yandex_webmaster" as const, regionId: null, device: null, frequencyBand: null, pagePath: "" };

function cell(queryId: string, position: number | null, checkDate = "2026-10-19"): RankControlCell {
  return { queryId, regionId: "ru", device: "desktop", checkDate, status: position === null ? "not_found" : "found",
    position, resultUrl: position === null ? null : queryId === "q1" ? "https://kordev.team/" : `https://kordev.team/services/${queryId}/`,
    resultLimit: 100, deltaDay: null, deltaWeek: null, movementDay: null, movementWeek: null };
}
const control: RankControl = {
  // Deliberately unusable reference totals: drilldown must derive the selected slice from all rows.
  summary: { tracked: 999, top3: 999, top10: 999, top30: 999, outsideTop100: 999, noData: 999,
    improvedDay: 0, declinedDay: 0, improvedWeek: 0, declinedWeek: 0, referenceRegionName: "Россия", referenceDevice: "desktop" },
  regions: [{ id: "ru", code: "ru", displayName: "Россия", sortOrder: 0 }, { id: "moscow", code: "ru-mow", displayName: "Москва", sortOrder: 1 }],
  rows: [1, 3, 10, 30, 100, null, undefined].map((position, i) => {
    const id = `q${i + 1}`;
    return { id, queryId: id, queryText: i === 1 ? "CRM для салона" : `Запрос ${i + 1}`, targetPath: `/services/${id}/`,
      wordstatFrequency: i === 0 ? 0 : null, frequencyBand: "unclassified",
      checks: { ru: { desktop: position === undefined ? null : cell(id, position, i === 1 ? "2026-10-12" : "2026-10-19"), mobile: null },
        "ru-mow": { desktop: null, mobile: i === 5 ? { ...cell(id, 2), regionId: "moscow", device: "mobile" } : null } } };
  }),
};

function page(search = "", data = control) {
  const router = createMemoryRouter([{ path: "*", element: <SeoPositionsPage data={{ filters, rankControl: data,
    rankChecks: { items: [], nextCursor: null } }} /> }], { initialEntries: [`/admin/seo/positions/${search}`] });
  return load(renderToStaticMarkup(<RouterProvider router={router} />));
}
function ids($: ReturnType<typeof load>) {
  return $("table[aria-label='Запросы выбранного среза'] tbody tr[data-query-id]").toArray().map(row => $(row).attr("data-query-id"));
}

test("rank cards link to real query subsets and preserve the selected date window", () => {
  const $ = page("?range=custom&from=2026-10-01&to=2026-10-19");
  const card = $("a[data-rank-bucket='top3']");
  assert.equal(card.length, 1);
  const url = new URL(card.attr("href")!, "https://kordev.team");
  assert.equal(url.pathname, "/admin/seo/positions/");
  assert.equal(url.searchParams.get("rankBucket"), "top3");
  assert.equal(url.searchParams.get("from"), "2026-10-01");
  assert.equal(url.searchParams.get("to"), "2026-10-19");
  assert.equal(card.find("[data-rank-count]").text(), "2");
  assert.equal($("a[data-rank-bucket='top10'] [data-rank-count]").text(), "3");
  assert.equal($("a[data-rank-bucket='top30'] [data-rank-count]").text(), "4");
  assert.equal($("a[data-rank-bucket='top100'] [data-rank-count]").text(), "5");
  assert.match($("[data-rank-drilldown]").text(), /включая топ-3/u);
});

test("top buckets include their boundaries without treating unverified queries as outside top100", () => {
  assert.deepEqual(ids(page("?rankBucket=top3")), ["q1", "q2"]);
  assert.deepEqual(ids(page("?rankBucket=top10")), ["q1", "q2", "q3"]);
  assert.deepEqual(ids(page("?rankBucket=top30")), ["q1", "q2", "q3", "q4"]);
  assert.deepEqual(ids(page("?rankBucket=top100")), ["q1", "q2", "q3", "q4", "q5"]);
  assert.deepEqual(ids(page("?rankBucket=outside")), ["q6"]);
  assert.deepEqual(ids(page("?rankBucket=unchecked")), ["q7"]);
});

test("selected city and device change both the counts and visible keys", () => {
  const $ = page("?rankRegion=ru-mow&rankDevice=mobile&rankBucket=top3");
  assert.deepEqual(ids($), ["q6"]);
  assert.equal($("a[data-rank-bucket='top3'] [data-rank-count]").text(), "1");
  assert.match($("[data-rank-drilldown]").text(), /Москва.*Смартфон/su);
  const next = new URL($("a[data-rank-bucket='unchecked']").attr("href")!, "https://kordev.team");
  assert.equal(next.searchParams.get("rankRegion"), "ru-mow");
  assert.equal(next.searchParams.get("rankDevice"), "mobile");
});

test("the query list shows actual dates, found URL and mismatched landing pages", () => {
  const $ = page("?rankBucket=top3");
  const table = $("table[aria-label='Запросы выбранного среза']");
  assert.match(table.text(), /12\.10\.2026/u);
  assert.match(table.text(), /19\.10\.2026/u);
  assert.equal(table.find("tr[data-query-id='q1'] a[data-found-url]").attr("href"), "https://kordev.team/");
  assert.match(table.find("tr[data-query-id='q1']").text(), /\/services\/q1\//u);
  assert.match(table.find("tr[data-query-id='q1']").text(), /Другая страница/u);
  assert.doesNotMatch(table.find("tr[data-query-id='q2']").text(), /Другая страница/u);
});

test("keyword search filters the whole query set and its counters without dropping rank controls on date changes", () => {
  const $ = page("?rankQuery=crm&rankBucket=top10&rankRegion=ru&rankDevice=desktop");
  assert.deepEqual(ids($), ["q2"]);
  assert.equal($("a[data-rank-bucket='all'] [data-rank-count]").text(), "1");
  const period = $("select[name='range']").closest("form");
  assert.equal(period.find("input[name='rankQuery']").attr("value"), "crm");
  assert.equal(period.find("input[name='rankBucket']").attr("value"), "top10");
});

test("unknown selections fall back safely and an empty catalog has no fictional rank dates", () => {
  assert.deepEqual(ids(page("?rankRegion=missing&rankDevice=tablet&rankBucket=unknown")), ["q1", "q2", "q3", "q4", "q5", "q6", "q7"]);
  const $ = page("?rankBucket=top3", { ...control, rows: [] });
  assert.deepEqual(ids($), []);
  assert.equal($("a[data-rank-bucket='all'] [data-rank-count]").text(), "0");
  assert.match($("[data-rank-drilldown]").text(), /Нет сохранённых замеров/u);
});
