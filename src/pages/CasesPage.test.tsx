import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";

import type { CaseCardView } from "../server/content/types";

const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', { url: "https://kordev.team/cases/" });
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
const { CasesPage } = require("./CasesPage");

type FilterableCase = CaseCardView & {
  categories: string[];
  catalogOrder: number | null;
  catalogVisible: boolean;
};

function project(index: number, categories: string[] = ["web-service"]): FilterableCase {
  return {
    slug: `case-${index}`,
    title: `Кейс ${index}`,
    summary: `Описание кейса ${index}`,
    result: `Результат ${index}`,
    image: null,
    tags: ["Первый тег", "Второй тег", "Третий тег", "Скрытый тег"],
    categories,
    catalogOrder: null,
    catalogVisible: true,
  };
}

afterEach(cleanup);

test("catalog renders every case link before filtering", () => {
  const projects = Array.from({ length: 26 }, (_, index) => project(index));

  render(<MemoryRouter><CasesPage projects={projects} /></MemoryRouter>);

  assert.equal(screen.getAllByRole("article").length, 26);
  assert.equal(screen.getAllByRole("link", { name: /Смотреть кейс/ }).length, 26);
  assert.equal(screen.getByText("26 проектов").getAttribute("aria-live"), "polite");
});

test("category filter hides unrelated cards and can reset", () => {
  const projects = [
    project(1, ["mobile"]),
    project(2, ["commerce"]),
    project(3, ["mobile", "automation"]),
  ];

  render(<MemoryRouter><CasesPage projects={projects} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Мобильные приложения" }));

  assert.equal(screen.getAllByRole("article").length, 2);
  assert.ok(screen.getByRole("article", { name: "Кейс 1" }));
  assert.equal(screen.queryByRole("article", { name: "Кейс 2" }), null);
  assert.equal(screen.getByText("2 проекта").getAttribute("aria-live"), "polite");
  assert.equal(screen.getByRole("button", { name: "Мобильные приложения" }).getAttribute("aria-pressed"), "true");

  fireEvent.click(screen.getByRole("button", { name: "Все проекты" }));
  assert.equal(screen.getAllByRole("article").length, 3);
  assert.equal(screen.getByRole("button", { name: "Все проекты" }).getAttribute("aria-pressed"), "true");
});

test("catalog hides excluded projects and puts curated projects first", () => {
  const serviceplus = { ...project(1), slug: "serviceplus", title: "ServicePlus", catalogOrder: 1 };
  const amch = { ...project(2), slug: "amch", title: "AMCH", catalogOrder: 2 };
  const ordinary = { ...project(3), slug: "ordinary", title: "Обычный проект" };
  const inplain = { ...project(4), slug: "inplain", title: "Inplain", catalogVisible: false };

  render(<MemoryRouter><CasesPage projects={[ordinary, inplain, amch, serviceplus]} /></MemoryRouter>);

  assert.deepEqual(
    screen.getAllByRole("article").map((article: HTMLElement) => article.getAttribute("aria-label")),
    ["ServicePlus", "AMCH", "Обычный проект"],
  );
  assert.equal(screen.queryByRole("article", { name: "Inplain" }), null);
  assert.equal(screen.getByText("3 проекта").getAttribute("aria-live"), "polite");
});

test("case card exposes its title and limits visible tags to three", () => {
  render(<MemoryRouter><CasesPage projects={[project(1)]} /></MemoryRouter>);

  const card = screen.getByRole("article", { name: "Кейс 1" });
  assert.match(card.textContent ?? "", /Первый тег/);
  assert.match(card.textContent ?? "", /Третий тег/);
  assert.doesNotMatch(card.textContent ?? "", /Скрытый тег/);
});
