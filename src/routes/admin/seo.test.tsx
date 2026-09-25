import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import { AdminSeoDashboard, type SeoAdminLoaderData } from "./seo";
import { createSeoAdminAction, createSeoAdminLoader } from "./seo.server";

const adminId = "00000000-0000-4000-8000-000000000001";
const queryId = "00000000-0000-4000-8000-000000000002";
const recommendationId = "00000000-0000-4000-8000-000000000003";
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

const data: SeoAdminLoaderData = {
  filters: { range: "28", dateFrom: "2026-08-29", dateTo: "2026-09-25", source: "yandex_webmaster", regionId: null, device: null, frequencyBand: null, pagePath: "" },
  dashboard,
  previousOverview: { impressions: 1000, clicks: 60, ctr: 0.06, averagePosition: 9.2 },
  queries: { items: [{ id: queryId, queryText: "внедрение crm", targetPath: "/services/crm/", frequencyBand: "high", impressions: 1000, clicks: 80, ctr: 0.08, averagePosition: 6.4 }], nextCursor: null },
  movers: [{ queryText: "внедрение crm", delta: -2.8, averagePosition: 6.4 }],
  changes: { items: [{ id: "change-1", pagePath: "/services/crm/", summary: "Обновлён title", type: "metadata", appliedAt: "2026-09-20T10:00:00Z" }], nextCursor: null },
  recommendations: { items: [{ id: recommendationId, title: "Усилить сниппет", rationale: "CTR ниже ожидаемого", status: "new", confidence: "high", pagePath: "/services/crm/" }], nextCursor: null },
};

function service() {
  return {
    async getDashboard() { return dashboard; },
    async getOverview() { return dashboard.overview; },
    async listQueries() { return data.queries; },
    async listChanges() { return data.changes; },
    async listRecommendations() { return data.recommendations; },
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
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(JSON.stringify(body), /oauth|private.?key|secret/iu);
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

test("dashboard renders all decision sections, reversed position chart, gaps, and wide tables", () => {
  const withGap = { ...data, queries: { ...data.queries, nextCursor: "50" }, dashboard: { ...data.dashboard, daily: [...data.dashboard.daily, { date: "2026-09-24", impressions: 0, clicks: 0, ctr: null, averagePosition: null }] } };
  const html = renderDashboard(withGap);
  for (const label of ["SEO-мониторинг", "Показы и клики", "CTR", "Средняя позиция", "Диапазоны позиций", "Регионы Яндекса", "Устройства", "Частотность", "Движение запросов", "Все запросы", "Изменения", "Рекомендации"]) assert.match(html, new RegExp(label, "u"));
  assert.match(html, /data-position-domain="reversed"/u);
  assert.match(html, /data-chart-gaps="preserved"/u);
  assert.match(html, /overflow-x-auto/u);
  assert.match(html, /cursor=50/u);
  assert.match(html, /name="from"/u);
});

test("Google dashboard does not render city selection and empty state is explicit", () => {
  const google = { ...data, filters: { ...data.filters, source: "google_search_console" as const }, dashboard: { ...data.dashboard, daily: [], availableRegions: [] } };
  const html = renderDashboard(google);
  assert.doesNotMatch(html, /name="region"/u);
  assert.match(html, /Данных по выбранным фильтрам пока нет/u);
});
