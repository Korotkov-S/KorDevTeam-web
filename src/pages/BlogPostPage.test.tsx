import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', {
  url: "https://kordev.team/blog/editorial/",
});
Object.assign(globalThis, {
  React,
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
const { BlogPostPage } = require("./BlogPostPage");

afterEach(cleanup);

test("article opens with a visible lead and a personal author byline", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "Как перестроить рабочий процесс",
          excerpt: "Практический разбор автоматизации без лишних инструментов.",
          bodyMd: "## Первый шаг\n\nНачните с карты процесса.",
          publishedAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
          readTime: "5 мин",
          tags: ["Автоматизация"],
          coverUrl: "",
          imageUrls: [],
          media: {},
        }} />}/>
      </Routes>
    </MemoryRouter>,
  );

  assert.ok(screen.getByText("Практический разбор автоматизации без лишних инструментов."));
  const author = screen.getByRole("complementary", { name: "Об авторе" });
  assert.ok(author.textContent?.includes("Геннадий Коротков"));
  assert.ok(author.textContent?.includes("Руководитель KorDevTeam"));
  assert.equal(author.querySelector("img")?.getAttribute("src"), "/team/gennady-korotkov.jpg?v=20260919");
});

test("article does not repeat an excerpt that already opens the body", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "Рабочий процесс",
          excerpt: "Вступление к статье.",
          bodyMd: "Вступление к статье.\n\n## Первый раздел\n\nОсновной текст.",
          publishedAt: "2026-09-01T00:00:00.000Z",
          readTime: "3 мин",
          tags: [],
          coverUrl: "",
          imageUrls: [],
          media: {},
        }} />}/>
      </Routes>
    </MemoryRouter>,
  );

  assert.equal(screen.getAllByText("Вступление к статье.").length, 1);
  assert.ok(screen.getByRole("heading", { name: "Первый раздел" }));
});
