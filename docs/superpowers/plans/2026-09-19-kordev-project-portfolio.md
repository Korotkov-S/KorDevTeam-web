# Полное портфолио KorDevTeam — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вывести все 26 подтверждённых проектов KorDevTeam на локальном сайте как полноценные SEO-кейсы с безопасным импортом в PostgreSQL, настоящими изображениями и возможностью дальнейшего редактирования через `/admin/`.

**Architecture:** Канонический редакционный набор хранится в отдельных JSON-файлах вне публичной директории и валидируется Zod-схемой. Идемпотентный импортёр преобразует набор в `content_entries`, сохраняет ревизии и публикует записи только в явно разрешённой локальной БД. Коммерческие представления получают структурированные теги и локальные media refs, а `/cases/` остаётся полностью SSR-доступным и добавляет фильтрацию как клиентское улучшение.

**Tech Stack:** TypeScript 5.9, React 18, React Router 7, PostgreSQL, Drizzle ORM, Zod 4, Node test runner, Testing Library, Puppeteer, Sharp, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-09-19-kordev-project-portfolio-design.md`

## Global Constraints

- В объединённом наборе должно быть ровно 26 уникальных проектов.
- Все 26 кейсов после локального импорта имеют статус `published` и видны на `/cases/`.
- До отдельного прямого указания запрещены push, production import и deployment.
- Скрипт записи должен отказать для нелокальной БД без одновременных CLI- и env-разрешений.
- Нельзя публиковать бюджеты, стоимость договоров, домашние адреса, личные email, телефоны, токены, внутренние чаты и сведения, запрещённые NDA.
- Кейс корпоративного аналога Notion остаётся анонимным; названия предполагаемых конечных заказчиков не выводятся.
- Числа и результаты используются только при наличии подтверждения в переданных источниках.
- Каждый кейс получает уникальные slug, H1, SEO title и SEO description.
- Для каждого кейса нужна минимум одна локальная обложка; интерфейсные галереи добавляются только из безопасных реальных материалов.
- Без JavaScript каталог показывает все карточки и рабочие ссылки.
- Существующие публичные slug сохраняются либо получают один точечный 301 без цепочек.
- Все изменения фиксируются локальными коммитами; рабочее дерево пользователя и несвязанные изменения не затрагиваются.

## Review Focus

1. **Legacy-коллизии slug:** старый опубликованный кейс с другим slug должен быть переименован без дубликата и получить точный redirect — покрывается Task 6 и Task 10.
2. **Повторный импорт после ручной правки в админке:** импорт должен обнаружить расхождение версии и остановиться, а не затереть правку — покрывается Task 6.
3. **Утечка чувствительных данных через Markdown или alt:** валидатор проверяет весь сериализованный публичный документ, а служебный evidence никогда не попадает в `content_entries` или HTML — покрывается Task 2.
4. **Недоступный сайт проекта:** сбор изображений создаёт честную фирменную обложку без выдуманного интерфейса, остальные проекты продолжают обрабатываться — покрывается Task 7.
5. **Фильтр после гидрации и no-JS:** JavaScript скрывает только невыбранные карточки, а SSR содержит все 26 ссылок — покрывается Task 9 и Task 11.

---

### Task 1: Расширить контракт структурированного кейса

**Files:**
- Modify: `src/server/content/types.ts`
- Modify: `src/server/content/commercialPresentation.ts`
- Modify: `src/server/content/commercialPresentation.test.ts`
- Modify: `src/server/content/service.test.ts`

**Interfaces:**
- Consumes: `ContentEntry.payload`, `MediaPresentationMap`, `ResolvedMediaAsset`.
- Produces: `CaseMediaRef`, расширенный case payload и корректные `caseCard()` / `commercialCasePage()`.

- [ ] **Step 1: Написать падающие тесты контракта и представления**

Добавить проверки строкового UUID media ref, локального объекта изображения, тегов, технологий, функций и ссылок:

```ts
const localCover = {
  src: "/projects/portfolio/serviceplus/cover.webp",
  alt: "Мобильное приложение ServicePlus для осмотра техники",
  width: 1600,
  height: 1000,
};

test("case payload accepts structured local media and commercial fields", () => {
  const command = parseContentCommand({
    kind: "case",
    slug: "serviceplus",
    title: "ServicePlus",
    seoTitle: "ServicePlus — мобильное приложение для осмотра техники",
    seoDescription: "Кейс разработки приложения ServicePlus.",
    payload: {
      h1: "ServicePlus: мобильное приложение для осмотра техники",
      technologies: ["React Native", "Node.js", "PostgreSQL"],
      features: ["Работа по VIN", "Фотофиксация", "Офлайн-режим"],
      tags: ["Мобильные приложения", "Автоматизация"],
      screenshots: [localCover],
      demoUrl: "https://servicplus.ru/",
    },
  });
  assert.deepEqual(command.payload.screenshots, [localCover]);
});

test("case presentation resolves local media without S3 records", () => {
  const view = commercialCasePage(caseFixture({
    h1: "ServicePlus",
    technologies: ["React Native"],
    features: ["Фотофиксация"],
    tags: ["Мобильные приложения"],
    screenshots: [localCover],
    demoUrl: "https://servicplus.ru/",
  }));
  assert.equal(view.screenshots[0].src, localCover.src);
  assert.equal(view.screenshots[0].width, 1600);
  assert.deepEqual(view.technologies, ["React Native"]);
  assert.deepEqual(view.features, ["Фотофиксация"]);
  assert.equal(view.demoUrl, "https://servicplus.ru/");
});
```

- [ ] **Step 2: Запустить тесты и подтвердить ожидаемое падение**

Run: `yarn tsx --test src/server/content/commercialPresentation.test.ts src/server/content/service.test.ts`

Expected: FAIL, потому что case schema пока отклоняет новые поля, а `asset()` не понимает объект локального изображения.

- [ ] **Step 3: Реализовать схему media ref и case payload**

В `types.ts` добавить:

```ts
const staticCaseImage = z.strictObject({
  src: z.string().regex(/^\/projects\/portfolio\/[a-z0-9-]+\/[a-z0-9-]+\.(?:webp|png|jpe?g)$/),
  alt: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const caseMediaRef = z.union([z.uuid(), staticCaseImage]);

export const casePayload = z.strictObject({
  h1: z.string().optional(),
  problem: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  solution: z.string().optional(),
  architecture: z.string().optional(),
  integrations: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  stages: z.array(block).optional(),
  team: z.array(z.string()).optional(),
  screenshots: z.array(caseMediaRef).optional(),
  results: z.array(block).optional(),
  testimonial: z.string().optional(),
  tags: z.array(z.string()).optional(),
  demoUrl: z.url().optional(),
  githubUrl: z.url().optional(),
  cta: cta.optional(),
});
```

В `commercialPresentation.ts` разделить разрешение UUID и локального объекта. Локальный объект преобразовать в `ResolvedMediaAsset` с пустым `srcSet`, фиксированными размерами и `sizes: "(max-width: 768px) 100vw, 960px"`. `caseCard()` возвращает `tags`, сначала выбирает первый screenshot, затем `ogMediaId`, затем legacy image. `commercialCasePage()` предпочитает структурированные `technologies`, `features`, `demoUrl` и `githubUrl`, сохраняя legacy fallback.

- [ ] **Step 4: Запустить узкие тесты**

Run: `yarn tsx --test src/server/content/commercialPresentation.test.ts src/server/content/service.test.ts`

Expected: PASS.

- [ ] **Step 5: Зафиксировать контракт**

```bash
git add src/server/content/types.ts src/server/content/commercialPresentation.ts src/server/content/commercialPresentation.test.ts src/server/content/service.test.ts
git commit -m "feat(portfolio): extend structured case content"
```

### Task 2: Добавить каноническую схему и валидатор портфеля

**Files:**
- Create: `src/server/portfolio/schema.ts`
- Create: `src/server/portfolio/loader.ts`
- Create: `scripts/validate-project-portfolio.ts`
- Create: `tests/portfolio/portfolioSource.test.ts`
- Create: `content/portfolio/cases/.gitkeep`
- Modify: `package.json`

**Interfaces:**
- Consumes: расширенный case payload из Task 1 и JSON-файлы `content/portfolio/cases/*.json`.
- Produces: `PortfolioCaseSource`, `loadPortfolioSources(root?)`, `validatePortfolioSources(records)` и `toPortfolioCommand(record)`.

- [ ] **Step 1: Написать тесты загрузчика, приватности и уникальности**

```ts
test("loader reads sorted JSON records from a bounded fixture directory", async () => {
  const root = await fixturePortfolioDirectory([sourceFixture({ slug: "beta" }), sourceFixture({ slug: "alpha" })]);
  const records = await loadPortfolioSources(root);
  assert.deepEqual(records.map(record => record.slug), ["alpha", "beta"]);
});

test("portfolio validation rejects duplicate slugs and SEO metadata", () => {
  const one = sourceFixture({ slug: "one", seoTitle: "Одинаковый title" });
  const two = sourceFixture({ slug: "one", seoTitle: "Одинаковый title" });
  assert.throws(() => validatePortfolioSources([one, two]), /portfolio_duplicate/);
});

test("public case material rejects contact, budget, token and NDA leakage", () => {
  const unsafe = sourceFixture({
    bodyMd: "Бюджет 300 000 ₽, finance@example.ru, +7 999 123-45-67",
  });
  assert.throws(() => validatePortfolioSources([unsafe]), /portfolio_private_data/);
});

test("NDA case cannot name protected organizations", () => {
  const unsafe = sourceFixture({
    slug: "notion-analog",
    bodyMd: "Платформа для Газпромнефти",
  });
  assert.throws(() => validatePortfolioSources([unsafe]), /portfolio_nda_violation/);
});
```

- [ ] **Step 2: Запустить тест и подтвердить отсутствие модулей**

Run: `yarn tsx --test tests/portfolio/portfolioSource.test.ts`

Expected: FAIL с `ERR_MODULE_NOT_FOUND` для `src/server/portfolio/loader.ts`.

- [ ] **Step 3: Реализовать редакционную схему**

Использовать строгую структуру:

```ts
export const portfolioCategory = z.enum([
  "automation", "crm", "mobile", "web-service", "commerce", "support", "own-product",
]);

export const evidence = z.strictObject({
  kind: z.enum(["google-doc", "google-sheet", "yougile", "public-url", "repository"]),
  locator: z.string().trim().min(1),
  supports: z.array(z.enum(["scope", "feature", "technology", "result", "identity", "media"])).min(1),
});

export const portfolioCaseSource = z.strictObject({
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  legacySlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  bodyMd: z.string(),
  seoTitle: z.string().trim().min(1).max(180),
  seoDescription: z.string().trim().min(1).max(320),
  indexable: z.boolean(),
  categories: z.array(portfolioCategory).min(1),
  payload: casePayload,
  evidence: z.array(evidence).min(1),
});
```

`loadPortfolioSources()` читает только обычные `.json`-файлы непосредственно из `content/portfolio/cases`, сортирует по slug и запрещает symlink/выход за корень. `toPortfolioCommand()` возвращает только публичные поля и никогда не переносит `evidence` или `legacySlugs` в `content_entries`.

Проверка приватности применяется к `JSON.stringify(toPortfolioCommand(record))`, а не к evidence. Запрещённые шаблоны: российские телефоны, email кроме `team@korotkov.dev`, `kus_live_`, `api[_-]?key`, `token`, денежные суммы рядом с `₽`, `руб` или `бюджет`. Для `notion-analog` дополнительно запрещены названия конечных заказчиков из исходного внутреннего текста.

- [ ] **Step 4: Добавить CLI валидации**

Добавить `scripts/validate-project-portfolio.ts`, который печатает JSON:

```json
{"ok":true,"count":26,"slugs":["21-century-crm","alliance-stroy-garant"]}
```

В `package.json` добавить `"portfolio:validate": "tsx scripts/validate-project-portfolio.ts"`.

- [ ] **Step 5: Запустить тесты схемы**

Run: `yarn tsx --test tests/portfolio/portfolioSource.test.ts`

Expected: PASS на временных fixture-файлах.

- [ ] **Step 6: Зафиксировать инфраструктуру валидатора**

```bash
git add package.json src/server/portfolio/schema.ts src/server/portfolio/loader.ts scripts/validate-project-portfolio.ts tests/portfolio/portfolioSource.test.ts content/portfolio/cases/.gitkeep
git commit -m "feat(portfolio): add source schema and validator"
```

### Task 3: Подготовить девять веб- и support-кейсов

**Files:**
- Create: `content/portfolio/cases/alliance-stroy-garant.json`
- Create: `content/portfolio/cases/stroyrem.json`
- Create: `content/portfolio/cases/sims-dynasty-tree.json`
- Create: `content/portfolio/cases/siberian-steel.json`
- Create: `content/portfolio/cases/wowbanner.json`
- Create: `content/portfolio/cases/sgormash.json`
- Create: `content/portfolio/cases/inplain.json`
- Create: `content/portfolio/cases/jully-bride.json`
- Create: `content/portfolio/cases/nagrada.json`
- Test: `tests/portfolio/portfolioSource.test.ts`

**Interfaces:**
- Consumes: `PortfolioCaseSource` из Task 2 и факты Google Sheet/Doc/repository.
- Produces: 9 валидных редакционных записей.

- [ ] **Step 1: Зафиксировать ожидаемый состав партии**

Добавить тест:

```ts
test("web and support portfolio batch is complete", async () => {
  const slugs = new Set((await loadPortfolioSources()).map(record => record.slug));
  for (const slug of [
    "alliance-stroy-garant", "stroyrem", "sims-dynasty-tree", "siberian-steel",
    "wowbanner", "sgormash", "inplain", "jully-bride", "nagrada",
  ]) assert.ok(slugs.has(slug), slug);
});
```

- [ ] **Step 2: Написать девять JSON-кейсов**

Каждый файл заполняется полностью по структуре спецификации. Редакционные акценты:

| slug | Основная задача | Подтверждённый результат/эффект | Технологии |
|---|---|---|---|
| `alliance-stroy-garant` | Корпоративный сайт строительной компании | Исследование, несколько концепций, проверка на фокус-группе, запуск и метрики | Node.js, Next.js |
| `stroyrem` | Развитие B2C/B2B интернет-магазина | Бэкапы, регулярные релизы, улучшение checkout, загрузка примерно на 30% быстрее | PHP, JavaScript |
| `sims-dynasty-tree` | Сервис сложных семейных древ The Sims | Продукт запущен и продолжает приносить доход; реализована графовая модель | Node.js, Next.js, PostgreSQL |
| `siberian-steel` | Переработка унаследованного интернет-магазина | Выполнена часть переработки и личный кабинет; проект затем заморожен клиентом | PHP, React |
| `wowbanner` | Развитие CRM и калькуляторов | Исправлены ошибки и создано направление новой CRM как отдельного продукта | PHP, JavaScript |
| `sgormash` | SEO- и маркетинговые доработки legacy-сайта | Сайт адаптирован под требования SEO на неподдерживаемом движке | PHP, Angular |
| `inplain` | Проект с ограниченной доказательной базой | Публикуются только факты, подтверждённые публичным сайтом и YouGile | Только подтверждённый стек |
| `jully-bride` | Восстановление и оптимизация пяти WordPress-сайтов | Устранены последствия вирусов/DDoS; запросы к БД сокращены примерно с 1500 до 16 | WordPress, PHP, MySQL |
| `nagrada` | Поддержка сайта наградной продукции | Стабильная поддержка и создание новых функций | 1С-Битрикс, PHP |

Для каждого файла обязательны `problem`, `solution`, минимум 3 `features`, минимум 2 `stages`, `team`, `results`, `tags` и evidence. Для остановленных проектов результат описывает выполненный объём, а не коммерческий успех клиента.

- [ ] **Step 3: Запустить тест партии**

Run: `yarn tsx --test tests/portfolio/portfolioSource.test.ts`

Expected: PASS; тест партии находит все 9 slug, а общая проверка 26 записей ещё не добавлена.

- [ ] **Step 4: Зафиксировать первую контентную партию**

```bash
git add content/portfolio/cases tests/portfolio/portfolioSource.test.ts
git commit -m "content(portfolio): add web and support cases"
```

### Task 4: Подготовить девять продуктовых и мобильных кейсов

**Files:**
- Create: `content/portfolio/cases/noodome.json`
- Create: `content/portfolio/cases/harmonize-me.json`
- Create: `content/portfolio/cases/lo-social-platform.json`
- Create: `content/portfolio/cases/eventor.json`
- Create: `content/portfolio/cases/dom-krugom.json`
- Create: `content/portfolio/cases/serviceplus.json`
- Create: `content/portfolio/cases/nisli.json`
- Create: `content/portfolio/cases/amch.json`
- Create: `content/portfolio/cases/stone-product-calculator.json`
- Test: `tests/portfolio/portfolioSource.test.ts`

**Interfaces:**
- Consumes: schema Task 2, Google Sheet/Doc, публичные App Store/site страницы и YouGile.
- Produces: ещё 9 валидных записей, всего 18.

- [ ] **Step 1: Зафиксировать состав продуктовой партии**

```ts
test("product and mobile portfolio batch is complete", async () => {
  const slugs = new Set((await loadPortfolioSources()).map(record => record.slug));
  for (const slug of [
    "noodome", "harmonize-me", "lo-social-platform", "eventor", "dom-krugom",
    "serviceplus", "nisli", "amch", "stone-product-calculator",
  ]) assert.ok(slugs.has(slug), slug);
});
```

- [ ] **Step 2: Написать девять JSON-кейсов**

| slug | Основная задача | Подтверждённый результат/эффект | Технологии |
|---|---|---|---|
| `noodome` | Мобильная платформа бизнес-клуба | Запущены чаты, мероприятия, депозиты и регистрация в клубах | React Native, Node.js |
| `harmonize-me` | Продажа онлайн-курсов и цифровых материалов | Создана международная образовательная платформа с личным кабинетом | Next.js, Node.js, PostgreSQL |
| `lo-social-platform` | Frontend социальной платформы | Публичный продукт развивается; утверждение о 50 000+ пользователей используется только при подтверждении | React Native |
| `eventor` | Обмен заказами в event-индустрии | Приложение поддерживает сделки и комиссионную модель; число пользователей публикуется только при подтверждении | React Native, PHP |
| `dom-krugom` | Исправление и развитие приложения автопутешествий | Устранены критические ошибки, доработана аренда техники, команда участвовала в защите финансирования | React Native |
| `serviceplus` | Осмотр техники и передача данных | VIN/серийные номера, чек-листы, фото, офлайн-синхронизация, отчёты и web-админка | React Native, Node.js, PostgreSQL |
| `nisli` | Desktop-клиент для AI-задач | Создано Windows-приложение управления задачами на сторонних GPU | Electron, Node.js |
| `amch` | Редизайн инвестиционного приложения | Реализовано участие в разработке и новый мобильный интерфейс | React Native, Python |
| `stone-product-calculator` | Визуальный расчёт изделий и сметы | Автоматизированы визуализация, редактирование расчёта и PDF-коммерческое предложение | React, Node.js, PostgreSQL |

Для ServicePlus использовать функции, подтверждённые YouGile: техника, типы и бренды, подразделения, маршруты, сотрудники, права администраторов, Excel-экспорт, фотофиксация и офлайн-синхронизация. Не превращать незакрытые баги доски в публичные преимущества.

- [ ] **Step 3: Запустить тест партии**

Run: `yarn tsx --test tests/portfolio/portfolioSource.test.ts`

Expected: PASS; обе партии содержат 18 валидных уникальных записей.

- [ ] **Step 4: Зафиксировать продуктовую партию**

```bash
git add content/portfolio/cases tests/portfolio/portfolioSource.test.ts
git commit -m "content(portfolio): add product and mobile cases"
```

### Task 5: Подготовить восемь automation-, internal- и own-product-кейсов

**Files:**
- Create: `content/portfolio/cases/21-century-crm.json`
- Create: `content/portfolio/cases/skycreative-random-coffee.json`
- Create: `content/portfolio/cases/twitch-automation-service.json`
- Create: `content/portfolio/cases/notion-analog.json`
- Create: `content/portfolio/cases/krasotula-crm.json`
- Create: `content/portfolio/cases/roost.json`
- Create: `content/portfolio/cases/teharmatura-automation.json`
- Create: `content/portfolio/cases/tbi-group-tour-service.json`
- Test: `tests/portfolio/portfolioSource.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: schema Task 2, договорную справку, карту проектов, YouGile и безопасный обзор Krasotula.
- Produces: полный набор 26 кейсов и зелёный `portfolio:validate`.

- [ ] **Step 1: Зафиксировать состав последней партии**

```ts
test("automation and internal portfolio batch is complete", async () => {
  const slugs = new Set((await loadPortfolioSources()).map(record => record.slug));
  for (const slug of [
    "21-century-crm", "skycreative-random-coffee", "twitch-automation-service",
    "notion-analog", "krasotula-crm", "roost", "teharmatura-automation",
    "tbi-group-tour-service",
  ]) assert.ok(slugs.has(slug), slug);
});
```

- [ ] **Step 2: Написать восемь JSON-кейсов**

| slug | Основная задача | Публичный акцент | Ограничение |
|---|---|---|---|
| `21-century-crm` | Frontend CRM с кабинетами пользователей и сотрудников | Выполненный frontend-объём | Проект остановлен клиентом до завершения |
| `skycreative-random-coffee` | Telegram-бот для знакомств участников бизнес-клуба | Автоматизация регулярных пар | Не выдумывать число участников |
| `twitch-automation-service` | Web-сервис автоматизации операций с Twitch | Выполненный технический объём | Не описывать способы искусственного влияния на метрики платформы |
| `notion-analog` | Корпоративная knowledge/work platform в закрытом контуре | React/Node.js, роль субподрядчика, закрытая установка | Полная анонимизация конечных заказчиков и экранов |
| `krasotula-crm` | CRM для салонов и сервисного бизнеса | Клиенты 360, запись, услуги, задачи, доски, чат, рассылки, автоматизации, магазин, склад, события, аналитика, ИИ-помощник | Только демонстрационные данные; API-токен запрещён |
| `roost` | Управление разработкой через Telegram и VK | Собственный продукт и текущая разработка | Не заявлять готовые результаты без источника |
| `teharmatura-automation` | Автоматизация процессов торгового дома | Битрикс24, 1С, email, OCR, AI, обследование и интеграции | Не публиковать договорную стоимость и контакты |
| `tbi-group-tour-service` | Расчёт и сопровождение туристических групп | Поддержка, развитие функций и SLA по критичности | Не показывать закрытый staging URL и внутренние группы |

- [ ] **Step 3: Запустить полный валидатор**

Перед запуском добавить финальный тест полноты:

```ts
test("portfolio source contains exactly the approved 26 unique cases", async () => {
  const records = await loadPortfolioSources();
  assert.equal(records.length, 26);
  assert.equal(new Set(records.map(record => record.slug)).size, 26);
  assert.equal(new Set(records.map(record => record.seoTitle)).size, 26);
  assert.equal(new Set(records.map(record => record.seoDescription)).size, 26);
});
```

Run: `yarn portfolio:validate`

Expected: PASS и JSON с `count: 26`.

- [ ] **Step 4: Запустить source-тесты**

Run: `yarn tsx --test tests/portfolio/portfolioSource.test.ts`

Expected: PASS.

- [ ] **Step 5: Зафиксировать схему и полный контентный набор**

```bash
git add content/portfolio/cases tests/portfolio/portfolioSource.test.ts
git commit -m "content(portfolio): complete verified 26-case source"
```

### Task 6: Реализовать безопасный идемпотентный импорт в PostgreSQL

**Files:**
- Create: `src/server/portfolio/importer.ts`
- Create: `src/server/portfolio/importer.test.ts`
- Create: `scripts/import-project-portfolio.ts`
- Create: `scripts/import-project-portfolio.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadPortfolioSources()`, `toPortfolioCommand()`, Drizzle `ContentDatabase`.
- Produces: `planPortfolioImport(db, records)`, `applyPortfolioImport(db, plan)`, `assertPortfolioDatabaseAllowed(url, options)` и CLI `portfolio:import`.

- [ ] **Step 1: Написать тесты guard, dry-run, update, revision и idempotency**

```ts
test("database guard permits local PostgreSQL and rejects remote hosts", () => {
  assert.doesNotThrow(() => assertPortfolioDatabaseAllowed(
    "postgres://kordev:kordev@127.0.0.1:5433/kordev", { cliProduction: false, envProduction: false },
  ));
  assert.throws(() => assertPortfolioDatabaseAllowed(
    "postgres://kordev:secret@db.example.com/kordev", { cliProduction: false, envProduction: false },
  ), /portfolio_remote_database_forbidden/);
});

databaseTest("portfolio import updates published entries, writes revision and is idempotent", async ({ db }) => {
  const first = await applyPortfolioImport(db, await planPortfolioImport(db, [sourceFixture()]));
  assert.deepEqual(first, { inserted: 1, updated: 0, unchanged: 0, published: 1 });
  const changed = sourceFixture({ excerpt: "Новое проверенное описание" });
  const second = await applyPortfolioImport(db, await planPortfolioImport(db, [changed]));
  assert.equal(second.updated, 1);
  assert.equal((await db.select().from(contentRevisions)).length, 1);
  const third = await applyPortfolioImport(db, await planPortfolioImport(db, [changed]));
  assert.equal(third.unchanged, 1);
});

databaseTest("stale import plan never overwrites an admin edit", async ({ db }) => {
  await applyPortfolioImport(db, await planPortfolioImport(db, [sourceFixture()]));
  const plan = await planPortfolioImport(db, [sourceFixture({ excerpt: "Изменённый источник" })]);
  await db.update(contentEntries).set({ version: 9 }).where(eq(contentEntries.slug, "serviceplus"));
  await assert.rejects(applyPortfolioImport(db, plan), /portfolio_version_conflict/);
});

databaseTest("legacy slug is renamed instead of creating a duplicate case", async ({ db }) => {
  await db.insert(contentEntries).values({
    kind: "case", slug: "web-site", status: "published", title: "Старый кейс",
  });
  const record = sourceFixture({
    slug: "alliance-stroy-garant",
    legacySlugs: ["web-site"],
  });
  const result = await applyPortfolioImport(db, await planPortfolioImport(db, [record]));
  assert.equal(result.updated, 1);
  assert.equal((await db.select().from(contentEntries).where(eq(contentEntries.kind, "case"))).length, 1);
  assert.equal((await db.select().from(contentEntries))[0].slug, "alliance-stroy-garant");
});
```

- [ ] **Step 2: Запустить тесты и подтвердить падение**

Run: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/portfolio/importer.test.ts scripts/import-project-portfolio.test.ts`

Expected: FAIL из-за отсутствующих модулей.

- [ ] **Step 3: Реализовать планирование и атомарное применение**

`planPortfolioImport()` ищет запись сначала по каноническому slug, затем по `legacySlugs`, и формирует элементы:

```ts
export type PortfolioImportItem = {
  action: "insert" | "update" | "unchanged";
  command: ValidatedContentCommand;
  existingId: string | null;
  expectedVersion: number | null;
  legacySlugs: string[];
};
```

`applyPortfolioImport()` получает advisory lock, заново читает затронутые строки с `FOR UPDATE`, повторно проверяет version, сохраняет snapshot текущей записи в `content_revisions`, обновляет поля и оставляет `status: "published"`. Если найдена ровно одна legacy-запись, она переименовывается в канонический slug вместо вставки дубликата. Одновременное наличие canonical и legacy записей вызывает `portfolio_slug_collision`. Новая запись создаётся как published с `version: 1` и текущим `publishedAt`. Одинаковая команда определяется canonical checksum и не увеличивает version. Вся партия откатывается при любой ошибке.

Guard удалённой БД разрешает запись только когда одновременно заданы `--allow-production` и `KORDEV_ALLOW_PRODUCTION_PORTFOLIO_IMPORT=1`; этот режим не используется в данной работе.

- [ ] **Step 4: Добавить CLI и package scripts**

CLI поддерживает:

```bash
yarn portfolio:import --dry-run
yarn portfolio:import
```

Dry-run печатает actions и checksums без записи. В `package.json` добавить `"portfolio:import": "tsx scripts/import-project-portfolio.ts"`.

- [ ] **Step 5: Запустить тесты импортёра**

Run: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/portfolio/importer.test.ts scripts/import-project-portfolio.test.ts`

Expected: PASS.

- [ ] **Step 6: Зафиксировать импортёр**

```bash
git add package.json src/server/portfolio/importer.ts src/server/portfolio/importer.test.ts scripts/import-project-portfolio.ts scripts/import-project-portfolio.test.ts
git commit -m "feat(portfolio): add guarded local PostgreSQL import"
```

### Task 7: Создать воспроизводимый медиапроцесс

**Files:**
- Create: `content/portfolio/media.json`
- Create: `src/server/portfolio/mediaManifest.ts`
- Create: `scripts/capture-project-media.ts`
- Create: `scripts/capture-project-media.test.ts`
- Create: `tests/assets/portfolioAssets.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: 26 case sources, allowlisted public URLs, Puppeteer и Sharp.
- Produces: `public/projects/portfolio/<slug>/cover.webp`, безопасные gallery images и отчёт захвата.

- [ ] **Step 1: Написать тесты allowlist и fallback-обложки**

```ts
test("media manifest covers every portfolio slug exactly once", async () => {
  const cases = await loadPortfolioSources();
  const media = await loadPortfolioMediaManifest();
  assert.deepEqual(media.map(item => item.slug).sort(), cases.map(item => item.slug).sort());
});

test("capture target rejects private and local network addresses", () => {
  for (const url of ["http://127.0.0.1/admin", "http://10.0.0.8/", "file:///etc/passwd"]) {
    assert.throws(() => validateCaptureUrl(url), /portfolio_capture_url_forbidden/);
  }
});

test("unavailable page produces branded cover without fabricated interface", async () => {
  const result = await renderFallbackCover({ slug: "notion-analog", title: "Корпоративная платформа", category: "CRM и внутренние системы" }, outputDir);
  const metadata = await sharp(result.path).metadata();
  assert.equal(metadata.format, "webp");
  assert.deepEqual([metadata.width, metadata.height], [1600, 1000]);
});
```

- [ ] **Step 2: Запустить тесты и подтвердить падение**

Run: `yarn tsx --test scripts/capture-project-media.test.ts tests/assets/portfolioAssets.test.ts`

Expected: FAIL из-за отсутствующих manifest и script.

- [ ] **Step 3: Создать media manifest**

Каждая запись содержит `slug`, `mode`, `sourceUrl`, `output`, `alt`, `viewport` и необязательный `selector`. Режимы:

- `capture`: Stroyrem, Sims, HarmonizeME, WoWBanner, Sgormash, ServicePlus, Nisli, AMCH, калькулятор камня, Inplain, Jully Bride, Roost, Награда, ТехАрматура;
- `existing`: АльянсСтройГарант, Noodome и Krasotula используют уже разрешённые локальные материалы;
- `fallback`: Сибирская сталь, CRM «21 век», LO, Eventor, ДомКругом, SkyCreative, Twitch, NDA-платформа и TBI Group, если безопасного публичного экрана нет.

App Store страницы могут дать реальное изображение только при успешной загрузке без авторизации. При ошибке используется fallback, а не чужое или выдуманное приложение.

- [ ] **Step 4: Реализовать захват и обработку**

Скрипт:

- запрещает non-http(s), localhost, private IPv4/IPv6 и редирект на них;
- блокирует analytics/ad requests;
- ставит viewport 1440×1000;
- ждёт `networkidle2`, затем максимум 10 секунд ожидает selector;
- делает PNG во временную директорию;
- Sharp кадрирует в 1600×1000 с `fit: "cover"`, сохраняет WebP quality 84;
- для gallery сохраняет исходное соотношение и ограничивает ширину 1920;
- не удаляет хороший существующий файл, пока новая версия полностью не записана;
- печатает JSON-отчёт по каждому slug.

Fallback cover содержит только название, категорию и фирменную геометрию KorDevTeam; он не имитирует интерфейс продукта.

- [ ] **Step 5: Добавить package script и запустить unit-тесты**

В `package.json` добавить `"portfolio:media": "tsx scripts/capture-project-media.ts"`.

Run: `yarn tsx --test scripts/capture-project-media.test.ts tests/assets/portfolioAssets.test.ts`

Expected: тесты логики PASS; asset completeness остаётся красным до Task 8.

- [ ] **Step 6: Зафиксировать медиапроцесс после Task 8, когда asset test станет зелёным**

Не выполнять commit на этом шаге.

### Task 8: Собрать и проверить обложки и галереи

**Files:**
- Create: `public/projects/portfolio/*/cover.webp`
- Create: `public/projects/portfolio/{serviceplus,krasotula-crm,sims-dynasty-tree,jully-bride,stone-product-calculator,noodome,teharmatura-automation}/*.webp`
- Modify: `content/portfolio/cases/*.json`
- Test: `tests/assets/portfolioAssets.test.ts`

**Interfaces:**
- Consumes: media manifest и capture script Task 7.
- Produces: все локальные файлы и заполненные structured screenshots в case payload.

- [ ] **Step 1: Запустить медиасбор**

Run: `yarn portfolio:media`

Expected: отчёт содержит 26 успешных cover outputs; недоступные сайты отмечены `fallback`, а не роняют весь процесс.

- [ ] **Step 2: Визуально проверить реальные capture-источники**

Проверить, что кадры показывают продукт, не содержат cookie overlay, персональные данные, админские токены или случайные чаты. Неудачный кадр переводится в `existing` или `fallback` в manifest и пересобирается.

- [ ] **Step 3: Добавить изображения в payload кейсов**

Формат каждого изображения:

```json
{
  "src": "/projects/portfolio/serviceplus/cover.webp",
  "alt": "Интерфейс приложения ServicePlus для осмотра техники",
  "width": 1600,
  "height": 1000
}
```

Первое изображение служит обложкой карточки. Для семи приоритетных кейсов добавить от двух до пяти безопасных изображений, если реальные материалы доступны.

- [ ] **Step 4: Запустить asset- и source-тесты**

Run: `yarn tsx --test tests/assets/portfolioAssets.test.ts tests/portfolio/portfolioSource.test.ts`

Expected: PASS; каждый путь существует, WebP декодируется, размеры совпадают с payload, alt непустой.

- [ ] **Step 5: Зафиксировать media pipeline и assets**

```bash
git add package.json content/portfolio/media.json content/portfolio/cases src/server/portfolio/mediaManifest.ts scripts/capture-project-media.ts scripts/capture-project-media.test.ts tests/assets/portfolioAssets.test.ts public/projects/portfolio
git commit -m "feat(portfolio): add verified project media"
```

### Task 9: Добавить доступный фильтруемый каталог кейсов

**Files:**
- Modify: `src/pages/CasesPage.tsx`
- Create: `src/pages/CasesPage.test.tsx`
- Modify: `src/components/public/CaseCard.tsx`
- Modify: `src/server/content/types.ts`
- Modify: `src/server/content/commercialPresentation.ts`

**Interfaces:**
- Consumes: `CaseCardView.tags` и 26 опубликованных entries.
- Produces: SSR-first каталог и фильтрацию по семи категориям.

- [ ] **Step 1: Написать тесты no-JS структуры и интерактивного фильтра**

```tsx
test("catalog renders every case link before filtering", () => {
  render(<MemoryRouter><CasesPage projects={caseFixtures(26)} /></MemoryRouter>);
  assert.equal(screen.getAllByRole("article").length, 26);
  assert.equal(screen.getAllByRole("link", { name: /Открыть кейс/ }).length, 26);
});

test("category filter hides unrelated cards and can reset", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><CasesPage projects={caseFixtures(26)} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "Мобильные приложения" }));
  assert.ok(screen.getByRole("article", { name: /ServicePlus/ }));
  assert.equal(screen.queryByRole("article", { name: /Стройрем/ }), null);
  await user.click(screen.getByRole("button", { name: "Все проекты" }));
  assert.equal(screen.getAllByRole("article").length, 26);
});
```

- [ ] **Step 2: Запустить тест и подтвердить падение**

Run: `yarn tsx --test src/pages/CasesPage.test.tsx`

Expected: FAIL, потому что фильтр и article labels отсутствуют.

- [ ] **Step 3: Реализовать фильтр как enhancement**

На первом SSR-рендере `selected = "all"`, поэтому видны все карточки. После нажатия фильтра React выводит подмножество. Кнопки находятся в горизонтально прокручиваемой группе с `aria-pressed`; число результатов объявляется через `aria-live="polite"`. URL и query-параметры не меняются.

`CaseCard` получает `aria-label={project.title}` на article, отображает не более трёх тегов и не использует технологию как основной результат.

- [ ] **Step 4: Запустить unit-тесты каталога**

Run: `yarn tsx --test src/pages/CasesPage.test.tsx src/server/content/commercialPresentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Зафиксировать каталог**

```bash
git add src/pages/CasesPage.tsx src/pages/CasesPage.test.tsx src/components/public/CaseCard.tsx src/server/content/types.ts src/server/content/commercialPresentation.ts
git commit -m "feat(cases): show and filter complete portfolio"
```

### Task 10: Обновить страницы кейсов и legacy redirects

**Files:**
- Modify: `src/pages/CommercialCasePage.tsx`
- Modify: `src/pages/CommercialCasePage.test.tsx`
- Modify: `docs/seo/legacy-url-decisions.md`
- Modify: `public/_redirects`
- Modify: `tests/seo/legacyDecisions.test.ts`

**Interfaces:**
- Consumes: `CommercialCaseView` с structured screenshots, tags, technologies и features.
- Produces: полноценные страницы 26 кейсов и одношаговые legacy redirects.

- [ ] **Step 1: Написать тест галереи и честных неполных кейсов**

```tsx
test("case page renders sized screenshots without inventing empty proof", () => {
  render(<MemoryRouter><CommercialCasePage pathname="/cases/serviceplus/" project={caseView({
    results: [],
    testimonial: null,
    screenshots: [{ id: "local:cover", src: "/projects/portfolio/serviceplus/cover.webp", srcSet: "", sizes: "100vw", alt: "ServicePlus", decorative: false, width: 1600, height: 1000 }],
  })} /></MemoryRouter>);
  const image = screen.getByRole("img", { name: "ServicePlus" });
  assert.equal(image.getAttribute("width"), "1600");
  assert.equal(screen.queryByText("Отзыв клиента"), null);
  assert.equal(screen.queryByText("Подтверждённый эффект"), null);
});
```

- [ ] **Step 2: Запустить тест и подтвердить текущее поведение**

Run: `yarn tsx --test src/pages/CommercialCasePage.test.tsx tests/seo/legacyDecisions.test.ts`

Expected: case test выявляет недостающие gallery semantics или styling; redirect test станет красным после добавления нового списка legacy slug.

- [ ] **Step 3: Улучшить gallery без смены общего дизайна**

Добавить `<figure>`/`<figcaption>` только когда подпись отличается от H1, сохранить width/height, использовать `object-contain` для интерфейсных кадров и нейтральный фон вместо обрезания UI. Первая широкая картинка занимает две колонки; мобильная версия остаётся одной колонкой. Пустые results/testimonial/team не выводятся.

- [ ] **Step 4: Обновить точные решения legacy URL**

Сохранить существующие маршруты:

- `media-entertainment` → `noodome`;
- `web-site` → `alliance-stroy-garant`;
- `web-service` → `sims-dynasty-tree`;
- `harmonize-me`, `stroyrem`, `wowbanner`, `serviceplus`, `amch`, `notion-analog` — на соответствующий канонический кейс.

Добавить решения для legacy ID/имен из старого JSON только после нормализации и проверить, что destination сам не является source другого redirect.

- [ ] **Step 5: Запустить тесты страницы и редиректов**

Run: `yarn tsx --test src/pages/CommercialCasePage.test.tsx tests/seo/legacyDecisions.test.ts`

Expected: PASS.

- [ ] **Step 6: Зафиксировать страницу и redirects**

```bash
git add src/pages/CommercialCasePage.tsx src/pages/CommercialCasePage.test.tsx docs/seo/legacy-url-decisions.md public/_redirects tests/seo/legacyDecisions.test.ts
git commit -m "feat(cases): complete case stories and legacy routes"
```

### Task 11: Доказать локальную публикацию, SSR и SEO всех 26 кейсов

**Files:**
- Create: `tests/portfolio/portfolioImport.integration.test.ts`
- Modify: `tests/ssr/seoParity.test.ts`
- Modify: `tests/seo/crawler.test.ts`
- Modify: `tests/visual/commercial-pages.test.ts`
- Modify: `tests/visual/support/commercialFixtures.ts`
- Modify: `docs/seo/public-route-inventory.md`

**Interfaces:**
- Consumes: importer, catalog/case routes, media files.
- Produces: интеграционные доказательства 26 локально опубликованных страниц.

- [ ] **Step 1: Написать интеграционный тест импорта и каталога**

```ts
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("local portfolio import publishes all 26 cases and every route resolves", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  await resetTestDatabase(process.env.TEST_DATABASE_URL!);
  const sources = await loadPortfolioSources();
  await applyPortfolioImport(db, await planPortfolioImport(db, sources));
  const entries = await db.select().from(contentEntries).where(eq(contentEntries.kind, "case"));
  assert.equal(entries.length, 26);
  assert.ok(entries.every(entry => entry.status === "published"));
  for (const entry of entries) {
    const response = await fetch(`${runtime.origin}/cases/${entry.slug}/`);
    assert.equal(response.status, 200, entry.slug);
    assert.match(await response.text(), new RegExp(`<h1[^>]*>[^<]*${escapeRegex(String(entry.payload.h1))}`));
  }
});
```

- [ ] **Step 2: Расширить SSR/SEO проверки**

Проверить:

- `/cases/` содержит 26 уникальных href при отключённом JavaScript;
- каждый case имеет один H1, canonical, title, description и индексируемый HTML;
- SEO title/description уникальны;
- sitemap содержит 26 case URLs;
- private evidence и запрещённые шаблоны не встречаются в HTML;
- фильтр не создаёт query-based canonical variants.

- [ ] **Step 3: Добавить репрезентативные visual routes**

Добавить в visual suite:

```ts
const portfolioRoutes = [
  "/cases/krasotula-crm/",
  "/cases/serviceplus/",
  "/cases/jully-bride/",
  "/cases/sims-dynasty-tree/",
  "/cases/noodome/",
  "/cases/teharmatura-automation/",
  "/cases/notion-analog/",
];
```

На desktop и mobile проверить один H1, отсутствие horizontal overflow, декодирование изображений, размеры gallery и отсутствие hydration errors.

- [ ] **Step 4: Запустить интеграционные тесты**

Run: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test --test-concurrency=1 tests/portfolio/portfolioImport.integration.test.ts tests/ssr/seoParity.test.ts tests/seo/crawler.test.ts`

Expected: PASS.

- [ ] **Step 5: Запустить визуальные тесты**

Run: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn test:commercial`

Expected: PASS на desktop/mobile и без JavaScript.

- [ ] **Step 6: Обновить SEO inventory и зафиксировать**

```bash
git add tests/portfolio/portfolioImport.integration.test.ts tests/ssr/seoParity.test.ts tests/seo/crawler.test.ts tests/visual/commercial-pages.test.ts tests/visual/support/commercialFixtures.ts docs/seo/public-route-inventory.md
git commit -m "test(portfolio): verify all local case routes"
```

### Task 12: Импортировать в локальную БД и провести финальную приёмку

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-kordev-project-portfolio.md` (отметки выполнения)
- No production files beyond prior tasks.

**Interfaces:**
- Consumes: весь реализованный портфель.
- Produces: локальный сайт с 26 кейсами, доказательства проверок и чистый commit history без push.

- [ ] **Step 1: Проверить dry-run на локальной БД**

Run: `DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn portfolio:import --dry-run`

Expected: `ok: true`, 26 planned entries, без записи.

- [ ] **Step 2: Импортировать все кейсы локально**

Run: `DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn portfolio:import`

Expected: сумма `inserted + updated + unchanged` равна 26, `published` отражает все новые публикации.

- [ ] **Step 3: Повторить импорт и доказать idempotency**

Run: `DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev yarn portfolio:import`

Expected: `inserted: 0`, `updated: 0`, `unchanged: 26`.

- [ ] **Step 4: Запустить полную автоматическую проверку**

Run: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn test`

Run: `yarn typecheck`

Run: `yarn build`

Run: `git diff --check`

Expected: все команды завершаются с exit 0.

- [ ] **Step 5: Поднять локальный runtime и проверить страницы**

Run: `DATABASE_URL=postgresql://kordev:kordev@127.0.0.1:5433/kordev PORT=3001 yarn start`

Проверить `/cases/`, фильтры и семь репрезентативных страниц из Task 11 на desktop/mobile. Убедиться, что форма заявки, тема, навигация и consent продолжают работать.

- [ ] **Step 6: Проверить безопасность release boundary**

Run: `git status --short`

Run: `git log --oneline --max-count=12`

Expected: только ожидаемые изменения и локальные commits. Не выполнять `git push`, deployment или production import.

- [ ] **Step 7: Зафиксировать только итоговые корректировки приёмки**

Если визуальная приёмка потребовала правок, добавить только относящиеся файлы и выполнить:

```bash
git commit -m "fix(portfolio): polish local case presentation"
```

Если правок не было, дополнительный commit не создавать.
