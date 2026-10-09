import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SeoChangesPage } from "./seo-changes";
import { evaluateSeoEffect } from "../../server/seo-monitoring/effects";
import { effectFixture } from "../../server/seo-monitoring/effects.test";

const filters = { range: "28" as const, dateFrom: "2026-09-01", dateTo: "2026-09-28", source: "yandex_webmaster" as const,
  regionId: null, device: null, frequencyBand: null, pagePath: "" };
const change = { id: "00000000-0000-4000-8000-000000000003", pagePath: "/blog/test/", summary: "Уточнили сценарий CRM", type: "content", appliedAt: "2026-10-06T12:00:00Z" };
function render(data: Record<string, unknown>, search = "?source=yandex&q=CRM&cursor=50") {
  const element = <SeoChangesPage csrfToken="csrf" data={{ filters, changes: { items: [change], nextCursor: "100" }, recommendations: { items: [], nextCursor: null }, ...data } as never} />;
  return renderToStaticMarkup(<RouterProvider router={createMemoryRouter([{ path: "*", element }], { initialEntries: [`/admin/seo/changes/${search}`] })} />);
}

test("journal has one row per change with source-scoped checkpoints and a filter-preserving detail link", () => {
  const input = effectFixture();
  const effect = { id: "saved", changeId: change.id, source: input.source, checkpoint: 7, evaluatedAt: input.now,
    appliedAt: change.appliedAt, pagePath: change.pagePath, summary: change.summary, result: evaluateSeoEffect(input) };
  const other = { ...effect, id: "other", source: "google_search_console", result: { ...effect.result, baseline: { ...effect.result.baseline, averagePosition: 99 } } };
  const markup = render({ effects: { items: [effect, other], nextCursor: null } });
  assert.match(markup, /<table/);
  assert.equal((markup.match(/Уточнили сценарий CRM/g) ?? []).length, 1);
  assert.match(markup, /20[,.]00.*18[,.]00/);
  assert.doesNotMatch(markup, /99[,.]00/);
  assert.match(markup, /Измерение ещё не сохранено/);
  assert.match(markup, /\/admin\/seo\/changes\/00000000-0000-4000-8000-000000000003\/\?source=yandex(?:&amp;|&)q=CRM(?:&amp;|&)cursor=50/);
  assert.match(markup, /cursor=100/);
});

test("unready evidence is labeled, not displayed as a successful numeric effect", () => {
  const input = effectFixture(); input.metrics[1].impressions = 50;
  const markup = render({ effects: { items: [{ id: "low", changeId: change.id, source: input.source, checkpoint: 7,
    evaluatedAt: input.now, appliedAt: change.appliedAt, pagePath: change.pagePath, summary: change.summary, result: evaluateSeoEffect(input) }], nextCursor: null } });
  assert.match(markup, /Недостаточно показов/);
  assert.doesNotMatch(markup, /20[,.]00.*18[,.]00/);
  assert.doesNotMatch(markup, /вне топ-100/);
});

test("recommendations are on their own tab instead of mixed into completed journal rows", () => {
  const recommendations = { items: [{ id: "card", title: "Невыполненная рекомендация", rationale: "Evidence", pagePath: "/blog/test/", confidence: "high", status: "new" }], nextCursor: null };
  const journal = render({ recommendations });
  assert.doesNotMatch(journal, /Невыполненная рекомендация/);
  assert.match(journal, /Предложения/);
  const suggestions = render({ recommendations }, "?view=proposals&source=yandex");
  assert.match(suggestions, /Невыполненная рекомендация/);
  assert.doesNotMatch(suggestions, /Уточнили сценарий CRM/);
});

test("event detail separates saved mean effects from dated paid control and preserves the journal row on return", () => {
  const markup = render({ change: { ...change, contentVersion: null }, backTo: "/admin/seo/changes/?source=yandex&cursor=50#change-" + change.id,
    effects: { items: [], nextCursor: null }, history: { items: [], nextCursor: null }, control: null,
    ranks: { regions: [{ id: "ru", code: "ru", displayName: "Россия", sortOrder: 0 }], rows: [{ queryId: "q", targetPath: "/blog/test/", queryText: "Запрос CRM", wordstatFrequency: null,
      checks: { ru: { desktop: { status: "found", position: 17, checkDate: "2026-10-05", resultLimit: 100 }, mobile: null } } }] } });
  assert.match(markup, /Вернуться к строке журнала/);
  assert.match(markup, /#change-00000000-0000-4000-8000-000000000003/);
  assert.match(markup, /Версия на момент изменения не подтверждена/);
  assert.match(markup, /Контрольные позиции Яндекса — платные снимки/);
  assert.match(markup, /позиция 17/);
  assert.match(markup, /05\.10\.2026/);
  assert.match(markup, /Не проверено/);
  assert.doesNotMatch(markup, /вне топ-100/);
});

test("event current-page keyword details reuse the loaded control instead of falsely reporting no snapshots", () => {
  const summary = { planned: 1, completed: 0, confirmedIndexed: 0, excluded: 0, canonicalConflicts: 0, unconfirmed: 0, failed: 0, uncheckedOrStale: 1 };
  const state = { lastSuccess: null, lastAttempt: null, stale: true };
  const markup = render({ change, backTo: "/admin/seo/changes/", effects: { items: [], nextCursor: null }, history: { items: [], nextCursor: null },
    control: { total: 1, nextCursor: null, summary: { yandex: summary, google: summary, intentionallyExcluded: 0, withoutKeywords: 0 },
      items: [{ id: "page", title: "CRM", pagePath: change.pagePath, kind: "article", version: 1, updatedAt: change.appliedAt, indexable: true, yandex: state, google: state,
        keywords: [{ id: "q", queryText: "CRM", wordstatFrequency: null }] }] },
    ranks: { regions: [{ id: "ru", code: "ru", displayName: "Россия", sortOrder: 0 }], rows: [{ queryId: "q", targetPath: change.pagePath, queryText: "CRM", checks: { ru: { desktop: { status: "found", position: 17, checkDate: "2026-10-05", resultLimit: 100 }, mobile: null } } }] } });
  assert.doesNotMatch(markup, /Контрольных позиций пока нет/);
  assert.match(markup, /Россия · desktop: позиция 17/);
});
