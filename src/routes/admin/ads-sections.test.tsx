import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import routes from "../../routes";
import { AdsSectionLayout } from "./ads-layout";
import { AdsEconomicsPage } from "./ads-economics";
import { AdsEventsPage } from "./ads-events";
import { AdsExperimentPage } from "./ads-experiment";
import { AdsExperimentsPage } from "./ads-experiments";
import { AdsHypothesesPage } from "./ads-hypotheses";
import { AdsLearningsPage } from "./ads-learnings";
import { AdsOverviewPage } from "./ads-overview";
import AdsOverviewRoute from "./ads-overview";
import { AdsRadarPage } from "./ads-radar";
import { AdsEmpty, AdsError, AdsLoading } from "./ads-shared";

const ID = "00000000-0000-4000-8000-000000000010";

function html(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

function paths(nodes: unknown[], prefix = ""): string[] {
  return nodes.flatMap(node => {
    const route = node as { path?: string; children?: unknown[] };
    const path = route.path ? `${prefix}/${route.path}`.replace(/\/+/gu, "/") : prefix;
    return [path, ...paths(route.children ?? [], path)];
  });
}

test("route config contains every authenticated advertising URL", () => {
  const configured = paths(routes as unknown[]);
  for (const path of [
    "/admin/ads/", "/admin/ads/hypotheses/", "/admin/ads/experiments/", "/admin/ads/experiments/:id/",
    "/admin/ads/radar/", "/admin/ads/learnings/", "/admin/ads/economics/", "/admin/ads/events/",
    "/admin/ads/vk/", "/admin/ads/vk/creative/:id/",
  ]) assert.ok(configured.includes(path), path);
});

test("advertising secondary navigation marks exactly one section active", () => {
  const router = createMemoryRouter([{
    path: "/admin/ads",
    element: <AdsSectionLayout />,
    children: [{ path: "experiments/", element: <p>Эксперименты</p> }],
  }], { initialEntries: ["/admin/ads/experiments/"] });
  const rendered = html(<RouterProvider router={router} />);
  assert.equal((rendered.match(/aria-current="page"/gu) ?? []).length, 1);
  assert.match(rendered, /Разделы рекламы/u);
});

test("all advertising pages render their focused heading", () => {
  const pages: Array<[React.ReactElement, RegExp]> = [
    [<AdsOverviewPage data={{ overview: { activeExperiments: 0, awaitingApproval: 0, hypotheses: 0, spend: 0, qualified: 0, won: 0, revenue: 0, potentialRevenue: 0, lastMetricAt: null, activeExperiment: null } }} />, /Реклама — сводка/u],
    [<AdsHypothesesPage data={{ hypotheses: { items: [], nextCursor: null } }} />, /Рекламные гипотезы/u],
    [<AdsExperimentsPage data={{ experiments: { items: [], nextCursor: null } }} />, /Рекламные эксперименты/u],
    [<AdsRadarPage data={{ sources: { items: [], nextCursor: null }, signals: { items: [], nextCursor: null } }} />, /Радар практик/u],
    [<AdsLearningsPage data={{ learnings: { items: [], nextCursor: null } }} />, /Выводы и знания/u],
    [<AdsEconomicsPage data={{ economics: { spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, won: 0, revenue: 0, potentialRevenue: 0 } }} />, /Экономика рекламы/u],
    [<AdsEventsPage data={{ events: { items: [], nextCursor: null } }} />, /Журнал действий/u],
  ];
  for (const [page, heading] of pages) assert.match(html(page), heading);
});

test("shared advertising states cover empty, loading and safe errors", () => {
  assert.match(html(<AdsEmpty>Нет данных</AdsEmpty>), /Нет данных/u);
  assert.match(html(<AdsLoading />), /Загрузка/u);
  const error = html(<AdsError />);
  assert.match(error, /временно недоступны/u);
  assert.doesNotMatch(error, /database|token|stack/iu);
});

test("advertising route renders a safe state when its loader returns an error payload", () => {
  const router = createMemoryRouter([{
    id: "ads-overview", path: "/", element: <AdsOverviewRoute />,
  }], {
    initialEntries: ["/"],
    hydrationData: { loaderData: { "ads-overview": { error: "database stack token" } } },
  });
  const rendered = html(<RouterProvider router={router} />);
  assert.match(rendered, /временно недоступны/u);
  assert.doesNotMatch(rendered, /database|stack|token/iu);
});

test("overview shows stored active state and approved versus remaining limits without a fake score", () => {
  const rendered = html(<AdsOverviewPage data={{ overview: {
    activeExperiments: 1, awaitingApproval: 0, hypotheses: 3, spend: 2200, qualified: 2, won: 1,
    revenue: 50000, potentialRevenue: 20000, lastMetricAt: new Date("2026-09-28T09:00:00.000Z"),
    activeExperiment: { id: ID, status: "running", dailyBudget: 1500, totalBudget: 10500, spentAmount: 2200, remainingBudget: 8300 },
  } }} />);
  assert.match(rendered, /running|В работе/u);
  assert.match(rendered, /Утверждённый дневной лимит/u);
  assert.match(rendered, /Остаток общего лимита/u);
  assert.doesNotMatch(rendered, /скоринг|оценка эффективности|AI.?балл/iu);
});

test("experiment detail keeps verdict evidence visible and has only the manual-note form", () => {
  const rendered = html(<AdsExperimentPage data={{
    noteIdempotencyKey: "00000000-0000-4000-8000-000000000099",
    csrfToken: "csrf-safe",
    experiment: {
      id: ID, status: "analyzed", passportFingerprint: "a".repeat(64), approvalTaskId: "approval-1",
      approvalText: "Согласовано", approvedAt: new Date("2026-09-28T09:00:00.000Z"),
      dailyBudget: "1500", totalBudget: "10500", spentAmount: "2200", verdict: "winner",
      verdictEvidence: { sample: { impressions: 3000, qualified: 3 }, limitations: "Малая выборка" },
      variants: [{ id: ID, name: "Диагностика", role: "control", status: "completed", vkCampaignId: "campaign-1" }],
      metrics: [{ id: ID, periodStart: new Date("2026-09-28T07:00:00.000Z"), impressions: 3000, clicks: 40, leads: 3, spend: "2200" }],
      leads: [{ id: ID, crmDealId: "deal-1", classification: "won", amount: "50000" }],
      events: [{ id: ID, action: "manual_note", reason: "Проверено", createdAt: new Date("2026-09-28T10:00:00.000Z") }],
    },
  }} />);
  assert.match(rendered, /Размер выборки/u);
  assert.match(rendered, /3000/u);
  assert.match(rendered, /Ограничения/u);
  assert.match(rendered, /Малая выборка/u);
  assert.equal((rendered.match(/<form/gu) ?? []).length, 1);
  assert.match(rendered, /Добавить заметку/u);
  assert.match(rendered, /name="_csrf" value="csrf-safe"/u);
  assert.match(rendered, /name="idempotencyKey"/u);
});

test("cabinet labels actual and potential revenue separately and preserves audit order", () => {
  const economics = html(<AdsEconomicsPage data={{ economics: {
    spend: 1200, impressions: 10000, clicks: 300, leads: 8, qualified: 3, won: 1,
    revenue: 50000, potentialRevenue: 20000,
  } }} />);
  assert.match(economics, /Фактическая выручка/u);
  assert.match(economics, /Потенциальная сумма/u);

  const events = html(<AdsEventsPage data={{ events: { items: [
    { id: "2", action: "newer", reason: "Второе", actorKind: "agent", actorId: "agent", createdAt: new Date("2026-09-28T10:00:00.000Z") },
    { id: "1", action: "older", reason: "Первое", actorKind: "admin", actorId: "admin", createdAt: new Date("2026-09-27T10:00:00.000Z") },
  ], nextCursor: null } }} />);
  assert.ok(events.indexOf("newer") < events.indexOf("older"));
  assert.match(events, /28\.09\.2026/u);
  assert.match(events, /overflow-x-auto/u);
  assert.match(events, /min-w-\[/u);
});

test("representative advertising HTML has no contacts or VK control surface", () => {
  const rendered = html(<AdsExperimentPage data={{
    noteIdempotencyKey: "00000000-0000-4000-8000-000000000099", csrfToken: "csrf-safe",
    experiment: { id: ID, status: "running", passportFingerprint: "a".repeat(64), verdict: null,
      verdictEvidence: {}, variants: [], metrics: [], leads: [], events: [] },
  }} />);
  assert.doesNotMatch(rendered, /\+7 999|owner@example|Запустить|Остановить|Изменить бюджет|Ставка|VK API|access token/iu);
});
