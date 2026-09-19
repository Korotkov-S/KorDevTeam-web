import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import type { ServicePageView } from "../server/content/types";
import type { MediaPresentationMap } from "../server/media/presentation";
import { setAnalyticsSinkForTests, type AnalyticsPayload } from "../lib/analytics";

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
const { cleanup, fireEvent, render, screen } = require("@testing-library/react");
require("../i18n");
const { ServicePage } = require("./ServicePage");

function serviceView(overrides: Partial<ServicePageView> = {}): ServicePageView {
  return {
    h1: "Интеграции для бизнеса",
    lead: "Связываем сервисы и убираем повторяющуюся ручную работу.",
    bodyMd: "## Состав работ\n\nПроектируем обмен данными и контролируем результат.",
    media: {},
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

afterEach(() => {
  cleanup();
  setAnalyticsSinkForTests(null);
});

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

test("primary service CTA emits service_cta_click without changing its anchor destination", () => {
  const events: Array<{ event: string; payload: AnalyticsPayload }> = [];
  setAnalyticsSinkForTests((event, payload) => events.push({ event, payload }));
  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView()} /></MemoryRouter>);

  const cta = screen.getByRole("link", { name: "Обсудить задачу" });
  fireEvent.click(cta);

  assert.equal(cta.getAttribute("href"), "#contact");
  assert.deepEqual(events, [{
    event: "service_cta_click",
    payload: { path: "/services/integrations/", serviceSlug: "integrations" },
  }]);
});

test("service markdown resolves media-library images from its presentation map", () => {
  const id = "00000000-0000-4000-8000-000000000041";
  const media: MediaPresentationMap = {
    [id]: {
      id,
      src: "https://cdn.example/services/diagram.png",
      srcSet: "https://cdn.example/services/diagram-640.webp 640w",
      sizes: "(max-width: 768px) 100vw, 768px",
      alt: "Схема интеграции",
      decorative: false,
      width: 1280,
      height: 720,
    },
  };
  const service = serviceView({ bodyMd: `![Схема](media:${id})` });
  (service as ServicePageView & { media: MediaPresentationMap }).media = media;

  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={service} /></MemoryRouter>);

  const image = screen.getByRole("img", { name: "Схема интеграции" });
  assert.equal(image.getAttribute("src"), "https://cdn.example/services/diagram.png");
  assert.match(image.getAttribute("srcset") ?? "", /diagram-640\.webp/);
});

test("lead alternatives emit contact events with the current page path", () => {
  const events: Array<{ event: string; payload: AnalyticsPayload }> = [];
  setAnalyticsSinkForTests((event, payload) => events.push({ event, payload }));
  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView()} /></MemoryRouter>);

  fireEvent.click(screen.getByRole("link", { name: "team@korotkov.dev" }));
  fireEvent.click(screen.getByRole("link", { name: "Telegram" }));

  assert.deepEqual(events, [
    { event: "email_click", payload: { path: "/services/integrations/" } },
    { event: "telegram_click", payload: { path: "/services/integrations/" } },
  ]);
});
