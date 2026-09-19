import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import type { CaseCardView, ContentCardView, ServiceCardView } from "../server/content/types";

const dom = new JSDOM('<!doctype html><html lang="ru"><body></body></html>', { url: "https://kordev.team/" });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node, Document: dom.window.Document, MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
});
const require = createRequire(import.meta.url);
const { render, screen, cleanup, within } = require("@testing-library/react");
require("../i18n");
const { HomePage } = require("./HomePage");

const services: ServiceCardView[] = [{ slug: "business-process-automation", title: "Интеграция и автоматизация бизнеса", summary: "Связываем рабочие процессы и системы.", priority: true }];
const projects: CaseCardView[] = [{ slug: "delivery", title: "Сервис доставки", summary: "Управление заказами в одном окне.", result: null, image: null, tags: ["Разработка"] }];
const posts: ContentCardView[] = [{ slug: "crm-guide", title: "Как выбрать CRM", summary: "Начните с процессов команды.", image: null, tags: ["CRM"] }];
afterEach(cleanup);

test("home renders the editorial commercial sequence without unverified metrics", () => {
  render(<MemoryRouter><HomePage services={services} projects={projects} posts={posts} /></MemoryRouter>);
  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
  assert.deepEqual([...document.querySelectorAll("section[id]")].map(node => node.id), ["home-hero", "proof", "cases", "services", "krasotula", "process", "insights", "contact"]);
  for (const label of ["Смотреть кейсы", "Обсудить проект", "Интеграция и автоматизация бизнеса", "Krasotula CRM"]) {
    assert.ok(screen.getByText(label, { exact: false }));
  }
  assert.ok(screen.getByRole("button", { name: "Отправить заявку" }));
  assert.doesNotMatch(document.body.textContent ?? "", /95%|8 недель|83%/);
  assert.equal(screen.getByRole("link", { name: /Смотреть кейсы/ }).getAttribute("href"), "/cases/");
  assert.ok(document.querySelector('a[href="/cases/delivery/"]'));
  assert.ok(document.querySelector('a[href="/services/business-process-automation/"]'));
  assert.ok(document.querySelector('a[href="/blog/crm-guide/"]'));
  assert.equal(within(document.getElementById("process")).getAllByRole("listitem").length, 5);
});

test("home omits empty content categories while retaining its contact form", () => {
  render(<MemoryRouter><HomePage services={[]} projects={[]} posts={[]} /></MemoryRouter>);
  for (const id of ["cases", "services", "insights"]) assert.equal(document.getElementById(id), null);
  for (const name of ["name", "phone", "description", "file", "consent", "website", "pagePath"]) {
    assert.ok(document.querySelector(`#contact form [name="${name}"]`));
  }
  assert.equal(document.querySelector('input[name="pagePath"]')?.getAttribute("value"), "/");
  assert.ok(screen.getByRole("link", { name: "team@korotkov.dev" }));
  assert.ok(screen.getByRole("link", { name: "Telegram" }));
  const maxContact = screen.getByRole("link", { name: "Геннадий Коротков", exact: true });
  assert.equal(maxContact.getAttribute("href"), "https://max.ru/u/f9LHodD0cOJpymJqsmOnWwFeDCCZGy15ba7H_HhajC8Vnm6U12_ZrsEX8uY");
  assert.equal(maxContact.getAttribute("target"), "_blank");
  for (const rel of ["noopener", "noreferrer"]) assert.ok(maxContact.relList.contains(rel));
  assert.ok(screen.getByText("Ответим в течение рабочего дня"));
  assert.ok(screen.getByText("Пн–Пт, 09:00–18:00 по Москве"));
});

test("contact form is introduced by the person who answers the request", () => {
  render(<MemoryRouter><HomePage services={[]} projects={[]} posts={[]} /></MemoryRouter>);

  const contact = document.getElementById("contact");
  assert.ok(contact);
  const portrait = within(contact).getByRole("img", { name: "Геннадий Коротков" });
  assert.equal(portrait.getAttribute("src"), "/team/gennady-korotkov.jpg?v=20260919");
  assert.ok(within(contact).getByText("Руководитель KorDevTeam"));
  assert.ok(within(contact).getByText(/лично посмотрю задачу/i));
});

test("home cards retain responsive media and use a verified result when present", () => {
  const image = { id: "image", src: "/media/case.webp", srcSet: "/media/case-640.webp 640w, /media/case.webp 1280w", sizes: "100vw", alt: "Экран заказов", decorative: false, width: 1280, height: 800 };
  render(<MemoryRouter><HomePage projects={[{ ...projects[0], result: "Единый кабинет заказов", image }]} posts={[{ ...posts[0], image: { ...image, alt: "Обложка статьи" } }]} /></MemoryRouter>);
  assert.ok(screen.getByText("Единый кабинет заказов"));
  for (const alt of ["Экран заказов", "Обложка статьи"]) {
    const img = screen.getByAltText(alt);
    assert.equal(img.getAttribute("srcset"), image.srcSet);
    assert.equal(img.getAttribute("width"), "1280");
    assert.equal(img.getAttribute("loading"), "lazy");
  }
});

test("home uses a distinctive editorial composition instead of uniform card grids", () => {
  const editorialProjects: CaseCardView[] = [
    projects[0],
    { ...projects[0], slug: "crm", title: "CRM для отдела продаж" },
    { ...projects[0], slug: "mobile", title: "Мобильное рабочее место" },
    { ...projects[0], slug: "portal", title: "Клиентский портал" },
  ];
  const editorialServices: ServiceCardView[] = [
    services[0],
    { ...services[0], slug: "web-services", title: "Заказная разработка" },
    { ...services[0], slug: "mobile-app-development", title: "Мобильные приложения" },
  ];

  render(<MemoryRouter><HomePage services={editorialServices} projects={editorialProjects} /></MemoryRouter>);

  assert.equal(within(screen.getByRole("list", { name: "Направления работы" })).getAllByRole("listitem").length, 5);
  assert.deepEqual(
    [...document.querySelectorAll("[data-home-case-layout]")].map(node => node.getAttribute("data-home-case-layout")),
    ["wide", "compact", "compact", "wide"],
  );
  assert.deepEqual(
    within(document.getElementById("services")).getAllByRole("listitem").map((item: HTMLElement) => item.getAttribute("data-service-number")),
    ["01", "02", "03"],
  );
});
