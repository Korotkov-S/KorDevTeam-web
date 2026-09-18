import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import type { ServicePageView } from "../server/content/types";

const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', {
  url: "https://kordev.team/services/integrations/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Document: dom.window.Document,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const require = createRequire(import.meta.url);
const { cleanup, render, screen } = require("@testing-library/react");
require("../i18n");
const { ServicePage } = require("./ServicePage");

function serviceView(overrides: Partial<ServicePageView> = {}): ServicePageView {
  return {
    h1: "Интеграции для бизнеса",
    lead: "Связываем сервисы и убираем повторяющуюся ручную работу.",
    bodyMd: "## Состав работ\n\nПроектируем обмен данными и контролируем результат.",
    problems: ["Данные приходится переносить вручную"],
    solutions: ["Настраиваем надёжный обмен между системами"],
    integrations: ["CRM", "1С"],
    technologies: ["TypeScript"],
    processSteps: [{ title: "Анализ", description: "Разбираем процессы и точки обмена." }],
    price: { from: null, factors: ["Количество систем"], timeRange: "После обследования" },
    results: [{ title: "Единый поток данных", description: "Команда работает без повторного ввода." }],
    guarantees: [{ title: "Контроль запуска", description: "Проверяем интеграцию на реальных сценариях." }],
    relatedCases: [{ slug: "delivery", title: "Сервис доставки", summary: "Единый кабинет заказов.", result: null, image: null, tags: [] }],
    relatedArticles: [],
    faq: [],
    cta: { title: "Обсудить интеграцию", text: "Опишите системы, которые нужно связать.", type: "form" },
    ...overrides,
  };
}

afterEach(cleanup);

test("service page renders populated commercial blocks in their customer journey order", () => {
  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView()} /></MemoryRouter>);

  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
  assert.ok(screen.getByRole("heading", { name: "Что решаем" }));
  assert.ok(screen.getByRole("heading", { name: "Как работаем" }));
  assert.equal(screen.queryByRole("heading", { name: "Частые вопросы" }), null);
  assert.equal(screen.queryByRole("heading", { name: "Материалы по теме" }), null);
  assert.ok(screen.getByRole("button", { name: "Отправить заявку" }));
  assert.equal(document.querySelector('input[name="pagePath"]')?.getAttribute("value"), "/services/integrations/");
  assert.deepEqual(
    [...document.querySelectorAll("[data-service-section]")].map(node => node.getAttribute("data-service-section")),
    ["hero", "problems", "solutions", "integrations", "process", "cases", "results", "guarantees", "lead"],
  );
});

test("service FAQ is native, server-rendered and omitted when empty", () => {
  const view = render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView({
    bodyMd: "", problems: [], solutions: [], integrations: [], technologies: [], processSteps: [], price: null,
    relatedCases: [], results: [], guarantees: [], relatedArticles: [],
    faq: [{ question: "Можно связать несколько CRM?", answer: "Да, после проверки доступных API." }],
  })} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Частые вопросы" }));
  const disclosure = document.querySelector("details");
  assert.ok(disclosure);
  assert.equal(screen.getByText("Можно связать несколько CRM?").closest("summary"), disclosure.querySelector("summary"));
  assert.match(disclosure.textContent ?? "", /Да, после проверки доступных API/);
  assert.deepEqual(
    [...document.querySelectorAll("[data-service-section]")].map(node => node.getAttribute("data-service-section")),
    ["hero", "faq", "lead"],
  );

  view.rerender(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView({ faq: [] })} /></MemoryRouter>);
  assert.equal(document.querySelector("details"), null);
});
