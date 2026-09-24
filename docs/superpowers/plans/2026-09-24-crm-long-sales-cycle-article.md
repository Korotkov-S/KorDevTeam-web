# CRM Long Sales Cycle Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать существующую статью `/blog/long-b2b-sales-cycle-crm/` в практическое руководство по ведению длинной B2B-сделки в CRM без потери исходного URL и без пересечения с общим руководством по внедрению CRM.

**Architecture:** Markdown `public/blog/long-b2b-sales-cycle-crm.md` остаётся источником текста, а запись в `public/content/blog.ru.json` — источником метаданных. Отдельный SEO-бриф фиксирует спрос, выдачу, границы интента и собственный опыт, а узкий source-contract test защищает структуру, ссылки, отсутствие нерелевантной фотографии и корректные метаданные. После изменения синхронизируется только один существующий slug.

**Tech Stack:** Markdown, JSON, Node.js test runner, TypeScript/tsx, React Router SSR, PostgreSQL content sync.

**Spec:** `docs/superpowers/specs/2026-09-24-article-seo-program-design.md`

## Global Constraints

- Сохранить slug `long-b2b-sales-cycle-crm`, дату первой публикации и существующий URL.
- Статья владеет информационным интентом «как не потерять клиента в длинной B2B-сделке»; `/services/crm-development/` владеет коммерческим интентом разработки CRM.
- `/blog/crm-implementation/` остаётся общим руководством по проекту внедрения CRM.
- Будущая статья `krasotulya-telegram-121` будет владельцем общего интента «как настроить воронку продаж в CRM»; здесь воронка нужна только как пример длинного цикла.
- Короткие публикации `krasotulya-telegram-109` и `krasotulya-telegram-122` не удалять, не редиректить и не менять в этой задаче.
- Не придумывать показатели продаж, сроки внедрения, количество клиентов или функции Krasotula, которых нет в подтверждённых источниках.
- Удалить декоративную фотографию; не добавлять изображение без прямой содержательной пользы.
- Не делать широкую таблицу: максимум четыре коротких столбца либо последовательные списки, читаемые на 390 px.

## Review Focus

- Каннибализация с общей воронкой: заголовки и лид должны постоянно возвращать материал к длинной B2B-сделке, повторным касаниям и следующему действию.
- Неподтверждённый опыт: раздел про Krasotula описывает только личное использование CRM и подтверждённые продуктовые возможности без числовых результатов.
- Формальные статусы: этапы называются завершёнными действиями и содержат критерий перехода, а не «в работе» или «думает».
- Мобильная читаемость: в Markdown нет широких таблиц, длинных URL и изображений, создающих горизонтальное переполнение.
- Безопасная публикация: синхронизируется только `long-b2b-sales-cycle-crm`, повторный запуск даёт `unchanged: 1`.

---

### Task 1: Зафиксировать SEO-бриф и source contract

**Files:**
- Create: `docs/seo/briefs/crm-long-sales-cycle.md`
- Create: `tests/seo/crmLongSalesCycleArticleSource.test.ts`

**Interfaces:**
- Consumes: Wordstat для России, SERP по длинной B2B-сделке и CRM-воронке, `krasotulya-telegram-109.md`, `krasotulya-telegram-122.md`, кейс `content/portfolio/cases/krasotula-crm.json`.
- Produces: проверяемый контракт одного информационного URL и границы его интента.

- [ ] **Step 1: Записать спрос и границы интента в SEO-бриф**

Зафиксировать Wordstat за 24.08.2026–22.09.2026, Россия, все устройства: `длинный цикл продаж` — 64; в результатах базового кластера `воронка продаж` — 15 758, `воронка продаж этапы` — 1 092, `воронка продаж CRM` — 306, `воронка продаж B2B` — 180, `автоматизация воронки продаж` — 125. Отметить, что высокочастотный общий интент воронки не становится главным интентом этой страницы.

- [ ] **Step 2: Зафиксировать наблюдения по российской выдаче**

Записать повторяющиеся полезные элементы: этап как завершённое действие, критерии входа и выхода, обязательный следующий шаг, отдельный сценарий отложенного спроса, контроль времени на этапе и сделок без задачи. Зафиксировать пробел KorDevTeam: личный пример использования собственной CRM после встреч, конкретные формулировки следующего действия и готовые follow-up сообщения.

- [ ] **Step 3: Написать падающий source-contract test**

Тест должен ожидать:

```ts
const title = "Как не терять клиентов с длинным циклом сделки: CRM и следующий шаг";
const seoTitle = "Длинный цикл продаж в CRM: следующий шаг и контроль сделок";
const seoDescription = "Как вести длинную B2B-сделку в CRM: обязательные поля, этапы, следующий шаг, напоминания, повторные касания и контроль зависших клиентов.";
const excerpt = "Практическая система для длинных B2B-сделок: обязательные поля, следующий шаг, напоминания, повторные касания и контроль зависших клиентов.";
```

Проверить `updatedDate: "24 сентября 2026"`, `readTime: "9 мин"`, пустой `coverUrl`, пустой `imageUrls`, точные H2, ссылки на `/services/crm-development/`, `/cases/krasotula-crm/`, `/blog/crm-implementation/`, наличие примеров follow-up, личного опыта Krasotula и отсутствие Markdown-изображений. Минимальная длина — 8 000 символов.

- [ ] **Step 4: Подтвердить RED**

Run:

```bash
yarn tsx --test tests/seo/crmLongSalesCycleArticleSource.test.ts
```

Expected: FAIL на прежнем title, фотографии и отсутствующих обязательных разделах.

### Task 2: Переписать статью и метаданные

**Files:**
- Modify: `public/blog/long-b2b-sales-cycle-crm.md`
- Modify: `public/content/blog.ru.json`

**Interfaces:**
- Consumes: утверждённый source contract из Task 1.
- Produces: полный Markdown и согласованные метаданные для одного существующего slug.

- [ ] **Step 1: Переписать Markdown с точной структурой**

```markdown
# Как не терять клиентов с длинным циклом сделки: CRM и следующий шаг
## Почему длинная B2B-сделка теряется между касаниями
## Главное правило: у каждой сделки есть следующее действие
## Какие контакты заносить в CRM
## Что обязательно хранить в карточке сделки
## Пример воронки для длинной B2B-сделки
## Какие действия стоит автоматизировать
## Что контролировать руководителю
## Примеры сообщений после встречи
## Как мы сами работаем со сделками в Krasotula CRM
## Чек-лист настройки за один день
## Когда нужна доработка или собственная CRM
## Что делать дальше
```

В карточку включить источник, компанию и роль человека, задачу, ЛПР и участников решения, договорённости, последнее содержательное касание, следующее действие, дату, ответственного, препятствие и приложенные материалы. Плохой следующий шаг `связаться с клиентом` противопоставить конкретному действию с контекстом и датой.

- [ ] **Step 2: Добавить прикладные элементы**

Дать пример длинного цикла от знакомства до квалификации, диагностики, отправленного предложения, внутреннего согласования, отложенного спроса и результата. Для каждого этапа назвать факт, который позволяет перевести карточку дальше. Добавить автоматические напоминания о просрочке, сигнал о сделке без задачи, контроль времени на этапе, follow-up после мероприятия и отдельный список отложенного спроса.

- [ ] **Step 3: Добавить собственный опыт и шаблоны**

Описать подтверждённую практику: Геннадий после встреч заносит компании и сделки в Krasotula CRM, фиксирует следующее действие, а продукт развивается из реальных рабочих задач. Упомянуть разрабатываемый голосовой ввод только как направление развития, не как гарантированно доступную функцию. Дать три коротких сообщения: после знакомства, после отправки материалов и после согласованной паузы.

- [ ] **Step 4: Обновить только нужную metadata record**

Записать exact title, seoTitle, seoDescription, excerpt из Task 1, `updatedDate: "24 сентября 2026"`, `readTime: "9 мин"`, `coverUrl: ""`, `imageUrls: []`. Сохранить исходную дату и теги.

- [ ] **Step 5: Подтвердить GREEN источника**

Run:

```bash
yarn tsx --test tests/seo/crmLongSalesCycleArticleSource.test.ts src/server/content/articleSources.test.ts
jq empty public/content/blog.ru.json
git diff --check -- public/blog/long-b2b-sales-cycle-crm.md public/content/blog.ru.json docs/seo/briefs/crm-long-sales-cycle.md tests/seo/crmLongSalesCycleArticleSource.test.ts
```

Expected: PASS.

### Task 3: Синхронизировать и проверить страницу

**Files:**
- Verify: PostgreSQL article `long-b2b-sales-cycle-crm`
- Verify: `/blog/long-b2b-sales-cycle-crm/`

**Interfaces:**
- Consumes: проверенные Markdown и metadata record.
- Produces: обновлённая локальная SSR-страница без изменения других статей.

- [ ] **Step 1: Синхронизировать только выбранную статью**

```bash
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn content:articles --slug long-b2b-sales-cycle-crm
```

Expected: `updated: 1`.

- [ ] **Step 2: Подтвердить идемпотентность**

Повторить команду. Expected: `unchanged: 1`.

- [ ] **Step 3: Запустить focused regression и сборку**

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test tests/seo/crmLongSalesCycleArticleSource.test.ts src/server/content/articleSources.test.ts src/pages/BlogPostPage.test.tsx src/server/seo/metadata.test.ts
yarn typecheck
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn build
```

Expected: tests PASS, typecheck и build exit 0.

- [ ] **Step 4: Проверить SSR и страницу визуально**

В исходном HTML проверить H1, canonical, BlogPosting, datePublished/dateModified, автора и внутренние ссылки. На desktop и 390 px проверить отсутствие декоративной фотографии, горизонтального переполнения и ломаных переносов; убедиться, что шаблоны сообщений и этапы сделки легко сканируются.

- [ ] **Step 5: Запустить полный набор и зафиксировать результат**

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn test
git diff --check
git status --short
```

Expected: новые проверки проходят; три ранее известные посторонние ошибки перечисляются дословно, если остаются неизменными.
