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
    readinessIntro: null,
    readinessConclusion: null,
    readiness: [],
    benefits: [],
    automationExamples: [],
    deliverables: [],
    methodologies: [],
    methodologyPrinciples: [],
    impactMetrics: [],
    recommendedReading: [],
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
  assert.ok(screen.getByRole("heading", { name: "Задачи, с которыми к нам приходят" }));
  assert.ok(screen.getByRole("heading", { name: "Этапы интеграции корпоративных систем" }));
  assert.equal(screen.queryByRole("heading", { name: "Частые вопросы" }), null);
  assert.equal(screen.queryByRole("heading", { name: "Материалы по теме" }), null);
  assert.ok(screen.getByRole("button", { name: "Отправить заявку" }));
  assert.equal(document.querySelector('input[name="pagePath"]')?.getAttribute("value"), "/services/integrations/");
  assert.deepEqual(
    [...document.querySelectorAll("[data-service-section]")].map(node => node.getAttribute("data-service-section")),
    ["hero", "problems", "solutions", "integrations", "process", "cases", "results", "guarantees", "meeting", "lead"],
  );
});

test("integration service presents disconnected systems as one end-to-end digital contour", () => {
  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView({
    readinessIntro: "Интеграция нужна, когда один процесс разорван между несколькими программами.",
    readiness: [
      { title: "Программы работают отдельно", description: "CRM, 1С и ERP не обмениваются данными." },
    ],
    benefits: [
      { title: "Сквозная цифровая цепочка", description: "Заказ виден от обращения до оплаты." },
    ],
    automationExamples: ["1С и CRM", "Сайт и учётная система"],
  })} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Когда компании нужна интеграция систем" }));
  assert.ok(screen.getByRole("heading", { name: "Что единый цифровой контур даёт бизнесу" }));
  assert.ok(screen.getByRole("heading", { name: "Какие системы мы объединяем" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция корпоративных систем под ключ" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция 1С, CRM, ERP, MES, сайтов и внешних сервисов" }));
  assert.ok(screen.getByRole("heading", { name: "Этапы интеграции корпоративных систем" }));
});

test("AI automation service leads with measurable work scenarios and human control", () => {
  render(<MemoryRouter><ServicePage pathname="/services/ai-automation/" service={serviceView({
    h1: "Внедрение ИИ в бизнес-процессы",
    readinessIntro: "ИИ полезен там, где сотрудники регулярно обрабатывают информацию по понятным правилам.",
    readiness: [
      { title: "Большой поток документов и обращений", description: "Команда вручную читает и распределяет входящие данные." },
    ],
    benefits: [
      { title: "Быстрее обработка информации", description: "Система готовит результат, а человек проверяет исключения." },
    ],
    automationExamples: ["Обработка документов и извлечение данных", "Корпоративный поиск и база знаний"],
  })} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Когда компании нужна AI-автоматизация" }));
  assert.ok(screen.getByRole("heading", { name: "Что внедрение ИИ даёт бизнесу" }));
  assert.ok(screen.getByRole("heading", { name: "Какие задачи можно передать ИИ" }));
  assert.ok(screen.getByRole("heading", { name: "Внедрение ИИ в бизнес-процессы под ключ" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция ИИ с 1С, CRM, ERP и корпоративными данными" }));
  assert.ok(screen.getByRole("heading", { name: "Этапы внедрения ИИ в бизнес-процессы" }));
  assert.ok(screen.getByText("Стоимость и сроки AI-автоматизации бизнеса"));
  assert.ok(screen.getByRole("heading", { name: "Что получает бизнес после внедрения ИИ" }));
});

test("support service presents incident response and continuous product development", () => {
  render(<MemoryRouter><ServicePage pathname="/services/additional-service/" service={serviceView({
    h1: "Техническая поддержка и развитие сайтов и веб-сервисов",
    readinessIntro: "Подключаемся, когда работа продукта уже влияет на продажи, сотрудников или клиентов.",
    readiness: [
      { title: "Критичная проблема требует быстрой реакции", description: "Останавливаем инцидент и возвращаем рабочий сценарий." },
    ],
    benefits: [
      { title: "Развитие продукта и продаж", description: "Выпускаем функции, которые помогают продукту зарабатывать." },
    ],
    automationExamples: [
      "Удаление вирусов и закрытие уязвимостей",
      "Новые функции, калькуляторы и личные кабинеты",
    ],
    problems: [],
    solutions: [
      "Выделяем клиенту публичную Kanban-доску со всеми задачами и статусами",
      "Каждый понедельник отправляем отчёт и план работ на согласование",
      "Предоставляем MCP-доступ к доске для вопросов через ChatGPT",
    ],
    integrations: ["WordPress, Drupal и 1С-Битрикс"],
    technologies: ["PHP, JavaScript и Node.js"],
    processSteps: [{ title: "Приём обращения", description: "Определяем влияние и срочность." }],
    price: {
      from: 38000,
      factors: ["Состояние кода"],
      timeRange: "по согласованному SLA",
      packageHours: 20,
      hourlyRate: 1900,
    },
    relatedCases: [],
    results: [{ title: "Стабильный продукт", description: "Критичные сценарии работают предсказуемо." }],
  })} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Когда сайту или веб-сервису нужна поддержка" }));
  assert.ok(screen.getByRole("heading", { name: "Что поддержка и развитие дают бизнесу" }));
  assert.ok(screen.getByRole("heading", { name: "Какие задачи берём на себя" }));
  assert.ok(screen.getByRole("heading", { name: "Как организована работа с клиентом" }));
  assert.ok(screen.getByText("Выделяем клиенту публичную Kanban-доску со всеми задачами и статусами"));
  assert.ok(screen.getByText("Каждый понедельник отправляем отчёт и план работ на согласование"));
  assert.ok(screen.getByText("Предоставляем MCP-доступ к доске для вопросов через ChatGPT"));
  assert.ok(screen.getByRole("heading", { name: "С какими платформами и инфраструктурой работаем" }));
  assert.ok(screen.getByRole("heading", { name: "Платформы и системы" }));
  assert.ok(screen.getByRole("heading", { name: "Инфраструктура и инструменты" }));
  assert.ok(screen.getByRole("heading", { name: "Как принимаем и ведём проект на поддержке" }));
  assert.ok(screen.getByText("Стоимость и формат технической поддержки"));
  assert.ok(screen.getByRole("heading", { name: /от 38[\s\u00a0]000 ₽ в месяц/ }));
  assert.ok(screen.getByText("Минимальный пакет — 20 часов в месяц"));
  assert.ok(screen.getByText("Ставка — 1 900 ₽/час"));
  assert.ok(screen.getByText("Время реакции: по согласованному SLA"));
  assert.ok(screen.getByRole("heading", { name: "Что получает бизнес после стабилизации продукта" }));
  const taskGrid = document.querySelector('[data-service-section="automation-examples"] ul');
  assert.match(taskGrid?.className ?? "", /lg:grid-cols-3/);
  assert.doesNotMatch(taskGrid?.querySelector("li:last-child")?.className ?? "", /sm:col-span-2/);
  assert.equal(screen.queryByRole("heading", { name: "Какие бизнес-процессы можно автоматизировать" }), null);
  assert.equal(screen.queryByRole("heading", { name: "Интеграции" }), null);
});

test("commercial service design surfaces project terms, advisor and numbered buying cues", () => {
  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView({
    price: { from: 350000, factors: ["Количество систем"], timeRange: "от 6 недель" },
  })} /></MemoryRouter>);

  const hero = document.querySelector('[data-service-section="hero"]');
  assert.ok(hero);
  assert.match(hero.textContent ?? "", /от 350[\s\u00a0]?000 ₽/);
  assert.match(hero.textContent ?? "", /от 6 недель/);
  assert.ok(hero.querySelector('img[alt="Геннадий Коротков"]'));
  assert.ok(screen.getByText("Лично разберу задачу и предложу следующий шаг."));
  assert.match(hero.querySelector("[data-hero-expert-card]")?.className ?? "", /lg:w-\[26rem\]/);
  assert.match(hero.querySelector("[data-hero-terms]")?.className ?? "", /grid-cols-1/);

  const problems = document.querySelector('[data-service-section="problems"]');
  assert.ok(problems);
  assert.equal(problems.querySelector("[data-statement-number]")?.textContent, "01");
  assert.match(problems.querySelector("h2")?.className ?? "", /text-white/);

  const meeting = document.querySelector('[data-service-section="meeting"]');
  assert.ok(meeting);
  assert.ok(screen.getByRole("heading", { name: "Как пройдёт первая встреча" }));
  assert.equal(meeting.querySelectorAll("[data-meeting-step]").length, 6);
});

test("business automation page leads with fit and business value while keeping expert detail collapsed", () => {
  const service = Object.assign(serviceView({
    readinessIntro: "Автоматизация эффективна там, где процесс выполняется регулярно.",
    readinessConclusion: "Если правила не определены, сначала стабилизируем процесс.",
    readiness: [
      { title: "Работа повторяется", description: "Сценарий выполняется регулярно." },
      { title: "Есть понятные входные данные", description: "Известно, что запускает процесс." },
      { title: "Определён нужный результат", description: "Качество результата можно проверить." },
    ],
    problems: [],
    integrations: ["CRM-системы", "ERP-системы", "MES-системы"],
    deliverables: ["Карта текущего процесса AS IS", "Модель целевого процесса TO BE"],
    methodologies: [
      { title: "BPM CBOK", description: "Основа цикла управления процессами.", href: "https://www.abpmp.org/page/guide_BPM_CBOK" },
      { title: "BPMN 2.0", description: "Стандарт моделирования процессов.", href: "https://www.omg.org/bpmn/" },
    ],
    impactMetrics: [{ title: "Время цикла", description: "Сравниваем до и после внедрения." }],
    recommendedReading: [{ title: "Учитесь видеть", description: "Майк Ротер и Джон Шук — карта потока создания ценности." }],
  }), {
    benefits: [
      { title: "Освобождает время сотрудников", description: "Рутинные операции выполняются автоматически." },
      { title: "Снижает риск ошибок", description: "Система проверяет данные и обязательные условия." },
    ],
    automationExamples: [
      "Обработка заявок и заказов",
      "Согласование документов",
      "Контроль сроков и статусов",
    ],
    methodologyPrinciples: ["Рассматриваем процесс целиком", "Измеряем эффект до и после внедрения"],
  });
  render(<MemoryRouter><ServicePage pathname="/services/business-process-automation/" service={service} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Когда автоматизация принесёт результат" }));
  assert.ok(screen.getByText("Работа повторяется"));
  assert.ok(screen.getByText("Есть понятные входные данные"));
  assert.ok(screen.getByText("Определён нужный результат"));
  assert.equal(document.querySelectorAll("[data-readiness-criterion]").length, 3);
  assert.equal(screen.queryByText("Если правила не определены, сначала стабилизируем процесс."), null);
  assert.ok(screen.getByRole("heading", { name: "Что автоматизация даёт бизнесу" }));
  assert.ok(screen.getByText("Освобождает время сотрудников"));
  assert.ok(screen.getByText("Снижает риск ошибок"));
  assert.ok(screen.getByRole("heading", { name: "Какие бизнес-процессы можно автоматизировать" }));
  assert.ok(screen.getByText("Обработка заявок и заказов"));
  assert.ok(screen.getByText("Согласование документов"));
  assert.ok(screen.getByText("Контроль сроков и статусов"));
  assert.ok(screen.getByRole("heading", { name: "Разработка и внедрение автоматизации под ключ" }));
  assert.ok(screen.getByText("Берём на себя весь путь — от изучения текущей работы до запуска системы, обучения сотрудников и оценки результата."));

  const approachSummary = screen.getByText("Показать наш подход").closest("summary");
  assert.ok(approachSummary);
  assert.equal(approachSummary.parentElement?.tagName, "DETAILS");
  assert.equal(approachSummary.parentElement?.hasAttribute("open"), false);

  assert.ok(screen.getByRole("heading", { name: "На чём основан наш подход" }));
  assert.ok(screen.getByText("Рассматриваем процесс целиком"));
  const methodsSummary = screen.getByText("Методологии и стандарты").closest("summary");
  assert.ok(methodsSummary);
  assert.equal(methodsSummary.parentElement?.tagName, "DETAILS");
  assert.match(methodsSummary.parentElement?.textContent ?? "", /BPM CBOK/);
  assert.ok(screen.getByRole("heading", { name: "Что получает клиент после обследования" }));
  assert.ok(screen.getByRole("heading", { name: "Как измеряем эффект" }));
  assert.ok(screen.getByRole("heading", { name: "Что рекомендуем изучить" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция с 1С, CRM, ERP и MES" }));
  assert.ok(screen.getByText("Стоимость и сроки автоматизации бизнес-процессов"));
  assert.ok(screen.getByRole("heading", { name: "Кейсы автоматизации бизнес-процессов" }));
  assert.ok(screen.getByText("ERP-системы"));
  assert.ok(screen.getByText("MES-системы"));
  assert.deepEqual(
    [...document.querySelectorAll("[data-service-section]")].map(node => node.getAttribute("data-service-section")),
    ["hero", "readiness", "benefits", "automation-examples", "solutions", "methodology", "deliverables", "integrations", "process", "metrics", "cases", "results", "guarantees", "reading", "meeting", "lead"],
  );
});

test("custom CRM page explains when ownership is justified and why delivery became more accessible", () => {
  const service = serviceView({
    h1: "Разработка CRM-системы на заказ",
    lead: "Создаём собственную CRM под процессы компании.",
    bodyMd: "Сравниваем совокупную стоимость владения и выбираем подходящую основу.",
    problems: [],
    readinessIntro: "Собственная CRM оправдана, когда типовой сервис ограничивает развитие бизнеса.",
    readiness: [
      { title: "Единая CRM для подразделений", description: "Распространяем общие правила на филиалы и партнёров." },
      { title: "Подписка становится слишком дорогой", description: "Сравниваем расходы за несколько лет." },
      { title: "Нестандартные процессы", description: "Учитываем собственную логику компании." },
    ],
    benefits: [
      { title: "ИИ ускоряет типовую разработку", description: "Быстрее создаём и проверяем стандартные модули." },
      { title: "Open-source даёт готовую основу", description: "Не создаём повторно базовые возможности." },
    ],
    automationExamples: [
      "CRM для отдела продаж",
      "CRM для филиальной сети",
      "CRM для сервисной компании",
      "CRM для производства",
      "CRM с личным кабинетом",
      "Отраслевая CRM и SaaS-платформа",
    ],
    solutions: ["Проектируем клиентскую базу, воронки, роли и документы"],
    integrations: ["1С и ERP", "Телефония и мессенджеры"],
    technologies: ["React", "PostgreSQL"],
    relatedCases: [],
  });

  render(<MemoryRouter><ServicePage pathname="/services/crm-development/" service={service} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Когда компании нужна собственная CRM" }));
  assert.ok(screen.getByText("Единая CRM для подразделений"));
  assert.ok(screen.getByText("Подписка становится слишком дорогой"));
  assert.ok(screen.getByRole("heading", { name: "Почему разработка собственной CRM стала доступнее" }));
  assert.ok(screen.getByText("ИИ ускоряет типовую разработку"));
  assert.ok(screen.getByText("Open-source даёт готовую основу"));
  assert.ok(screen.getByRole("heading", { name: "Какие CRM-системы мы разрабатываем" }));
  assert.ok(screen.getByText("CRM для отдела продаж"));
  assert.ok(screen.getByText("CRM для филиальной сети"));
  assert.ok(screen.getByText("Отраслевая CRM и SaaS-платформа"));
  assert.ok(screen.getByRole("heading", { name: "Разработка собственной CRM под ключ" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция CRM с 1С, ERP и сервисами" }));
  assert.ok(screen.getByRole("heading", { name: "Этапы разработки и внедрения CRM-системы" }));
  assert.ok(screen.getByText("Стоимость и сроки разработки CRM-системы на заказ"));
  assert.ok(screen.getByRole("heading", { name: "Что получает бизнес после внедрения CRM" }));
  assert.equal(screen.queryByText(/Excel и других программах/i), null);
});

test("web services page explains product fit, solution types and delivery in commercial language", () => {
  const service = serviceView({
    h1: "Разработка веб-сервисов для бизнеса",
    lead: "Создаём личные кабинеты, B2B-порталы, онлайн-калькуляторы и внутренние системы.",
    bodyMd: "Автоматизируем путь от заявки и расчёта до сметы, согласования и отправки коммерческого предложения.",
    problems: [],
    readinessIntro: "Веб-сервис нужен, когда последовательность действий повторяется и для неё известен нужный результат.",
    readiness: [
      { title: "Автоматизация работы с заявкой", description: "Сервис проводит заявку от получения и расчёта до сметы, согласования и отправки коммерческого предложения." },
      { title: "Самообслуживание клиентов", description: "Пользователь оформляет заявку и видит статус без звонка менеджеру." },
      { title: "Запуск цифрового продукта", description: "Компания запускает SaaS или отраслевую платформу." },
    ],
    benefits: [
      { title: "Снижает нагрузку на менеджеров", description: "Повторяемые операции переходят в самообслуживание." },
      { title: "Ускоряет обработку заявок", description: "Расчёты, согласования и подготовка предложения занимают меньше времени." },
    ],
    automationExamples: [
      "Личные кабинеты клиентов",
      "B2B-порталы для партнёров и дилеров",
      "Онлайн-калькуляторы и конфигураторы",
      "Внутренние корпоративные системы",
      "Сервисы автоматизации бизнес-процессов",
      "SaaS-продукты и веб-приложения",
    ],
    solutions: ["Исследуем пользователей и проектируем интерфейсы", "Разрабатываем frontend, backend и API"],
    integrations: ["1С, CRM и ERP", "Платёжные системы и ЭДО"],
    technologies: ["React и TypeScript", "Node.js и PostgreSQL"],
    processSteps: [{ title: "Исследование", description: "Определяем пользователей и ключевые сценарии." }],
    price: { from: null, factors: ["Количество ролей и сценариев"], timeRange: "MVP — от 8 недель" },
    relatedCases: [],
    results: [{ title: "Самообслуживание 24/7", description: "Пользователь выполняет операции без ожидания менеджера." }],
  });

  render(<MemoryRouter><ServicePage pathname="/services/web-services/" service={service} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Разработка веб-сервисов для бизнеса" }));
  assert.ok(screen.getByRole("heading", { name: "Какие задачи решает веб-сервис" }));
  assert.ok(screen.getByText("Автоматизация работы с заявкой"));
  assert.ok(screen.getByText(/от получения и расчёта до сметы, согласования и отправки коммерческого предложения/i));
  assert.ok(screen.getByRole("heading", { name: "Что веб-сервис даёт бизнесу" }));
  assert.ok(screen.getByText("Снижает нагрузку на менеджеров"));
  assert.ok(screen.getByText("Ускоряет обработку заявок"));
  assert.ok(screen.getByRole("heading", { name: "Какие веб-сервисы мы разрабатываем" }));
  assert.ok(screen.getByText(/выполняют конкретную задачу бизнеса/i));
  assert.equal(screen.queryByText(/прикладные продукты/i), null);
  assert.ok(screen.getByText("B2B-порталы для партнёров и дилеров"));
  assert.ok(screen.getByText("Сервисы автоматизации бизнес-процессов"));
  assert.ok(screen.getByText("SaaS-продукты и веб-приложения"));
  assert.ok(screen.getByRole("heading", { name: "Разработка веб-сервиса под ключ" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция веб-сервиса с 1С, CRM, ERP и внешними API" }));
  assert.ok(screen.getByRole("heading", { name: "Этапы разработки веб-сервиса и личного кабинета" }));
  assert.ok(screen.getByText("Стоимость и сроки разработки веб-сервиса на заказ"));
  assert.ok(screen.getByRole("heading", { name: "Что получает бизнес после запуска веб-сервиса" }));
  assert.equal(screen.queryByRole("heading", { name: "Какие бизнес-процессы можно автоматизировать" }), null);
  assert.equal(screen.queryByRole("heading", { name: "Почему разработка собственной CRM стала доступнее" }), null);
});

test("mobile app page explains product fit, business value and full-cycle delivery", () => {
  const service = serviceView({
    h1: "Разработка мобильных приложений для бизнеса",
    lead: "Создаём приложения для iOS и Android — от проверки идеи до публикации и развития.",
    bodyMd: "Проверяем, нужен ли бизнесу отдельный мобильный продукт, или задачу лучше решить адаптивным сайтом, PWA либо Telegram Mini App.",
    problems: [],
    readinessIntro: "Мобильный формат оправдан, когда смартфон сокращает путь пользователя до результата.",
    readiness: [
      { title: "Работа происходит вне офиса", description: "Сотрудник получает задания и фиксирует результат на объекте." },
      { title: "Нужно работать без стабильного интернета", description: "Критичные операции доступны офлайн и синхронизируются позднее." },
      { title: "Сценарий регулярно повторяется со смартфона", description: "Ключевое действие должно быть доступно в несколько касаний." },
    ],
    benefits: [
      { title: "Меньше звонков и ручной работы", description: "Типовые операции переходят в самообслуживание." },
      { title: "Быстрее обработка заказов и заданий", description: "Данные сразу поступают в рабочую систему." },
    ],
    automationExamples: [
      "Клиентские приложения и личные кабинеты",
      "Программы лояльности и мобильная коммерция",
      "Приложения для выездных сотрудников",
      "Сервисы заказа, записи и доставки",
      "Социальные, образовательные и контентные платформы",
      "MVP и новые мобильные продукты",
    ],
    solutions: ["Исследуем пользователей и проектируем UX/UI", "Разрабатываем приложение, backend и административную панель"],
    integrations: ["1С, CRM и ERP", "Платёжные системы, СБП и онлайн-кассы"],
    technologies: ["React Native", "iOS и Android SDK"],
    processSteps: [{ title: "Исследование", description: "Определяем пользователей, сценарии и состав MVP." }],
    price: { from: null, factors: ["Количество ролей, платформ и интеграций"], timeRange: "MVP — от 4 недель" },
    relatedCases: [],
    results: [{ title: "Продукт для реального сценария", description: "Пользователь выполняет ключевое действие со смартфона." }],
  });

  render(<MemoryRouter><ServicePage pathname="/services/mobile-app-development/" service={service} /></MemoryRouter>);

  assert.ok(screen.getByRole("heading", { name: "Когда мобильное приложение действительно нужно бизнесу" }));
  assert.ok(screen.getByText("Работа происходит вне офиса"));
  assert.ok(screen.getByRole("heading", { name: "Какой результат должно дать мобильное приложение" }));
  assert.ok(screen.getByText("Меньше звонков и ручной работы"));
  assert.ok(screen.getByText("MVP — от 4 недель"));
  assert.ok(screen.getByRole("heading", { name: "Какие мобильные приложения мы разрабатываем" }));
  assert.ok(screen.getByText("Клиентские приложения и личные кабинеты"));
  assert.ok(screen.getByText("Приложения для выездных сотрудников"));
  assert.ok(screen.getByRole("heading", { name: "Разработка мобильного приложения под ключ" }));
  assert.ok(screen.getByRole("heading", { name: "Интеграция мобильного приложения с 1С, CRM, ERP и API" }));
  assert.ok(screen.getByRole("heading", { name: "Этапы разработки мобильного приложения" }));
  assert.ok(screen.getByText("Стоимость и сроки разработки мобильного приложения"));
  assert.ok(screen.getByRole("heading", { name: "Что получает бизнес после запуска приложения" }));
  assert.equal(screen.queryByRole("heading", { name: "Какие бизнес-процессы можно автоматизировать" }), null);
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
    ["hero", "faq", "meeting", "lead"],
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
