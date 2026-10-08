import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("GEO control displays checked zero, absent evidence, brand and exact cohort readiness separately", async () => {
  const { GeoControl } = await import("./geo-control");
  const control = { coverage: [
    { platform: "yandex_alice", category: "nonbrand", plannedQuestions: 34, checkedQuestions: 1, uncheckedQuestions: 33,
      mentionRate: { numerator: 0, denominator: 3, value: 0 }, citationRate: { numerator: 0, denominator: 3, value: 0 } },
    { platform: "yandex_alice", category: "brand", plannedQuestions: 4, checkedQuestions: 1, uncheckedQuestions: 3,
      mentionRate: { numerator: 3, denominator: 3, value: 1 }, citationRate: { numerator: 1, denominator: 3, value: 1 / 3 } },
    { platform: "bing_copilot", category: "nonbrand", plannedQuestions: 34, checkedQuestions: 0, uncheckedQuestions: 34,
      mentionRate: { numerator: 0, denominator: 0, value: null }, citationRate: { numerator: 0, denominator: 0, value: null } },
  ], cohorts: [{ platform: "yandex_alice", surface: "alice_web", mode: "live_ui", language: "ru", region: "RU-MOW",
    sessionPersonalized: false, promptIds: ["q"], runIds: ["run"], completeSnapshots: 1, decisionReady: false,
    metrics: { mentionRate: { numerator: 0, denominator: 3, value: 0 }, citationRate: { numerator: 0, denominator: 3, value: 0 } } }] };
  const html = renderToStaticMarkup(<GeoControl control={control as never} />);
  for (const value of ["Брендовые", "Небрендовые", "0 / 3", "Нет данных", "33", "alice_web", "RU-MOW", "Неперсонализировано", "1 / 3", "Недостаточно снимков"]) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /Готово к гипотезе/u);
});
