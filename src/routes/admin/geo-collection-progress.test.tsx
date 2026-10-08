import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GeoCollectionProgress } from "./geo-collection-progress";
test("GEO progress shows partial repetitions, regions, dates and required action without false zeros", () => {
  const html = renderToStaticMarkup(
    <GeoCollectionProgress
      queue={{
        coverage: {
          plannedCount: 152,
          completeCount: 0,
          remainingCount: 152,
          blockedCount: 1,
          cancelledCount: 0,
          storedCount: 2,
          plannedAnswers: 456,
          minimumDays: 26,
          goalDays: 28,
        },
        nextCursor: null,
        items: [
          {
            id: "j",
            promptText: "CRM Москва",
            platform: "yandex_alice",
            region: "RU-MOW",
            state: "blocked",
            completedRepetitions: 2,
            attempts: 1,
            errorCode: "platform_auth_required",
            nextAttemptAt: null,
            lastAttemptAt: "2026-10-05T06:00:00Z",
            periodFrom: "2026-10-05T06:00:00Z",
            periodTo: null,
          },
          {
            id: "k",
            promptText: "CRM Санкт-Петербург",
            platform: "google_ai",
            region: "RU-SPE",
            state: "queued",
            completedRepetitions: 0,
            attempts: 0,
            errorCode: null,
            nextAttemptAt: null,
            lastAttemptAt: null,
            periodFrom: null,
            periodTo: null,
          },
        ],
      }}
    />,
  );
  for (const text of [
    "2 / 3",
    "Не проверено",
    "Требуется действие",
    "05.10.2026",
    "09:00",
    "Москва",
    "Санкт-Петербург",
    "456",
    "26",
  ]) {
    assert.ok(html.includes(text), text);
  }
  assert.equal(html.includes("0%"), false);
  assert.match(html, /текущий операционный цикл/);
  assert.match(html, /Общие счётчики.*весь каталог/s);
  assert.match(html, /Даты.*персонализац.*не фильтруют очередь/s);
});
test("GEO overdue coverage is explicit rather than silently promising twenty-eight days", () => {
 const queue:any={items:[],nextCursor:null,coverage:{startedAt:"2026-09-01T06:00:00Z",plannedCount:152,completeCount:10,remainingCount:142,blockedCount:1,cancelledCount:0,storedCount:30,plannedAnswers:456,minimumDays:26,goalDays:28}};
 const html=renderToStaticMarkup(<GeoCollectionProgress queue={queue} now={new Date("2026-10-05T06:00:00Z")}/>);
 assert.ok(html.includes("Целевой срок обхода превышен"));assert.ok(html.includes("142"));
});
