import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import { SeoSectionLayout } from "./seo-layout";
import { SeoOverviewPage } from "./seo-overview";
import { SeoPositionsPage } from "./seo-positions";
import { SeoTrafficPage } from "./seo-traffic";
import { SeoPagesPage } from "./seo-pages";
import { SeoSemanticsPage } from "./seo-semantics";
import { SeoChangesPage } from "./seo-changes";

const filters = { range: "28" as const, dateFrom: "2026-08-31", dateTo: "2026-09-27", source: "yandex_webmaster" as const,
  regionId: null, device: null, frequencyBand: null, pagePath: "" };
const traffic = {
  overview: { users: 23, newUsers: 15, visits: 30, pageviews: 70, bounceRate: 1 / 3, pageDepth: 7 / 3, avgVisitDurationSeconds: 110 },
  daily: [{ date: "2026-09-26", users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 }],
  devices: [{ dimensionKey: "desktop", dimensionLabel: "ПК", pagePath: null, users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 }],
  regions: [{ dimensionKey: "213", dimensionLabel: "Москва", pagePath: null, users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 }],
  pages: [],
};
const dashboard = {
  overview: { impressions: 116, clicks: 4, ctr: 4 / 116, averagePosition: 8.2 },
  daily: [{ date: "2026-09-26", impressions: 116, clicks: 4, ctr: 4 / 116, averagePosition: 8.2 }],
  positionBuckets: [], devices: [], regions: [], frequencies: [], availableRegions: [],
  sources: [
    { source: "yandex_webmaster", displayName: "Яндекс Вебмастер", enabled: true, lastSuccessAt: "2026-09-27T05:00:00Z", lastAttemptAt: "2026-09-27T05:00:00Z", lastErrorCode: null, latestDataDate: "2026-09-26" },
    { source: "yandex_metrika", displayName: "Яндекс Метрика", enabled: true, lastSuccessAt: "2026-09-27T05:00:00Z", lastAttemptAt: "2026-09-27T05:00:00Z", lastErrorCode: null, latestDataDate: null },
  ],
};
const rankControl = {
  summary: { tracked: 2, top3: 1, top10: 1, top30: 1, outsideTop100: 1, noData: 0,
    improvedDay: 1, declinedDay: 0, improvedWeek: 1, declinedWeek: 0, referenceRegionName: "Россия", referenceDevice: "desktop" as const },
  regions: [{ id: "region-ru", code: "ru", displayName: "Россия", sortOrder: 0 }],
  rows: [{ id: "query-1", queryId: "query-1", queryText: "внедрение crm", targetPath: "/services/crm/", wordstatFrequency: 1037, frequencyBand: "high" as const,
    checks: { ru: { desktop: { queryId: "query-1", regionId: "region-ru", device: "desktop" as const, checkDate: "2026-09-26", status: "found" as const,
      position: 3, resultUrl: "https://kordev.team/services/crm/", resultLimit: 100, deltaDay: -2, deltaWeek: -5, movementDay: "improved" as const, movementWeek: "improved" as const }, mobile: null } } }],
};

function html(element: React.ReactElement, path = "/admin/seo/") {
  const router = createMemoryRouter([{ path: "*", element }], { initialEntries: [path] });
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

test("SEO secondary navigation exposes six real subpages and one active section", () => {
  const router = createMemoryRouter([{
    path: "/admin/seo",
    element: <SeoSectionLayout />,
    children: [{ path: "traffic/", element: <p>Контент</p> }],
  }], { initialEntries: ["/admin/seo/traffic/"] });
  const markup = renderToStaticMarkup(<RouterProvider router={router} />);
  for (const label of ["Сводка", "Позиции", "Трафик и запросы", "Страницы", "Семантика", "Изменения"]) assert.match(markup, new RegExp(label, "u"));
  assert.equal((markup.match(/aria-current="page"/gu) ?? []).length, 1);
  assert.match(markup, /<a(?=[^>]*href="\/admin\/seo\/traffic\/")(?=[^>]*aria-current="page")[^>]*>/u);
  assert.match(markup, /<nav[^>]*class="[^"]*flex-wrap[^"]*"[^>]*aria-label="Разделы SEO-мониторинга"|<nav[^>]*aria-label="Разделы SEO-мониторинга"[^>]*class="[^"]*flex-wrap[^"]*"/u);
});

test("overview is a decision summary and labels Metrica behavior separately", () => {
  const markup = html(<SeoOverviewPage data={{ filters, dashboard, previousOverview: { impressions: 100, clicks: 3, ctr: 0.03, averagePosition: 9 }, traffic,
    rankControl, recommendations: { items: [], nextCursor: null } }} />);
  for (const label of ["SEO — сводка", "Поисковый спрос", "Органический трафик из Яндекс Метрики", "Посетители, сумма по дням", "Визиты", "Отказы", "Глубина", "Среднее время"])
    assert.match(markup, new RegExp(label, "u"));
  assert.match(markup, /Последние данные Метрики: 26\.09\.2026/u);
  assert.doesNotMatch(markup, /Семантическое ядро.*Кандидаты/su);
});

test("positions page shows exact city/device ranks and dd.mm.yyyy dates", () => {
  const markup = html(<SeoPositionsPage data={{ filters, rankControl, rankChecks: { items: [], nextCursor: null } }} />, "/admin/seo/positions/");
  assert.match(markup, /Точные позиции/u);
  assert.match(markup, /Россия/u);
  assert.match(markup, /позиция 3/u);
  assert.match(markup, /26\.09\.2026/u);
  assert.match(markup, /не средняя позиция по показам/u);
});

test("rotating positions show the actual 14-day comparison instead of a fictional weekly or daily change", () => {
  const desktop = rankControl.rows[0].checks.ru.desktop;
  const control = { ...rankControl, rows: [{ ...rankControl.rows[0], checks: {
    ru: { desktop: { ...desktop, comparisonDays: 14, movementDay: null, deltaDay: null }, mobile: null },
  } }] };
  const markup = html(<SeoPositionsPage data={{ filters, rankControl: control, rankChecks: { items: [], nextCursor: null } }} />, "/admin/seo/positions/");
  assert.match(markup, /14 дней: лучше на 5/u);
  assert.doesNotMatch(markup, /7 дней:|1 день:/u);
});

test("traffic page separates search metrics from Metrica units and explains empty city data", () => {
  const noCities = { ...traffic, regions: [] };
  const markup = html(<SeoTrafficPage data={{ filters, dashboard, traffic: noCities, queries: { items: [], nextCursor: null } }} />, "/admin/seo/traffic/");
  for (const label of ["Трафик и запросы", "Показы", "Клики", "CTR", "Визиты", "Посетители", "Просмотры страниц", "Отказы, %", "Глубина", "Время, сек."])
    assert.match(markup, new RegExp(label, "u"));
  assert.match(markup, /По городам данных Метрики пока нет/u);
});

test("pages, semantics, and changes screens contain only their working entities", () => {
  const pageMarkup = html(<SeoPagesPage data={{ filters, pages: { items: [{ pagePath: "/services/crm/", impressions: 100, clicks: 10, ctr: 0.1, averagePosition: 8,
    observedQueries: 3, assignedQueries: 4, users: 12, newUsers: 8, visits: 15, pageviews: 31, bounceRate: 0.2667, pageDepth: 2.0667, avgVisitDurationSeconds: 93.5 }], nextCursor: null } }} />, "/admin/seo/pages/");
  assert.match(pageMarkup, /Эффективность страниц/u);
  assert.match(pageMarkup, /Назначено ключей/u);
  assert.match(pageMarkup, /\/services\/crm\//u);

  const query = { id: "00000000-0000-4000-8000-000000000001", queryText: "внедрение crm", normalizedQuery: "внедрение crm", targetPath: "/services/crm/", origin: "import",
    wordstatFrequency: 1037, frequencyBand: "high" as const, status: "active" as const, kind: "commercial" as const, priority: 100, tracked: true,
    createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" };
  const semanticsMarkup = html(<SeoSemanticsPage data={{ filters, semanticCore: { items: [query], nextCursor: null }, candidates: { items: [], nextCursor: null } }} csrfToken="csrf" />, "/admin/seo/semantics/");
  for (const label of ["Семантическое ядро", "Целевая страница", "Wordstat/месяц", "ВЧ/СЧ/НЧ", "Тип запроса", "Приоритет", "Статус"])
    assert.match(semanticsMarkup, new RegExp(label, "u"));

  const changesMarkup = html(<SeoChangesPage data={{ filters, changes: { items: [], nextCursor: null }, recommendations: { items: [], nextCursor: null } }} csrfToken="csrf" />, "/admin/seo/changes/");
  assert.match(changesMarkup, /Журнал изменений/u);
  assert.match(changesMarkup, /Рекомендации агента/u);
  assert.doesNotMatch(changesMarkup, /Точные позиции/u);
});

test("page control renders unchecked pages, separate successful and failed indexing state, and preserves filters", () => {
  const markup = html(<SeoPagesPage data={{ filters: { ...filters, range: "7", source: "google_search_console", pagePath: "/blog/test/" },
    pages: { items: [], nextCursor: null }, control: { total: 2, nextCursor: "50",
      summary: { yandex: { planned: 2, completed: 0, confirmedIndexed: 0, excluded: 0, canonicalConflicts: 0, unconfirmed: 0, failed: 0, uncheckedOrStale: 2 },
        google: { planned: 2, completed: 0, confirmedIndexed: 0, excluded: 0, canonicalConflicts: 0, unconfirmed: 0, failed: 1, uncheckedOrStale: 1 }, intentionallyExcluded: 0, withoutKeywords: 2 },
      items: [{ id: "page", title: "Untracked publication", kind: "article", pagePath: "/blog/test/", version: 3, updatedAt: new Date(), indexable: true, keywords: [],
        yandex: { lastSuccess: null, lastAttempt: null, stale: true },
        google: { lastSuccess: { status: "indexed", checkedAt: new Date("2026-10-07T00:00:00Z"), evidence: { httpStatus: 200, inSitemap: true, canonical: "https://kordev.team/blog/test/" } },
          lastAttempt: { status: "failed", checkedAt: new Date("2026-10-08T00:00:00Z"), errorCode: "google_http_429" }, stale: true } }],
    } as never }} />, "/admin/seo/pages/");
  assert.match(markup, /Untracked publication/);
  assert.match(markup, /Яндекс Search API/);
  assert.match(markup, /Ключи не назначены/);
  assert.match(markup, /Последний достоверный результат/);
  assert.match(markup, /google_http_429/);
  assert.match(markup, /Требуется новая проверка/);
  assert.match(markup, /cursor=50/);
  assert.match(markup, /source=google/);
  assert.match(markup, /range=7/);
  assert.match(markup, /page=%2Fblog%2Ftest%2F/);
});
