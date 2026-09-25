import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { contentEntries } from "../db/schema";
import { applyCommercialServiceSources, loadCommercialServiceSources } from "./commercialServices";
import { listPublishedRelations } from "./relations";

test("business automation source qualifies repeatable processes and cites primary methods", async () => {
  const sources = await loadCommercialServiceSources();
  const automation = sources.find(source => source.slug === "business-process-automation");
  assert.ok(automation);
  assert.match(String(automation.payload.readinessIntro), /выполняется регулярно/i);
  assert.deepEqual(
    (automation.payload.readiness as Array<{ title: string }>).slice(0, 3).map(item => item.title),
    ["Работа повторяется", "Есть понятные входные данные", "Определён нужный результат"],
  );
  assert.equal((automation.payload.readiness as unknown[]).length, 3);
  assert.equal(automation.payload.readinessConclusion, undefined);
  assert.deepEqual(
    (automation.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "Освобождает время сотрудников",
      "Перенаправляет внимание команды",
      "Снижает риск ошибок",
      "Ускоряет выполнение работы",
      "Делает процессы управляемыми",
      "Помогает расти без пропорционального расширения штата",
    ],
  );
  assert.deepEqual(
    automation.payload.integrations,
    ["1С и учётные системы", "CRM-системы", "ERP-системы", "MES-системы", "Телефония, почта и мессенджеры", "Банки, ЭДО и внешние API"],
  );
  assert.deepEqual(
    automation.payload.automationExamples,
    [
      "Обработка заявок и заказов",
      "Согласование документов",
      "Передача задач между отделами",
      "Подготовка договоров и отчётов",
      "Контроль сроков и статусов",
      "Обмен данными между 1С, CRM, ERP и MES",
      "Производственные и складские операции",
    ],
  );
  assert.match(automation.seoDescription, /аудит.+разработка.+внедрение.+1С.+ERP.+MES.+стоимост/i);
  assert.deepEqual(
    automation.faq.slice(0, 4).map(item => item.question),
    [
      "С чего начать автоматизацию бизнес-процессов компании?",
      "Какие бизнес-процессы можно автоматизировать?",
      "Сколько стоит автоматизация бизнес-процессов?",
      "Сколько занимает разработка и внедрение автоматизации?",
    ],
  );
  assert.deepEqual(
    (automation.payload.methodologies as Array<{ href: string }>).map(item => new URL(item.href).hostname),
    ["www.abpmp.org", "www.apqc.org", "www.lean.org", "www.omg.org"],
  );
});

test("custom CRM source prioritizes ownership economics without the Excel diagnostic", async () => {
  const sources = await loadCommercialServiceSources();
  const crm = sources.find(source => source.slug === "crm-development");
  assert.ok(crm);
  assert.deepEqual(
    (crm.payload.readiness as Array<{ title: string }>).map(item => item.title),
    [
      "Единая CRM для подразделений",
      "Подписка становится слишком дорогой",
      "Готовые решения не поддерживают процесс",
      "Нужны глубокие интеграции",
      "Важен контроль над данными и кодом",
      "CRM становится собственным продуктом",
    ],
  );
  assert.deepEqual(
    (crm.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "ИИ ускоряет типовую разработку",
      "Open-source даёт готовую основу",
      "Бюджет направляется на уникальную логику",
    ],
  );
  assert.deepEqual(
    crm.payload.automationExamples,
    [
      "CRM для отдела продаж",
      "CRM для филиальной сети",
      "CRM для сервисной компании",
      "CRM для производства",
      "CRM с личным кабинетом",
      "Отраслевая CRM и SaaS-платформа",
    ],
  );
  assert.doesNotMatch(JSON.stringify(crm), /Excel и других программах/i);
  assert.match(crm.seoDescription, /CRM.+заказ.+стоимост.+1С/i);
  assert.deepEqual(
    crm.faq.slice(0, 5).map(item => item.question),
    [
      "Когда компании нужна собственная CRM?",
      "Когда собственная CRM дешевле подписки на Битрикс24?",
      "Сколько стоит разработка CRM-системы на заказ?",
      "Можно ли использовать готовую open-source CRM?",
      "Как ИИ-инструменты снижают стоимость разработки CRM?",
    ],
  );
  assert.deepEqual(
    crm.faq.slice(-2).map(item => item.question),
    [
      "Можно разработать CRM для нескольких филиалов и компаний?",
      "Чем собственная CRM отличается от Битрикс24 и amoCRM?",
    ],
  );
});

test("web services source owns the personal account and B2B portal commercial clusters", async () => {
  const sources = await loadCommercialServiceSources();
  const webServices = sources.find(source => source.slug === "web-services");
  assert.ok(webServices);
  assert.equal(webServices.payload.h1, "Разработка веб‑сервисов для бизнеса");
  assert.match(webServices.seoTitle, /веб-сервис.+заказ.+под ключ/i);
  assert.match(webServices.seoDescription, /личн.+кабинет.+B2B-портал.+1С.+CRM/i);
  assert.ok(String(webServices.bodyMd).length > 300);
  assert.equal((webServices.payload.readiness as Array<unknown>).length, 6);
  assert.equal((webServices.payload.benefits as Array<unknown>).length, 6);
  assert.deepEqual(
    (webServices.payload.readiness as Array<{ title: string }>).map(item => item.title),
    [
      "Автоматизация работы с заявкой",
      "Автоматизация действий менеджеров",
      "Самообслуживание клиентов",
      "Единая работа с партнёрами",
      "Сложные расчёты по правилам",
      "Запуск цифрового продукта",
    ],
  );
  assert.match(
    String((webServices.payload.readiness as Array<{ description: string }>)[0]?.description),
    /заявк.+расч.+смет.+согласован.+коммерческ.+предлож/i,
  );
  assert.deepEqual(
    (webServices.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "Снижает нагрузку на менеджеров",
      "Ускоряет обработку заявок",
      "Сокращает количество ошибок",
      "Делает работу прозрачной",
      "Объединяет данные компании",
      "Помогает расти без расширения штата",
    ],
  );
  assert.deepEqual(webServices.payload.automationExamples, [
    "Личные кабинеты клиентов",
    "B2B-порталы для партнёров и дилеров",
    "Онлайн-калькуляторы и конфигураторы",
    "Внутренние корпоративные системы",
    "Сервисы автоматизации бизнес-процессов",
    "SaaS-продукты и веб-приложения",
  ]);
  assert.deepEqual(webServices.payload.integrations, [
    "1С, CRM и ERP",
    "Платёжные системы и онлайн-кассы",
    "ЭДО, доставка и уведомления",
    "Карты, аналитика и внешние API",
  ]);
  assert.deepEqual(
    webServices.faq.slice(0, 5).map(item => item.question),
    [
      "Для каких задач бизнесу нужен веб-сервис?",
      "Сколько стоит разработка веб-сервиса на заказ?",
      "Чем веб-сервис отличается от обычного сайта?",
      "Можно ли начать разработку веб-сервиса с MVP?",
      "Можно ли создать B2B-портал для дилеров и партнёров?",
    ],
  );
  assert.equal(webServices.faq.length, 8);
});

test("mobile app source owns the business and custom development commercial clusters", async () => {
  const sources = await loadCommercialServiceSources();
  const mobile = sources.find(source => source.slug === "mobile-app-development");
  assert.ok(mobile);
  assert.equal(mobile.payload.h1, "Разработка мобильных приложений для бизнеса");
  assert.match(mobile.seoTitle, /разработк.+мобильн.+приложен.+заказ.+iOS.+Android/i);
  assert.match(mobile.seoDescription, /1С.+CRM.+ERP.+офлайн.+публикац/i);
  assert.ok(String(mobile.bodyMd).length > 300);
  assert.deepEqual(
    (mobile.payload.readiness as Array<{ title: string }>).map(item => item.title),
    [
      "Работа происходит вне офиса",
      "Нужно работать без стабильного интернета",
      "Сценарий регулярно повторяется со смартфона",
      "Нужны возможности устройства",
      "Пользователь должен получать информацию сразу",
      "Приложение становится частью продукта",
    ],
  );
  assert.deepEqual(
    (mobile.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "Меньше звонков и ручной работы",
      "Быстрее обработка заказов и заданий",
      "Данные с места работы поступают сразу",
      "Меньше ошибок и повторного ввода",
      "Выше частота повторных действий",
      "Ниже стоимость одной операции",
    ],
  );
  assert.equal(mobile.payload.timeRange, "MVP — от 4 недель");
  assert.deepEqual(mobile.payload.automationExamples, [
    "Клиентские приложения и личные кабинеты",
    "Программы лояльности и мобильная коммерция",
    "Приложения для выездных сотрудников",
    "Сервисы заказа, записи и доставки",
    "Социальные, образовательные и контентные платформы",
    "MVP и новые мобильные продукты",
  ]);
  assert.deepEqual(mobile.payload.integrations, [
    "1С, CRM и ERP",
    "Платёжные системы, СБП и онлайн-кассы",
    "Карты, геолокация и маршруты",
    "Камера, файлы, push-уведомления и внешние API",
  ]);
  assert.deepEqual(
    mobile.faq.slice(0, 5).map(item => item.question),
    [
      "Когда бизнесу нужно мобильное приложение?",
      "Сколько стоит разработка мобильного приложения?",
      "Что выбрать: мобильное приложение, адаптивный сайт, PWA или Telegram Mini App?",
      "Можно ли одновременно выпустить приложение для iOS и Android?",
      "Нативная или кроссплатформенная разработка — что выбрать?",
    ],
  );
  assert.equal(mobile.faq.length, 10);
});

test("integration source positions the service as an end-to-end digital contour", async () => {
  const sources = await loadCommercialServiceSources();
  const integrations = sources.find(source => source.slug === "integrations");
  assert.ok(integrations);
  assert.equal(integrations.payload.h1, "Интеграция 1С, CRM, ERP и других корпоративных систем");
  assert.match(integrations.seoTitle, /интеграц.+1С.+Битрикс24.+под ключ/i);
  assert.match(integrations.seoDescription, /CRM.+ERP.+сайт.+един.+цифров.+контур/i);
  assert.match(String(integrations.bodyMd), /не заставляем бизнес отказываться от привычных программ/i);
  assert.deepEqual(
    (integrations.payload.readiness as Array<{ title: string }>).map(item => item.title),
    [
      "Программы работают отдельно",
      "Процесс разрывается между системами",
      "Нет сквозной картины заказа",
      "Подразделения видят разные данные",
      "Информация передаётся вручную",
      "Новую систему сложно встроить",
    ],
  );
  assert.deepEqual(
    (integrations.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "Полная цепочка заказа",
      "Автоматическая передача данных",
      "Единые статусы для подразделений",
      "Меньше повторного ввода и ошибок",
      "Сквозная аналитика",
      "Рост без расширения ручных операций",
    ],
  );
  assert.deepEqual(integrations.payload.automationExamples, [
    "1С и CRM",
    "1С и сайт или интернет-магазин",
    "CRM, телефония, почта и мессенджеры",
    "Банки, платёжные системы и онлайн-кассы",
    "ЭДО, Диадок, СБИС и документооборот",
    "ERP, MES, WMS, маркетплейсы и логистика",
  ]);
  assert.deepEqual(integrations.payload.integrations, [
    "1С и учётные системы",
    "CRM и Битрикс24",
    "ERP, MES и WMS",
    "Сайты, интернет-магазины и маркетплейсы",
    "Телефония, банки и ЭДО",
    "Логистика и внешние API",
  ]);
  assert.deepEqual(
    integrations.faq.slice(0, 5).map(item => item.question),
    [
      "Когда компании нужна интеграция систем?",
      "Сколько стоит интеграция 1С и Битрикс24?",
      "Можно ли связать 1С, CRM, ERP и сайт в одну систему?",
      "Какие данные можно синхронизировать между 1С и CRM?",
      "Нужно ли заменять уже используемые программы?",
    ],
  );
  assert.equal(integrations.faq.length, 9);
});

test("AI automation source prioritizes measurable processes, real data and human control", async () => {
  const sources = await loadCommercialServiceSources();
  const ai = sources.find(source => source.slug === "ai-automation");
  assert.ok(ai);
  assert.equal(ai.payload.h1, "Внедрение ИИ в бизнес-процессы");
  assert.match(ai.seoTitle, /внедрен.+ИИ.+бизнес.+под ключ/i);
  assert.match(ai.seoDescription, /AI-автоматизац.+ассистент.+документ.+баз.+знаний.+1С.+CRM/i);
  assert.match(String(ai.bodyMd), /не начинаем с выбора нейросети/i);
  assert.match(String(ai.bodyMd), /критичн.+действия.+подтверждает человек/i);
  assert.deepEqual(
    (ai.payload.readiness as Array<{ title: string }>).map(item => item.title),
    [
      "Большой поток документов и обращений",
      "Повторяющийся анализ информации",
      "Знания компании сложно найти",
      "Специалисты тратят время на черновики",
      "Качество можно проверить",
      "Процесс должен расти без расширения штата",
    ],
  );
  assert.deepEqual(
    (ai.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "Быстрее обработка информации",
      "Меньше ручной работы",
      "Единое качество ответов",
      "Быстрый доступ к знаниям компании",
      "Контроль сложных и спорных случаев",
      "Масштабирование без пропорционального роста команды",
    ],
  );
  assert.deepEqual(ai.payload.automationExamples, [
    "Обработка документов и извлечение данных",
    "Классификация обращений и подготовка ответов",
    "Корпоративный поиск и база знаний",
    "Анализ звонков и контроль качества",
    "AI-ассистенты для сотрудников",
    "ИИ-агенты с действиями в рабочих системах",
  ]);
  assert.deepEqual(ai.payload.integrations, [
    "1С, CRM и ERP",
    "Базы знаний и корпоративные документы",
    "Почта, телефония и мессенджеры",
    "Helpdesk, сайты и личные кабинеты",
    "Хранилища данных и BI-системы",
    "Внутренние и внешние API",
  ]);
  assert.deepEqual(
    ai.faq.slice(0, 5).map(item => item.question),
    [
      "Когда бизнесу нужна AI-автоматизация?",
      "Сколько стоит внедрение ИИ в бизнес-процессы?",
      "Какие задачи можно передать ИИ?",
      "Как проверить качество AI-решения до внедрения?",
      "Может ли ИИ работать с данными из 1С и CRM?",
    ],
  );
  assert.equal(ai.faq.length, 9);
});

test("support and development source combines rapid incident response with product growth", async () => {
  const sources = await loadCommercialServiceSources();
  const support = sources.find(source => source.slug === "additional-service");
  assert.ok(support);
  assert.equal(support.payload.h1, "Техническая поддержка и развитие сайтов и веб-сервисов");
  assert.match(support.seoTitle, /техническ.+поддержк.+доработк.+сайт.+веб-сервис/i);
  assert.match(support.seoDescription, /развити.+веб-сервис.+WordPress.+вирус.+DDoS/i);
  assert.match(String(support.bodyMd), /быстро подключаемся к критическим проблемам/i);
  assert.match(String(support.bodyMd), /продукт продолжал развиваться и приносить бизнесу деньги/i);
  assert.deepEqual(
    (support.payload.readiness as Array<{ title: string }>).map(item => item.title),
    [
      "Ошибки мешают клиентам и сотрудникам",
      "Критичная проблема требует быстрой реакции",
      "Сайт взломан или находится под атакой",
      "Сервер не справляется с нагрузкой",
      "Продукту нужны новые функции",
      "Нужно принять проект после другой команды",
    ],
  );
  assert.deepEqual(
    (support.payload.benefits as Array<{ title: string }>).map(item => item.title),
    [
      "Быстрое восстановление работы",
      "Защита после инцидента",
      "Снижение расходов на инфраструктуру",
      "Предсказуемые релизы",
      "Развитие продукта и продаж",
      "Одна команда для продукта и инфраструктуры",
    ],
  );
  assert.deepEqual(support.payload.automationExamples, [
    "Экстренное устранение ошибок и аварий",
    "Удаление вирусов и закрытие уязвимостей",
    "Защита от DDoS и аномального трафика",
    "Оптимизация скорости, базы данных и сервера",
    "Новые функции, калькуляторы и личные кабинеты",
    "Техническое SEO и развитие цифрового продукта",
  ]);
  assert.deepEqual(support.payload.solutions, [
    "Выделяем клиенту публичную Kanban-доску, где видны все задачи, их статусы и история движения",
    "Клиент самостоятельно создаёт задачи, задаёт вопросы, отмечает несогласие и помечает проблему как баг",
    "Ежедневно фиксируем выполненную работу и изменения по каждой активной задаче",
    "Каждый понедельник отправляем отчёт и план работ на согласование",
    "Предоставляем MCP-доступ к публичной доске, чтобы через ChatGPT узнавать, что сделано и что находится в работе",
    "Проверяем изменения, показываем результат и выпускаем согласованные обновления контролируемыми релизами",
  ]);
  assert.deepEqual(
    (support.payload.processSteps as Array<{ title: string }>).map(item => item.title),
    [
      "Принимаем проект и проверяем доступы",
      "Переносим задачи на публичную доску",
      "Разделяем инциденты и плановое развитие",
      "Выполняем работу с ежедневным обновлением статусов",
      "Согласовываем отчёт, план и релизы",
    ],
  );
  assert.match(String(support.bodyMd), /публичн.+Kanban-доск/i);
  assert.match(String(support.bodyMd), /MCP.+ChatGPT/i);
  assert.equal(support.payload.priceFrom, 38000);
  assert.equal(support.payload.pricePackageHours, 20);
  assert.equal(support.payload.priceHourlyRate, 1900);
  assert.equal(support.payload.timeRange, "по согласованному SLA");
  assert.deepEqual(support.relatedCases, ["sims-dynasty-tree", "jully-bride", "wowbanner"]);
  assert.deepEqual(
    support.faq.slice(0, 6).map(item => item.question),
    [
      "Что входит в техническую поддержку сайта?",
      "Как быстро вы подключаетесь к критической проблеме?",
      "Вы берёте на поддержку чужой код?",
      "Можно удалить вирус и защитить сайт от повторного взлома?",
      "Как защитить сайт от DDoS-атак и аномального трафика?",
      "Можно одновременно поддерживать и развивать веб-сервис?",
    ],
  );
  assert.deepEqual(
    support.faq.slice(-3).map(item => item.question),
    [
      "Как клиент отслеживает задачи и выполненную работу?",
      "Можно самостоятельно ставить задачи и отмечать баги?",
      "Что даёт MCP-доступ к доске проекта?",
    ],
  );
  assert.equal(support.faq.length, 13);
});

test("commercial service sync publishes researched content and ordered internal links idempotently", async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL must point to dedicated kordev_test");
  await resetTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const sources = await loadCommercialServiceSources();
  const faqCount = sources.reduce((total, source) => total + source.faq.length, 0);

  await db.insert(contentEntries).values(sources.map(source => ({
    kind: "service" as const,
    slug: source.slug,
    title: `Старое название ${source.slug}`,
    seoTitle: "Общий SEO-заголовок",
    seoDescription: "Общее описание.",
    status: "published" as const,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    payload: {},
  })));

  const targets = new Map<string, "case" | "article">();
  for (const source of sources) {
    for (const slug of source.relatedCases) targets.set(slug, "case");
    for (const slug of source.relatedArticles) targets.set(slug, "article");
  }
  await db.insert(contentEntries).values([...targets].map(([slug, kind]) => ({
    kind,
    slug,
    title: slug,
    seoTitle: slug,
    seoDescription: `${slug} description`,
    status: "published" as const,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    payload: {},
  })));

  assert.deepEqual(await applyCommercialServiceSources(db, sources), {
    inserted: faqCount,
    updated: sources.length,
    unchanged: 0,
  });
  const [crm] = await db.select().from(contentEntries).where(and(
    eq(contentEntries.kind, "service"),
    eq(contentEntries.slug, "crm-development"),
  ));
  assert.equal(crm.title, "Разработка CRM-системы на заказ");
  assert.match(crm.seoDescription, /CRM.+бизнес/i);
  assert.equal(crm.version, 2);
  assert.ok(Array.isArray(crm.payload.readiness) && crm.payload.readiness.length >= 6);
  assert.ok(String(crm.bodyMd).length > 300);
  assert.deepEqual(
    (await listPublishedRelations(db, crm.id, "related_case")).map(entry => entry.slug),
    ["krasotula-crm", "wowbanner", "tbi-group-tour-service"],
  );
  assert.equal((await listPublishedRelations(db, crm.id, "related_faq")).length, 10);

  assert.deepEqual(await applyCommercialServiceSources(db, sources), {
    inserted: 0,
    updated: 0,
    unchanged: sources.length + faqCount,
  });
  const [unchangedCrm] = await db.select().from(contentEntries).where(and(
    eq(contentEntries.kind, "service"),
    eq(contentEntries.slug, "crm-development"),
  ));
  assert.equal(unchangedCrm.version, 2);
});
