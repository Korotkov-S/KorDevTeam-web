import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', {
  url: "https://kordev.team/blog/editorial/",
});
const matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});
dom.window.matchMedia = matchMedia as typeof dom.window.matchMedia;
Object.assign(globalThis, {
  React,
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Document: dom.window.Document,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  matchMedia,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const require = createRequire(import.meta.url);
const { cleanup, render, screen } = require("@testing-library/react");
require("../i18n");
const { BlogPostPage } = require("./BlogPostPage");
const { getBlogCategory } = require("../lib/blogCategories") as typeof import("../lib/blogCategories");
const { selectPublishedRelatedEntries } = require("../routes/blog-post") as typeof import("../routes/blog-post");
const businessCategory = getBlogCategory("business-automation")!;

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
          category: "business-automation",
        }} category={businessCategory} relatedArticles={[]} />}/>
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
          category: "business-automation",
        }} category={businessCategory} relatedArticles={[]} />}/>
      </Routes>
    </MemoryRouter>,
  );

  assert.equal(screen.getAllByText("Вступление к статье.").length, 1);
  assert.ok(screen.getByRole("heading", { name: "Первый раздел" }));
});

test("article hero preserves the specific markdown alt text for its source image", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "Рабочий процесс",
          excerpt: "Практический разбор.",
          bodyMd: "![Обсуждение процесса за столом](/first.jpg)",
          publishedAt: "2026-09-01T00:00:00.000Z",
          readTime: "3 мин",
          tags: [],
          coverUrl: "/first.jpg",
          imageUrls: ["/first.jpg"],
          media: {},
          category: "business-automation",
        }} category={businessCategory} relatedArticles={[]} />}/>
      </Routes>
    </MemoryRouter>,
  );

  assert.ok(screen.getByAltText("Обсуждение процесса за столом"));
});

test("article content column can shrink around a wide markdown table", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "Рабочий процесс",
          excerpt: "Практический разбор.",
          bodyMd: "| Шаг | Участник | Результат |\n| --- | --- | --- |\n| Получить заявку | Сайт | Заявка создана |",
          publishedAt: "2026-09-01T00:00:00.000Z",
          readTime: "3 мин",
          tags: [],
          coverUrl: "",
          imageUrls: [],
          media: {},
          category: "business-automation",
        }} category={businessCategory} relatedArticles={[]} />}/>
      </Routes>
    </MemoryRouter>,
  );

  const articleBody = document.querySelector('[itemprop="articleBody"]');
  assert.ok(articleBody?.parentElement?.classList.contains("min-w-0"));
});

test("article title can wrap an unbroken long word on a narrow screen", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "CRM для предпринимателя",
          excerpt: "Практический разбор.",
          bodyMd: "Основной текст.",
          publishedAt: "2026-09-01T00:00:00.000Z",
          readTime: "3 мин",
          tags: [],
          coverUrl: "",
          imageUrls: [],
          media: {},
          category: "business-automation",
        }} category={businessCategory} relatedArticles={[]} />}/>
      </Routes>
    </MemoryRouter>,
  );

  const title = screen.getByRole("heading", { name: "CRM для предпринимателя", level: 1 });
  assert.ok(title.classList.contains("break-words"));
});

test("a published legacy article without taxonomy remains readable", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "Материал из редактора",
          excerpt: "Опубликован до введения категорий.",
          bodyMd: "Основной текст.",
          publishedAt: "2026-09-01T00:00:00.000Z",
          readTime: "3 мин",
          tags: [],
          coverUrl: "",
          imageUrls: [],
          media: {},
          category: null,
        }} category={null} relatedArticles={[]} />}/>
      </Routes>
    </MemoryRouter>,
  );

  assert.ok(screen.getByRole("heading", { name: "Материал из редактора", level: 1 }));
  assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"]'), null);
  assert.ok(screen.getAllByRole("button", { name: "Вернуться к блогу" }).length >= 1);
});

const relatedArticles = ["related-one", "related-two", "related-three"].map((slug, index) => ({
  id: `related-${index}`,
  slug,
  title: `Связанная статья ${index + 1}`,
  excerpt: "Практическое продолжение темы.",
  date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  readTime: "4 мин",
  tags: ["Автоматизация"],
  category: "business-automation" as const,
}));

test("article renders category breadcrumbs and three curated related cards in order", () => {
  render(
    <MemoryRouter initialEntries={["/blog/editorial/"]}>
      <Routes>
        <Route path="/blog/:slug/" element={<BlogPostPage article={{
          title: "Рабочий процесс",
          excerpt: "Практический разбор.",
          bodyMd: "Основной текст.",
          publishedAt: "2026-09-01T00:00:00.000Z",
          readTime: "3 мин",
          tags: [],
          coverUrl: "",
          imageUrls: [],
          media: {},
          category: "business-automation",
        }} category={businessCategory} relatedArticles={relatedArticles} />}/>
      </Routes>
    </MemoryRouter>,
  );

  assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/blog/"]')?.textContent, "Блог");
  assert.equal(document.querySelector('nav[aria-label="Хлебные крошки"] a[href="/blog/category/business-automation/"]')?.textContent, "Автоматизация бизнеса");
  assert.deepEqual(
    [...document.querySelectorAll('section[aria-labelledby="related-articles-title"] article a')]
      .map(link => link.getAttribute("href")),
    ["/blog/related-one/", "/blog/related-two/", "/blog/related-three/"],
  );
});

test("published related lookup omits an unavailable article and preserves curated order", () => {
  const available = [
    { slug: "related-three" },
    { slug: "related-one" },
  ];

  assert.deepEqual(
    selectPublishedRelatedEntries(
      ["related-one", "related-two", "related-three"],
      available as Parameters<typeof selectPublishedRelatedEntries>[1],
    ).map(entry => entry.slug),
    ["related-one", "related-three"],
  );
});
