import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import type { CommercialCaseView } from "../server/content/types";
import type { MediaPresentationMap } from "../server/media/presentation";

const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', {
  url: "https://kordev.team/cases/example/",
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
const { CommercialCasePage } = require("./CommercialCasePage");

function caseView(overrides: Partial<CommercialCaseView> = {}): CommercialCaseView {
  return {
    slug: "example",
    h1: "Платформа для логистики",
    summary: "Объединили заказы и статусы доставки в одном интерфейсе.",
    problem: "Менеджеры вручную сверяли данные из нескольких систем.",
    constraints: ["Запуск без остановки действующих процессов"],
    solution: "Спроектировали единый кабинет и автоматический обмен данными.",
    architecture: "Сервисный слой отделяет кабинет от внешних API.",
    integrations: ["CRM", "Служба доставки"],
    technologies: [],
    features: [],
    stages: [{ title: "Проектирование", description: "Согласовали потоки данных и роли." }],
    team: ["Аналитик", "Два разработчика"],
    screenshots: [],
    media: {},
    results: [],
    testimonial: null,
    bodyMd: "",
    demoUrl: null,
    githubUrl: null,
    relatedServices: [{ slug: "integrations", title: "Интеграции", summary: "Связываем системы.", priority: true }],
    relatedCases: [],
    cta: { title: null, text: null, type: null },
    ...overrides,
  };
}

afterEach(cleanup);

test("case page omits unsupported proof and preserves the narrative order", () => {
  render(<MemoryRouter><CommercialCasePage pathname="/cases/example/" project={caseView()} /></MemoryRouter>);

  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
  assert.ok(screen.getByRole("heading", { name: "Задача" }));
  assert.ok(screen.getByRole("heading", { name: "Решение" }));
  assert.equal(screen.queryByRole("heading", { name: "Результаты" }), null);
  assert.equal(screen.queryByText(/отзыв клиента/i), null);
  assert.equal(screen.queryByRole("link", { name: /открыть проект/i }), null);
  assert.equal(document.querySelector('input[name="pagePath"]')?.getAttribute("value"), "/cases/example/");
  assert.deepEqual(
    [...document.querySelectorAll("[data-case-section]")].map(node => node.getAttribute("data-case-section")),
    ["hero", "problem", "solution", "stages", "team", "services", "lead"],
  );
});

test("case page exposes an editorial section index for its available story", () => {
  render(<MemoryRouter><CommercialCasePage pathname="/cases/example/" project={caseView()} /></MemoryRouter>);

  const navigation = screen.getByRole("navigation", { name: "Навигация по кейсу" });
  assert.deepEqual(
    [...navigation.querySelectorAll("a")].map(link => [link.textContent, link.getAttribute("href")]),
    [
      ["Задача", "#case-problem"],
      ["Решение", "#case-solution"],
      ["Этапы", "#case-stages"],
      ["Команда", "#case-team"],
    ],
  );
});

test("case page renders confirmed proof and links without hiding related navigation", () => {
  render(<MemoryRouter><CommercialCasePage pathname="/cases/example/" project={caseView({
    demoUrl: "https://example.com/product",
    results: [{ title: "Единый контроль", description: "Все статусы доступны в одном окне." }],
    testimonial: "Команда запустила систему без остановки операций.",
    relatedCases: [{ slug: "next", title: "Следующий кейс", summary: "Другой проект.", result: null, image: null, tags: [] }],
  })} /></MemoryRouter>);

  assert.equal(screen.getByRole("link", { name: "Открыть проект" }).getAttribute("href"), "https://example.com/product");
  assert.ok(screen.getByRole("heading", { name: "Результаты" }));
  assert.ok(screen.getByText("Команда запустила систему без остановки операций."));
  assert.equal(screen.getByRole("link", { name: "Подробнее: Интеграции" }).getAttribute("href"), "/services/integrations/");
  assert.equal(screen.getByRole("link", { name: "Смотреть кейс: Следующий кейс" }).getAttribute("href"), "/cases/next/");
});

test("case markdown resolves media-library images in structured and legacy sections", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000051",
    "00000000-0000-4000-8000-000000000052",
  ];
  const media: MediaPresentationMap = Object.fromEntries(ids.map((id, index) => [id, {
    id,
    src: `https://cdn.example/cases/image-${index + 1}.png`,
    srcSet: "",
    sizes: "100vw",
    alt: `Экран ${index + 1}`,
    decorative: false,
    width: 1200,
    height: 800,
  }]));
  const project = caseView({
    problem: `![Проблема](media:${ids[0]})`,
    bodyMd: `![Результат](media:${ids[1]})`,
  });
  (project as CommercialCaseView & { media: MediaPresentationMap }).media = media;

  render(<MemoryRouter><CommercialCasePage pathname="/cases/example/" project={project} /></MemoryRouter>);

  assert.equal(screen.getByRole("img", { name: "Экран 1" }).getAttribute("src"), "https://cdn.example/cases/image-1.png");
  assert.equal(screen.getByRole("img", { name: "Экран 2" }).getAttribute("src"), "https://cdn.example/cases/image-2.png");
});
