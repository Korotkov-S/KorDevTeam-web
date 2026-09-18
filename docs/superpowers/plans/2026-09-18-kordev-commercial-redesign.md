# Коммерческий редизайн KorDevTeam — план реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ДОПОЛНИТЕЛЬНЫЙ НАВЫК: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, выполняя план задача за задачей. Прогресс отмечается чекбоксами `- [ ]`.

**Цель:** Перевести публичную часть `kordev.team` на утверждённый светлый редакционный дизайн, построить полноценные коммерческие страницы и включать аналитику только после явного согласия.

**Архитектура:** React Router loaders продолжают получать опубликованные записи из PostgreSQL и преобразуют их в узкие публичные view models. Публичные компоненты отвечают только за отображение, consent manager управляет локальным решением пользователя, а единый analytics adapter загружает внешние счётчики и отправляет разрешённые события. Значимый контент всегда присутствует в SSR HTML и не зависит от анимации или клиентского JavaScript.

**Технологии:** React Router 7 Framework Mode, React 18, TypeScript 5.9, Tailwind CSS 4, Motion 12, Drizzle ORM/PostgreSQL, Node test runner, Testing Library, JSDOM, Puppeteer.

**Спецификация:** `docs/superpowers/specs/2026-09-18-kordev-commercial-redesign-design.md`

## Общие ограничения

- Визуальный референс задаёт информационную плотность и редакционный ритм; его код, тексты, графика, логотип и точная композиция не копируются.
- Основная тема светлая, фирменные акценты синий и фиолетовый; существующая тёмная тема остаётся доступной.
- В публичный интерфейс не возвращаются неподтверждённые `95%`, `8 недель` и `83%`.
- Все коммерческие тексты, кейсы и изображения поступают из PostgreSQL и готовой медиатеки; статические компоненты не становятся параллельной CMS.
- Один канонический H1, metadata, canonical, JSON-LD и sitemap-инварианты сохраняются.
- Яндекс.Метрика `105288175` и Top.Mail.Ru `3793508` не скачиваются и не выполняются до согласия.
- Top.Mail.Ru получает только page view; конверсионные события отправляются только в Яндекс.Метрику.
- Значимый SSR-контент не скрывается через opacity, `IntersectionObserver` или animation initial state.
- `prefers-reduced-motion: reduce` отключает движение, но не меняет содержание и компоновку.
- Пуш, production-релиз и применение production-миграций не входят в выполнение этого плана.

## Структура файлов

Новые файлы:

- `src/components/public/PublicHeader.tsx` — desktop/mobile навигация и CTA;
- `src/components/public/PublicFooter.tsx` — навигация, контакты, реквизиты и настройка cookies;
- `src/components/public/Wordmark.tsx` — текстовый знак KorDevTeam;
- `src/components/public/Section.tsx` — контейнер и заголовок секции;
- `src/components/public/CtaLink.tsx` — единый визуальный и аналитический контракт CTA;
- `src/components/public/CaseCard.tsx` — карточка кейса;
- `src/components/public/ServiceCard.tsx` — карточка услуги;
- `src/components/public/ContentCard.tsx` — карточка статьи, журнала или видео;
- `src/components/public/LeadCtaSection.tsx` — форма и альтернативные контакты;
- `src/components/public/ConsentBanner.tsx` — выбор и повторное открытие настроек аналитики;
- `src/components/home/HomeHero.tsx` — первый экран;
- `src/components/home/ProofStrip.tsx` — подтверждённые факты;
- `src/components/home/ProductFeature.tsx` — блок Krasotula CRM;
- `src/components/home/ProcessSteps.tsx` — пять этапов работы;
- `src/pages/ServicePage.tsx` — единый шаблон услуги;
- `src/pages/ServicesPage.tsx` — каталог услуг;
- `src/pages/CasesPage.tsx` — каталог кейсов;
- `src/pages/CommercialCasePage.tsx` — единый шаблон кейса;
- `src/server/content/relations.ts` — чтение опубликованных связей;
- `src/server/content/commercialPresentation.ts` — публичные коммерческие view models;
- `src/lib/consent.ts` — версия и чистая state machine согласия;
- `src/contexts/ConsentContext.tsx` — браузерное состояние согласия;
- `src/lib/analytics.ts` — типизированные события и адаптеры счётчиков;
- `src/components/AnalyticsScripts.tsx` — consent-gated загрузка внешних скриптов;
- `docs/seo/legacy-url-decisions.md` — проверяемая таблица решений для старых URL;
- `tests/visual/commercial-pages.test.ts` — браузерная проверка компоновки.

Изменяемые файлы:

- `src/styles/globals.css`, `src/styles/index.css` — токены, source discovery, базовая типографика и reduced motion;
- `src/contexts/ThemeContext.tsx` — светлая тема по умолчанию с сохранением выбора;
- `src/root.tsx` — новый публичный shell, consent provider и analytics loader;
- `src/routes/home.tsx`, `src/pages/HomePage.tsx` — новая главная и loader contract;
- `src/routes/catalog.tsx`, `src/routes/content-page.tsx`, `src/routes/case.tsx` — новые view models и шаблоны;
- `src/server/content/service.ts`, `src/server/content/types.ts`, `src/server/content/repository.ts` — read API связанного опубликованного контента;
- `src/server/content/presentation.ts` — совместимость и структурированная модель кейса;
- `src/components/LeadForm.tsx` — события формы без изменения intake-контракта;
- `src/routes/legal.tsx`, `src/routes/legacy-project.tsx` — cookie-текст и точечные решения старых URL;
- `src/components/Blog.tsx`, страницы журнала и видео — общий карточный язык;
- `index.html`, `tests/topMailCounter.test.mjs` — удаление безусловного счётчика;
- `tests/ssr/frameworkBoot.test.ts`, `tests/ssr/seoParity.test.ts`, `tests/seo/crawler.test.ts` — новые публичные инварианты;
- `package.json` — сфокусированная команда проверки коммерческих страниц.

---

### Задача 1: Ввести публичные дизайн-токены и примитивы

**Файлы:**

- Создать: `src/components/public/Wordmark.tsx`
- Создать: `src/components/public/Section.tsx`
- Создать: `src/components/public/CtaLink.tsx`
- Создать: `src/components/public/PublicPrimitives.test.tsx`
- Изменить: `src/styles/globals.css`
- Изменить: `src/styles/index.css`
- Изменить: `src/contexts/ThemeContext.tsx`

**Интерфейсы:**

- Производит: `Wordmark`, `Section`, `SectionHeading`, `CtaLink` и семантические CSS-токены.
- Производит: `DEFAULT_THEME === "light"`; сохранённый `light` или `dark` по-прежнему имеет приоритет после hydration.
- Потребляет: текущий `ThemeProvider`, React Router `Link` и Tailwind 4.

- [ ] **Шаг 1: Написать падающие тесты примитивов и светлой темы**

```tsx
test("public primitives expose the wordmark, one heading and accessible CTA", () => {
  render(<MemoryRouter><Section><Wordmark /><SectionHeading eyebrow="Подход" title="Автоматизируем процессы" /><CtaLink to="/services/">Услуги</CtaLink></Section></MemoryRouter>);
  assert.ok(screen.getByText("KorDevTeam"));
  assert.equal(screen.getAllByRole("heading", { level: 2 }).length, 1);
  assert.equal(screen.getByRole("link", { name: "Услуги" }).getAttribute("href"), "/services/");
});

test("the server-safe default theme is light", () => {
  assert.equal(DEFAULT_THEME, "light");
});
```

- [ ] **Шаг 2: Запустить тест и подтвердить ожидаемое падение**

Запустить: `yarn tsx --test src/components/public/PublicPrimitives.test.tsx`

Ожидается: FAIL из-за отсутствующих компонентов и текущего `DEFAULT_THEME = "dark"`.

- [ ] **Шаг 3: Реализовать примитивы и токены**

Обязательные сигнатуры:

```tsx
export function Wordmark({ className = "" }: { className?: string }): React.JSX.Element;
export function Section(props: { id?: string; className?: string; children: React.ReactNode }): React.JSX.Element;
export function SectionHeading(props: { eyebrow?: string; title: string; description?: string; level?: 1 | 2 }): React.JSX.Element;
export function CtaLink(props: { to: string; children: React.ReactNode; variant?: "primary" | "secondary"; eventName?: "service_cta_click" | "project_open" }): React.JSX.Element;
```

Добавить в `:root` семантические токены `--public-surface`, `--public-ink`, `--public-subtle`, `--public-blue`, `--public-violet`, `--public-green`, `--public-orange`, `--public-radius-card` и их значения для `.dark`. Изменить Tailwind discovery:

```css
@source '../components/**/*.tsx';
@source '../routes/**/*.tsx';
@source '../pages/**/*.tsx';
```

Удалить глобальный transition для `*`; оставить переходы только у интерактивных классов. Добавить:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Шаг 4: Проверить тесты и типы**

Запустить: `yarn tsx --test src/components/public/PublicPrimitives.test.tsx && yarn typecheck`

Ожидается: PASS и exit code 0.

- [ ] **Шаг 5: Зафиксировать срез**

```bash
git add src/components/public src/styles/globals.css src/styles/index.css src/contexts/ThemeContext.tsx
git commit -m "feat(design): add public editorial design primitives"
```

---

### Задача 2: Заменить публичный shell, навигацию и футер

**Файлы:**

- Создать: `src/components/public/PublicHeader.tsx`
- Создать: `src/components/public/PublicFooter.tsx`
- Создать: `src/components/public/PublicShell.test.tsx`
- Изменить: `src/root.tsx`
- Изменить: `src/components/ThemeToggle.tsx`

**Интерфейсы:**

- Потребляет: `Wordmark`, `CtaLink`, `ThemeToggle` из задачи 1.
- Производит: `PublicHeader`, `PublicFooter` и событие `kordev:open-consent-settings` из ссылки «Настройки cookies».
- Сохраняет: admin layout не оборачивается публичным shell.

- [ ] **Шаг 1: Написать падающие тесты навигации**

```tsx
test("public shell exposes canonical navigation and restores focus after closing the mobile menu", () => {
  render(<MemoryRouter><PublicHeader /></MemoryRouter>);
  assert.equal(screen.getByRole("link", { name: "Услуги" }).getAttribute("href"), "/services/");
  assert.equal(screen.getByRole("link", { name: "Кейсы" }).getAttribute("href"), "/cases/");
  const trigger = screen.getByRole("button", { name: "Открыть меню" });
  fireEvent.click(trigger);
  assert.equal(screen.getByRole("navigation", { name: "Мобильная навигация" }).getAttribute("aria-modal"), "true");
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(document.activeElement, trigger);
});

test("footer opens consent settings without navigating", () => {
  let opened = 0;
  window.addEventListener("kordev:open-consent-settings", () => { opened += 1; }, { once: true });
  render(<MemoryRouter><PublicFooter /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Настройки cookies" }));
  assert.equal(opened, 1);
});
```

- [ ] **Шаг 2: Подтвердить падение тестов**

Запустить: `yarn tsx --test src/components/public/PublicShell.test.tsx`

Ожидается: FAIL с отсутствующими экспортами.

- [ ] **Шаг 3: Реализовать shell**

Навигационные ссылки фиксируются одним массивом:

```ts
export const PUBLIC_NAV_ITEMS = [
  { label: "Услуги", to: "/services/" },
  { label: "Кейсы", to: "/cases/" },
  { label: "Блог", to: "/blog/" },
  { label: "Журнал", to: "/journal/" },
  { label: "Контакты", to: "/#contact" },
] as const;
```

Мобильная панель должна управлять `aria-expanded`, закрываться по `Escape`, удерживать `Tab` между первым и последним focusable-элементом, блокировать scroll через cleanup effect и возвращать фокус кнопке. В `root.tsx` заменить `Header`, `Footer`, фоновые blob-слои и `FloatingButtons` на:

```tsx
<PublicHeader />
<main id="main-content"><Outlet /></main>
<PublicFooter />
```

В задаче 8 этот shell будет обёрнут в `ConsentProvider` и дополнен `ConsentBanner`, а в задаче 9 — `AnalyticsScripts`. Admin-ветка остаётся ранним `return <Outlet />`.

- [ ] **Шаг 4: Запустить сфокусированные тесты и SSR smoke**

Запустить: `yarn tsx --test src/components/public/PublicShell.test.tsx tests/ssr/frameworkBoot.test.ts`

Ожидается: PASS; `/admin/*` не содержит публичную навигацию.

- [ ] **Шаг 5: Зафиксировать срез**

```bash
git add src/components/public/PublicHeader.tsx src/components/public/PublicFooter.tsx src/components/public/PublicShell.test.tsx src/root.tsx src/components/ThemeToggle.tsx
git commit -m "feat(design): replace public site shell"
```

---

### Задача 3: Добавить read API связанного контента и коммерческие view models

**Файлы:**

- Создать: `src/server/content/relations.ts`
- Создать: `src/server/content/relations.test.ts`
- Создать: `src/server/content/commercialPresentation.ts`
- Создать: `src/server/content/commercialPresentation.test.ts`
- Изменить: `src/server/content/types.ts`
- Изменить: `src/server/content/service.ts`
- Изменить: `src/server/content/repository.ts`

**Интерфейсы:**

- Производит: `listPublishedRelations(sourceId, type): Promise<ContentEntry[]>`.
- Производит: `serviceCard`, `servicePage`, `caseCard`, `commercialCasePage`, `contentCard`.
- Потребляет: `ContentEntry`, `contentRelations`, `media presentation maps` и только опубликованные target entries.

- [ ] **Шаг 1: Написать падающий PostgreSQL-тест связей**

```ts
databaseTest("published relations keep sort order and exclude drafts", async ({ db }) => {
  const service = createContentService(db);
  const source = await publishedEntry(db, "service", "integrations");
  const first = await publishedEntry(db, "case", "first-case");
  const draft = await draftEntry(db, "case", "draft-case");
  await db.insert(contentRelations).values([
    { sourceId: source.id, targetId: draft.id, type: "related_case", sortOrder: 0 },
    { sourceId: source.id, targetId: first.id, type: "related_case", sortOrder: 1 },
  ]);
  assert.deepEqual((await service.listPublishedRelations(source.id, "related_case")).map(entry => entry.slug), ["first-case"]);
});
```

- [ ] **Шаг 2: Написать падающие чистые тесты view models**

```ts
test("service presentation omits empty optional blocks and preserves confirmed payload", () => {
  const view = servicePage(serviceFixture({ priceFrom: null, results: [] }), {}, [], [], []);
  assert.equal(view.price, null);
  assert.deepEqual(view.results, []);
  assert.equal(view.h1, "Интеграция и автоматизация бизнеса");
});

test("case card never invents an impact metric", () => {
  const view = caseCard(caseFixture({ results: [] }), {});
  assert.equal(view.result, null);
  assert.doesNotMatch(JSON.stringify(view), /95%|8 недель|83%/);
});
```

- [ ] **Шаг 3: Подтвердить падение тестов**

Запустить: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/content/relations.test.ts src/server/content/commercialPresentation.test.ts`

Ожидается: FAIL из-за отсутствующих методов и типов.

- [ ] **Шаг 4: Реализовать API и типы представления**

Добавить тип relation:

```ts
export type RelationType = "related_case" | "related_article" | "related_faq" | "related_service";
```

Репозиторий выполняет `innerJoin(contentEntries, eq(contentRelations.targetId, contentEntries.id))`, фильтрует `sourceId`, `type` и `status = "published"`, сортирует `sortOrder`, затем `updatedAt`. Service кеширует результат ключом `relations:${sourceId}:${type}`.

Зафиксировать публичные типы:

```ts
export type ServiceCardView = { slug: string; title: string; summary: string; priority: boolean };
export type CaseCardView = { slug: string; title: string; summary: string; result: string | null; image: ResolvedMediaAsset | null; tags: string[] };
export type FaqView = { question: string; answer: string };
export type ServicePageView = { h1: string; lead: string; bodyMd: string; problems: string[]; solutions: string[]; integrations: string[]; technologies: string[]; processSteps: BlockView[]; price: { from: number | null; factors: string[]; timeRange: string | null } | null; results: BlockView[]; guarantees: BlockView[]; relatedCases: CaseCardView[]; relatedArticles: ContentCardView[]; faq: FaqView[]; cta: CtaView };
export type CommercialCaseView = { slug: string; h1: string; summary: string; problem: string | null; constraints: string[]; solution: string | null; architecture: string | null; integrations: string[]; stages: BlockView[]; team: string[]; screenshots: ResolvedMediaAsset[]; results: BlockView[]; testimonial: string | null; bodyMd: string; relatedServices: ServiceCardView[]; relatedCases: CaseCardView[]; cta: CtaView };
```

Пустые и whitespace-only строки нормализуются в `null` или исключаются из массива. Цена не создаётся, если `priceFrom`, `priceFactors` и `timeRange` отсутствуют.

- [ ] **Шаг 5: Проверить тесты и typecheck**

Запустить: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn tsx --test src/server/content/relations.test.ts src/server/content/commercialPresentation.test.ts && yarn typecheck`

Ожидается: PASS.

- [ ] **Шаг 6: Зафиксировать срез**

```bash
git add src/server/content
git commit -m "feat(content): add commercial presentation models"
```

---

### Задача 4: Перестроить главную страницу

**Файлы:**

- Создать: `src/components/home/HomeHero.tsx`
- Создать: `src/components/home/ProofStrip.tsx`
- Создать: `src/components/home/ProductFeature.tsx`
- Создать: `src/components/home/ProcessSteps.tsx`
- Создать: `src/components/public/CaseCard.tsx`
- Создать: `src/components/public/ServiceCard.tsx`
- Создать: `src/components/public/ContentCard.tsx`
- Создать: `src/components/public/LeadCtaSection.tsx`
- Создать: `src/pages/HomePage.test.tsx`
- Изменить: `src/pages/HomePage.tsx`
- Изменить: `src/routes/home.tsx`
- Изменить: `tests/ssr/frameworkBoot.test.ts`

**Интерфейсы:**

- Потребляет: view models задачи 3, `LeadForm`, `Section`, `CaseCard`, `ServiceCard`, `ContentCard`.
- Производит: SSR-секции `home-hero`, `proof`, `cases`, `services`, `krasotula`, `process`, `insights`, `contact`.
- Сохраняет: один H1 и действующий lead intake contract.

- [ ] **Шаг 1: Написать падающий компонентный тест структуры**

```tsx
test("home renders the editorial commercial sequence without unverified metrics", () => {
  render(<MemoryRouter><HomePage services={serviceViews} projects={caseViews} posts={contentViews} /></MemoryRouter>);
  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
  for (const label of ["Смотреть кейсы", "Обсудить проект", "Интеграция и автоматизация бизнеса", "Krasotula CRM", "Отправить заявку"]) {
    assert.ok(screen.getByText(label, { exact: false }));
  }
  assert.doesNotMatch(document.body.textContent ?? "", /95%|8 недель|83%/);
});
```

- [ ] **Шаг 2: Расширить SSR-тест до реализации**

В `tests/ssr/frameworkBoot.test.ts` потребовать один H1, форму и непустые секции:

```ts
for (const id of ["home-hero", "cases", "services", "krasotula", "process", "contact"]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.doesNotMatch(html, /95%|8 недель|83%/);
```

- [ ] **Шаг 3: Запустить тесты и подтвердить падение**

Запустить: `yarn tsx --test src/pages/HomePage.test.tsx tests/ssr/frameworkBoot.test.ts`

Ожидается: FAIL на старой композиции.

- [ ] **Шаг 4: Реализовать loader и новую композицию**

Loader параллельно получает опубликованные `service`, `case`, `article` записи и media maps. Приоритет услуг задаётся стабильным списком slug:

```ts
export const PRIORITY_SERVICE_SLUGS = [
  "business-process-automation",
  "web-services",
  "mobile-app-development",
] as const;
```

Главная не использует `min-h-screen`, случайные частицы или `initial={{ opacity: 0 }}` для содержательных блоков. Допустимый motion применяется только к transform дочернего изображения на hover и отключается через `MotionConfig`.

`LeadCtaSection` принимает:

```ts
type LeadCtaSectionProps = { pagePath: string; title?: string; description?: string };
```

и всегда выводит `LeadForm`, `team@korotkov.dev`, Telegram, «Ответим в течение рабочего дня» и «Пн–Пт, 09:00–18:00 по Москве».

- [ ] **Шаг 5: Проверить главную локально**

Запустить: `yarn tsx --test src/pages/HomePage.test.tsx tests/ssr/frameworkBoot.test.ts && yarn typecheck`

Ожидается: PASS, один H1 и отсутствие неподтверждённых метрик.

- [ ] **Шаг 6: Зафиксировать срез**

```bash
git add src/components/home src/components/public src/pages/HomePage.tsx src/pages/HomePage.test.tsx src/routes/home.tsx tests/ssr/frameworkBoot.test.ts
git commit -m "feat(home): build editorial commercial homepage"
```

---

### Задача 5: Создать каталог и единый шаблон услуг

**Файлы:**

- Создать: `src/pages/ServicesPage.tsx`
- Создать: `src/pages/ServicePage.tsx`
- Создать: `src/pages/ServicePage.test.tsx`
- Создать: `src/components/public/FaqList.tsx`
- Изменить: `src/routes/catalog.tsx`
- Изменить: `src/routes/content-page.tsx`
- Изменить: `tests/ssr/seoParity.test.ts`

**Интерфейсы:**

- Потребляет: `ServiceCardView`, `ServicePageView`, `listPublishedRelations`, `LeadCtaSection`, `FaqList`.
- Производит: полностью SSR-каталог `/services/` и шесть route-compatible detail pages.
- Сохраняет: fallback для обычной `page` записи на `/:slug/`.

- [ ] **Шаг 1: Написать падающие тесты шаблона**

```tsx
test("service page renders only populated commercial blocks", () => {
  render(<MemoryRouter><ServicePage pathname="/services/integrations/" service={serviceView({ faq: [], relatedArticles: [] })} /></MemoryRouter>);
  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
  assert.ok(screen.getByRole("heading", { name: "Что решаем" }));
  assert.ok(screen.getByRole("heading", { name: "Как работаем" }));
  assert.equal(screen.queryByRole("heading", { name: "Частые вопросы" }), null);
  assert.ok(screen.getByRole("button", { name: "Отправить заявку" }));
});
```

- [ ] **Шаг 2: Запустить тест и подтвердить падение**

Запустить: `yarn tsx --test src/pages/ServicePage.test.tsx`

Ожидается: FAIL из-за отсутствующего шаблона.

- [ ] **Шаг 3: Реализовать маршруты**

`catalog.loader` для `/services/` возвращает `serviceCard(entry)` и не переиспользует минимальный `{ title, excerpt, href }` contract. `content-page.loader` при service route загружает media и связи `related_case`, `related_article`, `related_faq`, затем вызывает `servicePage(entry, media, relatedCases, relatedArticles, faqEntries)`. Обычные page routes продолжают рендерить `MarkdownContent`.

`ServicePage` выводит в точном порядке:

```ts
export const SERVICE_SECTION_ORDER = [
  "hero", "problems", "solutions", "integrations", "process",
  "cases", "results", "guarantees", "faq", "lead", "articles",
] as const;
```

Каждый необязательный массив проверяется до создания section. FAQ использует нативные `<details>` и `<summary>`; вопрос и ответ присутствуют в SSR DOM и полностью работают без JavaScript.

- [ ] **Шаг 4: Расширить SSR parity**

Добавить `/services/`, `/services/business-process-automation/`, `/services/crm-development/`, `/services/web-services/`, `/services/mobile-app-development/`, `/services/integrations/`, `/services/ai-automation/` в список проверяемых путей. Для detail page потребовать видимый `article`/`main` текст длиннее 300 символов и форму заявки.

- [ ] **Шаг 5: Проверить шаблоны**

Запустить: `yarn tsx --test src/pages/ServicePage.test.tsx tests/ssr/seoParity.test.ts && yarn typecheck`

Ожидается: PASS при настроенном `TEST_DATABASE_URL` для SSR integration test.

- [ ] **Шаг 6: Зафиксировать срез**

```bash
git add src/pages/ServicesPage.tsx src/pages/ServicePage.tsx src/pages/ServicePage.test.tsx src/components/public/FaqList.tsx src/routes/catalog.tsx src/routes/content-page.tsx tests/ssr/seoParity.test.ts
git commit -m "feat(services): add commercial service templates"
```

---

### Задача 6: Создать каталог и структурированный шаблон кейсов

**Файлы:**

- Создать: `src/pages/CasesPage.tsx`
- Создать: `src/pages/CommercialCasePage.tsx`
- Создать: `src/pages/CommercialCasePage.test.tsx`
- Изменить: `src/routes/catalog.tsx`
- Изменить: `src/routes/case.tsx`
- Изменить: `src/server/content/presentation.ts`
- Изменить: `tests/projectPresentation.test.mjs`

**Интерфейсы:**

- Потребляет: `CaseCardView`, `CommercialCaseView`, media map и связанные услуги/кейсы.
- Производит: SSR `/cases/` и `/cases/:slug/` без client-only pagination.
- Сохраняет: legacy Markdown decoding для перенесённых кейсов, пока payload не заполнен через админку.

- [ ] **Шаг 1: Написать падающие тесты страницы кейса**

```tsx
test("case page omits unsupported proof and preserves the narrative order", () => {
  render(<MemoryRouter><CommercialCasePage pathname="/cases/example/" project={caseView({ testimonial: null, results: [] })} /></MemoryRouter>);
  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
  assert.ok(screen.getByRole("heading", { name: "Задача" }));
  assert.ok(screen.getByRole("heading", { name: "Решение" }));
  assert.equal(screen.queryByRole("heading", { name: "Результаты" }), null);
  assert.equal(screen.queryByText(/отзыв клиента/i), null);
});
```

- [ ] **Шаг 2: Запустить тест и подтвердить падение**

Запустить: `yarn tsx --test src/pages/CommercialCasePage.test.tsx tests/projectPresentation.test.mjs`

Ожидается: FAIL на отсутствии новой страницы и структурированного mapper.

- [ ] **Шаг 3: Реализовать каталог и detail route**

`catalog.loader` загружает media map для кейсов и передаёт `CaseCardView[]`. `CasesPage` выводит все server links; фильтры после hydration могут скрывать карточки, но без JavaScript остаётся полный список.

`case.loader` загружает `related_service` и `related_case`, затем вызывает:

```ts
commercialCasePage(entry, media, relatedServices, relatedCases): CommercialCaseView
```

Mapper предпочитает структурированные payload-поля и использует legacy Markdown decoding только для отсутствующего поля. `CommercialCasePage` пропускает пустые секции, не создаёт ссылку demo при отсутствии URL и использует `LeadCtaSection` с фактическим pathname.

- [ ] **Шаг 4: Добавить SSR и no-JS проверки**

В `tests/ssr/seoParity.test.ts` проверить `/cases/` и минимум один fixture-case: один H1, видимый контент, ссылка на связанную услугу, форма и отсутствие hydration errors.

- [ ] **Шаг 5: Проверить кейсы**

Запустить: `yarn tsx --test src/pages/CommercialCasePage.test.tsx tests/projectPresentation.test.mjs tests/ssr/seoParity.test.ts && yarn typecheck`

Ожидается: PASS.

- [ ] **Шаг 6: Зафиксировать срез**

```bash
git add src/pages/CasesPage.tsx src/pages/CommercialCasePage.tsx src/pages/CommercialCasePage.test.tsx src/routes/catalog.tsx src/routes/case.tsx src/server/content/presentation.ts tests/projectPresentation.test.mjs tests/ssr/seoParity.test.ts
git commit -m "feat(cases): add evidence-led case templates"
```

---

### Задача 7: Выровнять редакционные и юридические страницы, зафиксировать старые URL

**Файлы:**

- Изменить: `src/components/Blog.tsx`
- Изменить: `src/pages/JournalIndexPage.tsx`
- Изменить: `src/pages/JournalIssuePage.tsx`
- Изменить: `src/pages/VideoPage.tsx`
- Изменить: `src/routes/legal.tsx`
- Изменить: `src/routes/legacy-project.tsx`
- Создать: `docs/seo/legacy-url-decisions.md`
- Создать: `tests/seo/legacyDecisions.test.ts`

**Интерфейсы:**

- Потребляет: `Section`, `ContentCard`, `LeadCtaSection`.
- Производит: единый визуальный язык для блога, журнала, видео, privacy и requisites.
- Производит: машинно-проверяемые решения `keep`, `redirect`, `noindex`, `gone` для каждого известного старого URL.

- [ ] **Шаг 1: Написать падающий тест таблицы решений**

```ts
test("every discovered legacy project has one explicit decision", async () => {
  const rows = await readLegacyDecisionTable("docs/seo/legacy-url-decisions.md");
  const paths = rows.map(row => row.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(rows.every(row => ["keep", "redirect", "noindex", "gone"].includes(row.action)));
  assert.ok(rows.filter(row => row.action === "redirect").every(row => row.target?.startsWith("/cases/") && row.target.endsWith("/")));
});
```

- [ ] **Шаг 2: Сформировать таблицу только из репозиторных источников**

В `docs/seo/legacy-url-decisions.md` перечислить каждый путь, найденный в legacy case data, существующих redirect fixtures и crawler inventory. Формат строки:

```markdown
| `/project/web-site/` | redirect | `/cases/web-site/` | Точный опубликованный кейс |
```

Не добавлять домыслы о URL, которых нет в коде, контенте или текущем sitemap.

- [ ] **Шаг 3: Реализовать оформление страниц и точные ответы**

Юридические страницы используют общий container/типографику. Privacy явно описывает версию consent, оба счётчика, возможность отказа и ссылку/кнопку повторной настройки. Requisites публикует только ИП, ИНН, ОГРНИП и email.

`legacy-project.loader` читает точную карту решений: `redirect` возвращает 301 и сохраняет только разрешённые UTM-параметры, `gone` возвращает 410, неизвестный путь — 404. `noindex` применяется только к существующему маршруту с `X-Robots-Tag` и meta robots.

Карточки блога, журнала и видео переходят на `ContentCard`, но сохраняют существующие URLs и тексты.

- [ ] **Шаг 4: Проверить SEO и страницы**

Запустить: `yarn tsx --test tests/seo/legacyDecisions.test.ts tests/seo/crawler.test.ts tests/ssr/seoParity.test.ts && yarn typecheck`

Ожидается: PASS; redirect chains отсутствуют.

- [ ] **Шаг 5: Зафиксировать срез**

```bash
git add src/components/Blog.tsx src/pages/JournalIndexPage.tsx src/pages/JournalIssuePage.tsx src/pages/VideoPage.tsx src/routes/legal.tsx src/routes/legacy-project.tsx docs/seo/legacy-url-decisions.md tests/seo/legacyDecisions.test.ts
git commit -m "feat(content): align editorial and legal pages"
```

---

### Задача 8: Реализовать версионированное согласие на аналитику

**Файлы:**

- Создать: `src/lib/consent.ts`
- Создать: `src/lib/consent.test.ts`
- Создать: `src/contexts/ConsentContext.tsx`
- Создать: `src/components/public/ConsentBanner.tsx`
- Создать: `src/components/public/ConsentBanner.test.tsx`
- Изменить: `src/root.tsx`

**Интерфейсы:**

- Производит: `ConsentDecision = "unknown" | "accepted" | "rejected"`.
- Производит: `CONSENT_VERSION = "2026-09-18"`, `CONSENT_STORAGE_KEY = "kordev.analytics-consent"`.
- Производит: `useConsent(): { decision; accept; reject; openSettings; closeSettings; settingsOpen }`.
- Потребляет: только `localStorage`; cookie или серверная сессия не нужны.

- [ ] **Шаг 1: Написать падающие тесты state machine**

```ts
test("unknown, accepted, rejected and stale records normalize deterministically", () => {
  assert.equal(parseConsentRecord(null), "unknown");
  assert.equal(parseConsentRecord(JSON.stringify({ version: CONSENT_VERSION, decision: "accepted" })), "accepted");
  assert.equal(parseConsentRecord(JSON.stringify({ version: CONSENT_VERSION, decision: "rejected" })), "rejected");
  assert.equal(parseConsentRecord(JSON.stringify({ version: "old", decision: "accepted" })), "unknown");
  assert.equal(parseConsentRecord("broken"), "unknown");
});
```

```tsx
test("banner offers equal accept and reject actions and can reopen from the footer event", () => {
  render(<ConsentProvider><ConsentBanner /></ConsentProvider>);
  assert.ok(screen.getByRole("button", { name: "Разрешить аналитику" }));
  assert.ok(screen.getByRole("button", { name: "Только необходимые" }));
  fireEvent.click(screen.getByRole("button", { name: "Только необходимые" }));
  assert.equal(screen.queryByRole("dialog"), null);
  window.dispatchEvent(new Event("kordev:open-consent-settings"));
  assert.ok(screen.getByRole("dialog", { name: "Настройки аналитики" }));
});
```

- [ ] **Шаг 2: Подтвердить падение**

Запустить: `yarn tsx --test src/lib/consent.test.ts src/components/public/ConsentBanner.test.tsx`

Ожидается: FAIL из-за отсутствующих модулей.

- [ ] **Шаг 3: Реализовать чистую модель и provider**

Хранимая запись имеет точный контракт:

```ts
export type ConsentRecord = {
  version: typeof CONSENT_VERSION;
  decision: Exclude<ConsentDecision, "unknown">;
  decidedAt: string;
};
```

Первый server render и первый browser render используют `unknown`; localStorage читается в effect после hydration. `accept` и `reject` записывают ISO date. Сломанная или устаревшая запись не бросает исключение и возвращает `unknown`.

`ConsentBanner` использует `role="dialog"`, доступное название, краткое объяснение и две одинаково заметные кнопки. При повторном открытии показывается текущий выбор и доступно его изменение.

В `root.tsx` обернуть публичный shell, не затрагивая admin-ветку:

```tsx
<ConsentProvider>
  <PublicHeader />
  <main id="main-content"><Outlet /></main>
  <PublicFooter />
  <ConsentBanner />
</ConsentProvider>
```

- [ ] **Шаг 4: Проверить consent**

Запустить: `yarn tsx --test src/lib/consent.test.ts src/components/public/ConsentBanner.test.tsx tests/ssr/seoParity.test.ts && yarn typecheck`

Ожидается: PASS без hydration mismatch.

- [ ] **Шаг 5: Зафиксировать срез**

```bash
git add src/lib/consent.ts src/lib/consent.test.ts src/contexts/ConsentContext.tsx src/components/public/ConsentBanner.tsx src/components/public/ConsentBanner.test.tsx src/root.tsx
git commit -m "feat(consent): gate analytics behind explicit choice"
```

---

### Задача 9: Подключить consent-gated аналитику и события

**Файлы:**

- Создать: `src/lib/analytics.ts`
- Создать: `src/lib/analytics.test.ts`
- Создать: `src/components/AnalyticsScripts.tsx`
- Создать: `src/components/AnalyticsScripts.test.tsx`
- Изменить: `src/components/LeadForm.tsx`
- Изменить: `src/components/public/CtaLink.tsx`
- Изменить: `src/components/public/PublicFooter.tsx`
- Изменить: `src/components/public/CaseCard.tsx`
- Изменить: `src/components/public/ContentCard.tsx`
- Изменить: `src/root.tsx`
- Изменить: `index.html`
- Изменить: `tests/topMailCounter.test.mjs`

**Интерфейсы:**

- Производит: `track(event: AnalyticsEvent, payload?: AnalyticsPayload): void`.
- Производит: идемпотентные `loadYandexMetrika(document)` и `loadTopMailRu(document)`.
- Потребляет: `useConsent().decision`; при любом состоянии кроме `accepted` внешние скрипты отсутствуют.

- [ ] **Шаг 1: Написать падающие тесты загрузки**

```tsx
test("analytics vendors are absent before consent and loaded once after acceptance", () => {
  const view = render(<ConsentProvider><ConsentBanner /><AnalyticsScripts /></ConsentProvider>);
  assert.equal(document.querySelector('script[src*="mc.yandex.ru"]'), null);
  assert.equal(document.querySelector('script[src*="top-fwz1.mail.ru"]'), null);
  fireEvent.click(screen.getByRole("button", { name: "Разрешить аналитику" }));
  assert.equal(document.querySelectorAll('script[src*="mc.yandex.ru"]').length, 1);
  assert.equal(document.querySelectorAll('script[src*="top-fwz1.mail.ru"]').length, 1);
  view.rerender(<ConsentProvider><AnalyticsScripts /></ConsentProvider>);
  assert.equal(document.querySelectorAll('script[src*="top-fwz1.mail.ru"]').length, 1);
});
```

- [ ] **Шаг 2: Написать падающие тесты событий формы**

```tsx
test("successful persisted lead emits form_submit_success once", async () => {
  const events: string[] = [];
  setAnalyticsSinkForTests(event => events.push(event));
  render(<LeadForm pagePath="/services/integrations/" />);
  fillRequiredFields();
  fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
  await screen.findByText("Заявка отправлена");
  assert.deepEqual(events.filter(event => event === "form_submit_success"), ["form_submit_success"]);
});
```

- [ ] **Шаг 3: Удалить безусловный legacy-счётчик и подтвердить падение старого теста**

Удалить inline Top.Mail.Ru `<script>` и `<noscript>` pixel из `index.html`. Запустить: `yarn node --test tests/topMailCounter.test.mjs`.

Ожидается: старые утверждения о безусловной загрузке FAIL; переписать тест на отсутствие tracker markup в static HTML и наличие gated loader constants в `src/lib/analytics.ts`.

- [ ] **Шаг 4: Реализовать адаптер и инструментацию**

Допустимый union:

```ts
export type AnalyticsEvent =
  | "form_open" | "form_start" | "form_submit_success" | "form_submit_error"
  | "service_cta_click" | "telegram_click" | "email_click" | "phone_click"
  | "project_open" | "journal_issue_open";
```

`track` ничего не делает без принятого consent или без vendor global. Для Метрики используется `ym(105288175, "reachGoal", event, sanitizedPayload)`. Payload допускает только `path`, `serviceSlug`, `projectSlug` и `errorCode`; имя, телефон, описание, имя файла и URL вложения запрещены типом и runtime allowlist.

Top.Mail loader создаёт `_tmr` pageView с id `3793508`, вставляет `https://top-fwz1.mail.ru/js/code.js` один раз и не экспортирует API conversion events.

Внутри `ConsentProvider` после `ConsentBanner` добавить `<AnalyticsScripts />`; admin-ветка по-прежнему не монтирует аналитику.

Lead form отправляет `form_open` при первом focus внутри формы, `form_start` при первом изменении, success только после 2xx persisted response и error на отображённую ошибку. Guards через refs исключают дубли render/hydration.

- [ ] **Шаг 5: Проверить аналитику**

Запустить: `yarn tsx --test src/lib/analytics.test.ts src/components/AnalyticsScripts.test.tsx src/components/LeadForm.test.tsx && yarn node --test tests/topMailCounter.test.mjs && yarn typecheck`

Ожидается: PASS; до accept нет vendor scripts или pixel.

- [ ] **Шаг 6: Зафиксировать срез**

```bash
git add src/lib/analytics.ts src/lib/analytics.test.ts src/components/AnalyticsScripts.tsx src/components/AnalyticsScripts.test.tsx src/components/LeadForm.tsx src/components/public/CtaLink.tsx src/components/public/PublicFooter.tsx src/components/public/CaseCard.tsx src/components/public/ContentCard.tsx index.html tests/topMailCounter.test.mjs
git commit -m "feat(analytics): load counters only after consent"
```

---

### Задача 10: Добавить браузерные проверки адаптивности, доступности и движения

**Файлы:**

- Создать: `tests/visual/commercial-pages.test.ts`
- Создать: `tests/visual/support/commercialFixtures.ts`
- Изменить: `tests/ssr/seoParity.test.ts`
- Изменить: `package.json`

**Интерфейсы:**

- Потребляет: test PostgreSQL, `startTestRuntime`, Puppeteer и миграционные fixtures.
- Производит: `yarn test:commercial`.
- Проверяет: desktop 1440×1100, mobile 390×844, no-JS и reduced motion.

- [ ] **Шаг 1: Написать браузерный тест, который падает на старой компоновке**

```ts
for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
  await page.setViewport(viewport);
  await page.goto(`${runtime.origin}/`, { waitUntil: "networkidle2" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(await page.$$eval("h1", nodes => nodes.length), 1);
  for (const id of ["home-hero", "cases", "services", "krasotula", "process", "contact"]) {
    assert.equal(await page.$eval(`#${id}`, node => node.getBoundingClientRect().height > 40), true);
  }
}
```

Добавить проверки меню: opening, focus containment, Escape, returned focus. Добавить проверку `prefers-reduced-motion` через `page.emulateMediaFeatures` и отсутствие бесконечных animations у элементов `main *`.

- [ ] **Шаг 2: Добавить контролируемые fixtures и скриншоты**

Fixtures создают шесть услуг, три кейса, две статьи, media-free ветки и один длинный русский заголовок. Скриншоты сохраняются в системный temp directory, а тест проверяет ненулевой размер файла; PNG не коммитятся:

```ts
const screenshotPath = path.join(tmpdir(), `kordev-${viewport.width}-${routeSlug}.png`);
await page.screenshot({ path: screenshotPath, fullPage: true });
assert.ok((await stat(screenshotPath)).size > 20_000);
```

- [ ] **Шаг 3: Добавить команду проверки**

```json
"test:commercial": "tsx --test --test-concurrency=1 tests/visual/commercial-pages.test.ts tests/ssr/seoParity.test.ts"
```

- [ ] **Шаг 4: Выполнить браузерную проверку**

Запустить: `TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn test:commercial`

Ожидается: PASS для всех viewport и маршрутов. Вручную открыть сгенерированные PNG через `view_image` и проверить переносы, плотность, отсутствие пустых экранов и обрезанного текста.

- [ ] **Шаг 5: Зафиксировать срез**

```bash
git add tests/visual tests/ssr/seoParity.test.ts package.json
git commit -m "test(design): verify responsive commercial pages"
```

---

### Задача 11: Провести полную регрессию и подготовить локальный релизный срез

**Файлы:**

- Изменить: `docs/superpowers/plans/2026-09-18-kordev-commercial-redesign.md`
- При необходимости изменить только файлы, для которых конкретная проверка воспроизводит дефект.

**Интерфейсы:**

- Потребляет: завершённые задачи 1–10.
- Производит: проверенный локальный commit range без push и production-переключения.

- [ ] **Шаг 1: Запустить статические и модульные проверки**

```bash
yarn typecheck
yarn test
yarn build
```

Ожидается: exit code 0. Допускаются только уже задокументированные skip; новые skip запрещены.

- [ ] **Шаг 2: Запустить PostgreSQL, browser и SEO-проверки**

```bash
TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn test:commercial
TEST_DATABASE_URL=postgres://kordev:kordev@127.0.0.1:5433/kordev_test yarn seo:crawl
```

Ожидается: все канонические URL возвращают правильный status, один H1, metadata, canonical, рабочие внутренние ссылки и отсутствие draft content.

- [ ] **Шаг 3: Проверить consent сетевыми перехватами**

В Puppeteer включить request listener, открыть главную в чистом profile и подтвердить отсутствие запросов к `mc.yandex.ru` и `top-fwz1.mail.ru`. Нажать «Разрешить аналитику» и подтвердить ровно по одному script request к каждому vendor. Перезагрузить страницу и убедиться, что скрипты загружаются, а page view не вставляет второй script element.

- [ ] **Шаг 4: Проверить production Compose**

```bash
docker compose -f docker-compose.yml config --quiet
docker compose --env-file tests/fixtures/deploy-leads.env -f docker-compose.team.yml config --quiet
```

Ожидается: exit code 0; новые обязательные secret-переменные не появились.

- [ ] **Шаг 5: Проверить состав изменений**

```bash
git diff --check
git status --short
git log --oneline --decorate -15
```

Ожидается: нет временных PNG, секретов, `.env`, browser profile и несвязанных файлов. Изменения остаются только локально.

- [ ] **Шаг 6: Отметить выполненные шаги и зафиксировать финальную проверку**

После фактического прохождения каждого шага заменить соответствующие `- [ ]` на `- [x]`, затем:

```bash
git add docs/superpowers/plans/2026-09-18-kordev-commercial-redesign.md
git commit -m "test(design): verify commercial redesign"
```

На этом выполнение останавливается. Push в `main`, публикация образа и ручное production-переключение требуют отдельной команды владельца.
