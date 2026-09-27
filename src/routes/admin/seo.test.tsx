import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import { AdminSeoDashboard, meta as seoMeta, type SeoAdminLoaderData } from "./seo";
import { createSeoAdminAction, createSeoAdminLoader } from "./seo.server";

const adminId = "00000000-0000-4000-8000-000000000001";
const queryId = "00000000-0000-4000-8000-000000000002";
const recommendationId = "00000000-0000-4000-8000-000000000003";
const candidateId = "00000000-0000-4000-8000-000000000005";
const csrf = "b".repeat(43);
const principal = { userId: adminId, login: "owner", sessionId: queryId, csrfToken: csrf, expiresAt: new Date("2026-09-26") };
const auth = { authenticate: async () => principal };
const config: AdminAuthConfig = { sessionHmacKey: Buffer.alloc(32, 1), rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"), sessionTtlMs: 43_200_000 };

const dashboard = {
  overview: { impressions: 1500, clicks: 120, ctr: 0.08, averagePosition: 7.4 },
  daily: [{ date: "2026-09-23", impressions: 1500, clicks: 120, ctr: 0.08, averagePosition: 7.4 }],
  positionBuckets: [{ bucket: "4–10", count: 12 }],
  devices: [{ key: "desktop", label: "Компьютеры", impressions: 900, clicks: 80 }],
  regions: [{ key: "moscow", label: "Москва", impressions: 1500, clicks: 120 }],
  frequencies: [{ key: "high", label: "ВЧ", impressions: 1500, clicks: 120 }],
  sources: [{ source: "yandex_webmaster", displayName: "Яндекс Вебмастер", enabled: true, lastSuccessAt: "2026-09-25T05:00:00Z", lastAttemptAt: "2026-09-25T05:00:00Z", lastErrorCode: null, latestDataDate: "2026-09-23" }],
  availableRegions: [{ id: "00000000-0000-4000-8000-000000000004", source: "yandex_webmaster", code: "moscow", displayName: "Москва", externalId: "213", active: true }],
};

const rankControl = {
  summary: {
    tracked: 2, top3: 0, top10: 1, top30: 1, outsideTop100: 1, noData: 0,
    improvedDay: 1, declinedDay: 1, improvedWeek: 1, declinedWeek: 0,
    referenceRegionName: "Россия", referenceDevice: "desktop" as const,
  },
  regions: [
    { id: "region-ru", code: "ru", displayName: "Россия", sortOrder: 0 },
    { id: "region-msk", code: "moscow", displayName: "Москва", sortOrder: 10 },
  ],
  rows: [
    {
      id: queryId, queryId, queryText: "внедрение crm", targetPath: "/services/crm/", wordstatFrequency: 1037, frequencyBand: "high" as const,
      checks: {
        ru: {
          desktop: { queryId, regionId: "region-ru", device: "desktop" as const, checkDate: "2026-09-26", status: "found" as const, position: 8, resultUrl: "https://kordev.team/services/crm/", resultLimit: 100, deltaDay: -4, deltaWeek: -11, movementDay: "improved" as const, movementWeek: "improved" as const },
          mobile: null,
        },
        moscow: {
          desktop: { queryId, regionId: "region-msk", device: "desktop" as const, checkDate: "2026-09-26", status: "not_found" as const, position: null, resultUrl: null, resultLimit: 100, deltaDay: null, deltaWeek: null, movementDay: "declined" as const, movementWeek: null },
          mobile: null,
        },
      },
    },
    {
      id: candidateId, queryId: candidateId, queryText: "crm под ключ", targetPath: "/services/crm/", wordstatFrequency: 35, frequencyBand: "low" as const,
      checks: { ru: { desktop: null, mobile: null }, moscow: { desktop: null, mobile: null } },
    },
  ],
};

const data: SeoAdminLoaderData = {
  filters: { range: "28", dateFrom: "2026-08-29", dateTo: "2026-09-25", source: "yandex_webmaster", regionId: null, device: null, frequencyBand: null, pagePath: "" },
  dashboard,
  previousOverview: { impressions: 1000, clicks: 60, ctr: 0.06, averagePosition: 9.2 },
  rankControl,
  semanticCore: { items: [{ id: queryId, queryText: "автоматизация бизнес процессов", normalizedQuery: "автоматизация бизнес процессов",
    targetPath: "/services/business-process-automation/", origin: "import", wordstatFrequency: 4311, frequencyBand: "high",
    status: "active", kind: "commercial", priority: 100, tracked: true,
    createdAt: "2026-09-26T07:00:00.000Z", updatedAt: "2026-09-26T07:00:00.000Z" }], nextCursor: null },
  candidates: { items: [{ id: candidateId, queryText: "как автоматизировать отдел продаж", normalizedQuery: "как автоматизировать отдел продаж",
    targetPath: null, origin: "api", wordstatFrequency: null, frequencyBand: "unclassified",
    status: "candidate", kind: "other", priority: 0, tracked: false,
    createdAt: "2026-09-26T07:05:00.000Z", updatedAt: "2026-09-26T07:05:00.000Z" }], nextCursor: null },
  queries: { items: [{ id: queryId, queryText: "внедрение crm", targetPath: "/services/crm/", frequencyBand: "high", impressions: 1000, clicks: 80, ctr: 0.08, averagePosition: 6.4 }], nextCursor: null },
  movers: [{ queryText: "внедрение crm", delta: -2.8, averagePosition: 6.4 }],
  rankChecks: { items: [
    { id: "rank-1", queryText: "внедрение crm", targetPath: "/services/crm/", frequencyBand: "high", regionName: "Москва", regionCode: "moscow", device: "desktop", status: "found", position: 18, previousPosition: 25, delta: -7, resultUrl: "https://kordev.team/services/crm/", resultLimit: 100, checkDate: "2026-09-26", checkedAt: "2026-09-26T06:00:00.000Z" },
    { id: "rank-2", queryText: "разработка crm", targetPath: "/services/crm/", frequencyBand: "medium", regionName: "Россия", regionCode: "ru", device: "mobile", status: "not_found", position: null, previousPosition: null, delta: null, resultUrl: null, resultLimit: 100, checkDate: "2026-09-26", checkedAt: "2026-09-26T06:01:00.000Z" },
  ], nextCursor: null },
  changes: { items: [{ id: "change-1", pagePath: "/services/crm/", summary: "Обновлён title", type: "metadata", appliedAt: "2026-09-20T10:00:00Z" }], nextCursor: null },
  recommendations: { items: [{ id: recommendationId, title: "Усилить сниппет", rationale: "CTR ниже ожидаемого", status: "new", confidence: "high", pagePath: "/services/crm/" }], nextCursor: null },
};

function service() {
  return {
    async getDashboard() { return dashboard; },
    async getOverview() { return dashboard.overview; },
    async listQueries() { return data.queries; },
    async listSemanticCore(input: { status?: string }) { return input.status === "candidate" ? data.candidates : data.semanticCore; },
    async createCandidate() { return {}; },
    async updateSemanticQuery() { return {}; },
    async listChanges() { return data.changes; },
    async listRecommendations() { return data.recommendations; },
    async listRankChecks() { return data.rankChecks; },
    async getRankControl() { return rankControl; },
    async saveQueryClassification() { return {}; },
    async recordChange() { return {}; },
    async updateRecommendationStatus() { return {}; },
  };
}

function request(path: string, form?: FormData, headers: Record<string, string> = {}) {
  return new Request(`https://kordev.team${path}`, { method: form ? "POST" : "GET", body: form,
    headers: { cookie: createAdminCookie("a".repeat(43)), origin: "https://kordev.team", "sec-fetch-site": "same-origin", "x-kordev-csp-nonce": "d".repeat(22), ...headers } });
}

function renderDashboard(value: SeoAdminLoaderData) {
  const router = createMemoryRouter([{ path: "*", element: <AdminSeoDashboard data={value} csrfToken={csrf} /> }], { initialEntries: ["/admin/seo/"] });
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

test("SEO dashboard has an explicit non-error browser title", () => {
  assert.deepEqual(seoMeta(), [{ title: "SEO-мониторинг | KorDevTeam" }]);
});

test("SEO loader redirects unauthenticated users and accepts bounded shared filters", async () => {
  const unauthenticated = createSeoAdminLoader({ authenticate: async () => null }, service(), () => new Date("2026-09-25T10:00:00Z"));
  await assert.rejects(() => unauthenticated({ request: new Request("https://kordev.team/admin/seo/"), params: {}, context: {} }),
    (error: unknown) => error instanceof Response && error.status === 302);

  const response = await createSeoAdminLoader(auth, service(), () => new Date("2026-09-25T10:00:00Z"))({
    request: request("/admin/seo/?range=90&source=google&region=00000000-0000-4000-8000-000000000004"), params: {}, context: {},
  });
  const body = await response.json() as SeoAdminLoaderData;
  assert.equal(body.filters.range, "90");
  assert.equal(body.filters.source, "google_search_console");
  assert.equal(body.filters.regionId, null);
  assert.equal(body.semanticCore.items[0].queryText, "автоматизация бизнес процессов");
  assert.equal(body.candidates.items[0].status, "candidate");
  assert.equal((body as unknown as { rankControl: typeof rankControl }).rankControl.summary.tracked, 2);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(JSON.stringify(body), /oauth|private.?key|secret/iu);
});

test("dashboard explains Yandex rank control and renders the regional keyword matrix", () => {
  const html = renderDashboard(Object.assign({}, data, { rankControl }) as SeoAdminLoaderData);
  for (const label of [
    "Контроль семантического ядра", "Отслеживается", "В топ-3", "В топ-10", "В топ-30",
    "Вне топ-100", "Без данных", "Россия · компьютеры", "Изменение за день", "Изменение за 7 дней",
    "Wordstat/месяц", "Целевая страница", "Москва", "Компьютер", "Смартфон",
  ]) assert.match(html, new RegExp(label, "u"));
  assert.match(html, /лучше на 4/u);
  assert.match(html, /лучше на 11/u);
  assert.match(html, /вне топ-100/u);
  assert.match(html, /нет данных/u);
  assert.match(html, /26\.09\.2026/u);
});

test("SEO loader rejects invalid and oversized custom ranges safely", async () => {
  const loader = createSeoAdminLoader(auth, service(), () => new Date("2026-09-25T10:00:00Z"));
  for (const url of [
    "/admin/seo/?range=13",
    "/admin/seo/?range=custom&from=2025-01-01&to=2026-09-25",
    "/admin/seo/?range=custom&from=bad&to=2026-09-25",
  ]) {
    const response = await loader({ request: request(url), params: {}, context: {} });
    assert.equal(response.status, 422);
  }
});

test("SEO mutations require same origin and CSRF and map unexpected errors safely", async () => {
  const actions = service();
  const action = createSeoAdminAction(auth, actions, config);
  const form = new FormData(); form.set("intent", "save-query"); form.set("_csrf", csrf); form.set("queryId", queryId);
  form.set("targetPath", "/services/crm/"); form.set("frequencyBand", "high");
  assert.equal((await action({ request: request("/admin/seo/", form, { origin: "https://evil.test" }), params: {}, context: {} })).status, 403);
  form.set("_csrf", "wrong");
  assert.equal((await action({ request: request("/admin/seo/", form), params: {}, context: {} })).status, 403);
  const failing = createSeoAdminAction(auth, { ...actions, async saveQueryClassification() { throw new Error("SQL password secret"); } }, config);
  form.set("_csrf", csrf);
  const unavailable = await failing({ request: request("/admin/seo/", form), params: {}, context: {} });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /SQL|password|secret/u);
});

test("SEO admin creates candidates and updates lifecycle fields with optimistic locking", async () => {
  const calls: Array<[string, unknown]> = [];
  const actions = {
    ...service(),
    async createCandidate(command: unknown) { calls.push(["create", command]); return {}; },
    async updateSemanticQuery(command: unknown) { calls.push(["update", command]); return {}; },
  };
  const action = createSeoAdminAction(auth, actions, config);
  const create = new FormData();
  create.set("_csrf", csrf); create.set("intent", "create-query"); create.set("queryText", "Новый ключ");
  create.set("targetPath", "/services/crm-development/"); create.set("wordstatFrequency", "25");
  create.set("frequencyBand", "low"); create.set("kind", "commercial"); create.set("priority", "100");
  assert.equal((await action({ request: request("/admin/seo/", create), params: {}, context: {} })).status, 200);
  assert.deepEqual(calls[0], ["create", { queryText: "Новый ключ", targetPath: "/services/crm-development/",
    wordstatFrequency: 25, frequencyBand: "low", kind: "commercial", priority: 100 }]);

  const update = new FormData();
  update.set("_csrf", csrf); update.set("intent", "update-query"); update.set("id", candidateId);
  update.set("expectedUpdatedAt", "2026-09-26T07:05:00.000Z"); update.set("targetPath", "/blog/crm-implementation/");
  update.set("wordstatFrequency", "1159"); update.set("frequencyBand", "high"); update.set("kind", "informational");
  update.set("priority", "50"); update.set("status", "active");
  assert.equal((await action({ request: request("/admin/seo/", update), params: {}, context: {} })).status, 200);
  assert.deepEqual(calls[1], ["update", { id: candidateId, expectedUpdatedAt: "2026-09-26T07:05:00.000Z",
    targetPath: "/blog/crm-implementation/", wordstatFrequency: 1159, frequencyBand: "high",
    kind: "informational", priority: 50, status: "active" }]);

  const conflict = createSeoAdminAction(auth, { ...actions, async updateSemanticQuery() { throw new Error("seo_query_conflict"); } }, config);
  assert.equal((await conflict({ request: request("/admin/seo/", update), params: {}, context: {} })).status, 409);
});

test("dashboard renders semantic core, candidates, factual queries, and all decision sections", () => {
  const withGap = { ...data, queries: { ...data.queries, nextCursor: "50" }, dashboard: { ...data.dashboard, daily: [...data.dashboard.daily, { date: "2026-09-24", impressions: 0, clicks: 0, ctr: null, averagePosition: null }] } };
  const html = renderDashboard(withGap);
  for (const label of ["SEO-мониторинг", "Показы и клики", "CTR", "Средняя позиция", "Диапазоны позиций", "Регионы Яндекса", "Устройства", "Частотность", "Движение запросов", "Семантическое ядро", "Кандидаты", "Фактические запросы", "Контрольные позиции Яндекса", "Изменения", "Рекомендации"]) assert.match(html, new RegExp(label, "u"));
  assert.match(html, /автоматизация бизнес процессов/u);
  assert.match(html, /4[\s ]?311/u);
  assert.match(html, /Коммерческий/u);
  assert.match(html, /Активен/u);
  assert.match(html, /как автоматизировать отдел продаж/u);
  assert.match(html, /не включён в ежедневный контроль/u);
  assert.match(html, /name="expectedUpdatedAt"/u);
  assert.match(html, /name="status"/u);
  assert.match(html, /data-position-domain="reversed"/u);
  assert.match(html, /data-chart-gaps="preserved"/u);
  assert.match(html, /overflow-x-auto/u);
  assert.match(html, /cursor=50/u);
  assert.match(html, /name="from"/u);
});

test("dashboard separates exact Yandex control ranks from averages and formats dates as dd.mm.yyyy", () => {
  const html = renderDashboard(data);
  assert.match(html, /Контрольная позиция/u);
  assert.match(html, /Средняя позиция по показам/u);
  assert.match(html, /не найден в топ-100/u);
  assert.match(html, /лучше на 7/u);
  assert.match(html, /26\.09\.2026/u);
  assert.match(html, /Последние данные: 23\.09\.2026/u);
  assert.match(html, /Показы: 1[\s ]?000/u);
  assert.match(html, /Клики: 80/u);
});

test("Google dashboard does not render city selection and empty state is explicit", () => {
  const google = { ...data, filters: { ...data.filters, source: "google_search_console" as const }, dashboard: { ...data.dashboard, daily: [], availableRegions: [] } };
  const html = renderDashboard(google);
  assert.doesNotMatch(html, /name="region"/u);
  assert.match(html, /Данных по выбранным фильтрам пока нет/u);
});
