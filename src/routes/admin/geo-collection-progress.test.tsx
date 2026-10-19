import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GeoCollectionProgress } from "./geo-collection-progress";
import { JSDOM } from "jsdom";

test("GEO rows distinguish collected answers from brand visibility in each platform's saved sample", () => {
  const answer = (id: string, mentioned: boolean, linked: boolean, cited: boolean, repetition: number) => ({
    id, repetition, mentioned, linked, cited, observedAt: "2026-10-06T06:49:00Z", sessionPersonalized: true,
  });
  const job = { id: "alice", promptText: "Где заказать внедрение автоматизации бизнес-процессов?",
    platform: "yandex_alice", surface: "alice_web", region: "RU", state: "complete", completedRepetitions: 3,
    attempts: 1, errorCode: null, nextAttemptAt: null, lastAttemptAt: null, periodFrom: null, periodTo: null };
  const queue: any = { coverage: { plannedCount: 3, completeCount: 2, remainingCount: 1, blockedCount: 0,
    cancelledCount: 0, storedCount: 7, plannedAnswers: 9, minimumDays: 1, goalDays: 28 }, nextCursor: null,
    items: [
      { ...job, observations: [answer("alice-1", false, false, false, 1), answer("alice-2", false, false, false, 2), answer("alice-3", false, false, false, 3)] },
      { ...job, id: "chatgpt", platform: "chatgpt_search", surface: "chatgpt_search_web",
        observations: [answer("chat-1", true, false, false, 1), answer("chat-2", true, false, false, 2), answer("chat-3", false, true, true, 3)] },
      { ...job, id: "partial", state: "retry_wait", completedRepetitions: 1,
        observations: [answer("partial-1", false, false, false, 1)] },
    ] };
  const document = new JSDOM(renderToStaticMarkup(<GeoCollectionProgress queue={queue} />)).window.document;
  const headers = [...document.querySelectorAll("th")].map(x => x.textContent);
  const index = (label: string) => { const result = headers.indexOf(label); assert.notEqual(result, -1, label); return result; };
  const rows = [...document.querySelectorAll("tbody tr")];
  assert.equal(rows[0].children[index("Проверено")].textContent?.trim(), "3 / 3");
  assert.equal(rows[0].children[index("Нас упомянули")].textContent?.trim(), "0 / 3");
  assert.equal(rows[0].children[index("Ссылка на сайт")].textContent?.trim(), "0 / 3");
  assert.equal(rows[1].children[index("Нас упомянули")].textContent?.trim(), "2 / 3");
  assert.equal(rows[1].children[index("Ссылка на сайт")].textContent?.trim(), "1 / 3");
  assert.match(rows[1].querySelector("details")?.textContent ?? "", /Ссылка на сайт: да\. Сайт в источниках: да/);
  assert.doesNotMatch(rows[1].textContent!, /Прямая ссылка/);
  assert.equal(rows[2].children[index("Проверено")].textContent?.trim(), "1 / 3");
  assert.equal(rows[2].children[index("Нас упомянули")].textContent?.trim(), "0 / 1");
  assert.match(rows[0].textContent!, /06\.10\.2026.*09:49/s);
  assert.match(rows[0].textContent!, /Персонализированная/);
  assert.match(rows[0].textContent!, /alice_web/);
  assert.deepEqual([...rows[0].querySelectorAll("a")].map(x => new URL(x.href, "https://kordev.team").searchParams.get("observation")), ["alice-1", "alice-2", "alice-3"]);
  assert.equal(rows[0].querySelectorAll('a[href*="chat-"]').length, 0);
  assert.match(document.body.textContent!, /не означает.*рекомендац/);
  assert.match(document.body.textContent!, /ответ.*может отличаться/);
});

test("missing GEO evidence never becomes a negative visibility result", () => {
  const queue: any = { items: [{ id: "missing", promptText: "Старый счётчик без сохранённых ответов", platform: "yandex_alice", region: "RU", state: "complete",
    completedRepetitions: 3, observations: [], attempts: 1, errorCode: null, nextAttemptAt: null, lastAttemptAt: null, periodFrom: null, periodTo: null }],
    nextCursor: null, coverage: { plannedCount: 1, completeCount: 1, remainingCount: 0, blockedCount: 0, cancelledCount: 0, storedCount: 3, plannedAnswers: 3, minimumDays: 1, goalDays: 28 } };
  const document = new JSDOM(renderToStaticMarkup(<GeoCollectionProgress queue={queue} />)).window.document;
  const row = document.querySelector("tbody tr")!;
  const headers = [...document.querySelectorAll("th")].map(x => x.textContent);
  for (const label of ["Нас упомянули", "Ссылка на сайт"]) {
    assert.equal(row.children[headers.indexOf(label)]?.textContent?.trim(), "Нет данных");
  }
  assert.match(row.textContent!, /Нет сохранённых ответов/);
  assert.equal(row.querySelectorAll("a").length, 0);
});
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
