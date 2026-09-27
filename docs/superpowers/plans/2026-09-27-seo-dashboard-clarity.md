# SEO Dashboard Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать SEO-кабинет понятным: отделить фактические показы от контрольных позиций и показать управляемую матрицу семантического ядра по регионам.

**Architecture:** Репозиторий собирает один агрегат контрольных позиций по активным запросам и восьми регионам Яндекса с точными сравнениями за день и семь дней. Админский loader передаёт агрегат в React, а UI заменяет неоднозначные breakdown-графики на подписанные карточки, таблицы и матрицу.

**Tech Stack:** TypeScript, React Router, PostgreSQL, Drizzle ORM, React SSR, node:test.

**Spec:** `docs/superpowers/specs/2026-09-27-seo-dashboard-clarity-design.md`

## Global Constraints

- Контрольные позиции не смешиваются со средней позицией Вебмастера/Search Console.
- `not_found` не отображается как позиция 0.
- Динамика считается только при наличии снимка ровно за 1 или 7 дней.
- Даты отображаются как `дд.мм.гггг`.
- Не трогать пользовательские каталоги `output/` и `tmp/`.

## Review Focus

- Активный запрос без снимков должен оставаться в матрице и учитываться как «без данных».
- Одновременные desktop/mobile и несколько регионов не должны удваивать количество отслеживаемых ключей в сводке.
- `found → not_found` и `not_found → found` должны давать правильное направление динамики.
- Отсутствующий точный снимок за день или семь дней не должен подменяться произвольным ближайшим.
- Пустые городские метрики Вебмастера должны показывать пояснение, а не пустой или неверно подписанный график.

---

### Task 1: Агрегат контрольных позиций

**Files:**
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/service.ts`
- Test: `src/server/seo-monitoring/repository.test.ts`

**Interfaces:**
- Produces: `repository.getRankControl(dateTo)` и `service.getRankControl({ dateTo })` с `summary`, `regions`, `rows`.

- [ ] Написать падающий DB-тест активных запросов, точных сравнений за 1/7 дней и переходов `not_found`.
- [ ] Запустить тест и подтвердить ожидаемый RED.
- [ ] Реализовать агрегат и довести DB-тест до GREEN.

### Task 2: Loader и понятный контрольный экран

**Files:**
- Modify: `src/routes/admin/seo.server.ts`
- Modify: `src/routes/admin/seo.tsx`
- Test: `src/routes/admin/seo.test.tsx`

**Interfaces:**
- Consumes: `getRankControl({ dateTo })`.
- Produces: карточки сводки и региональная матрица с точной семантикой.

- [ ] Написать падающий SSR/loader-тест карточек, матрицы, пустых состояний и дат.
- [ ] Запустить тест и подтвердить ожидаемый RED.
- [ ] Подключить агрегат и реализовать UI до GREEN.

### Task 3: Подписанные метрики и редактирование ядра

**Files:**
- Modify: `src/routes/admin/seo.tsx`
- Modify: `src/routes/admin/seo-charts.tsx`
- Test: `src/routes/admin/seo.test.tsx`

**Interfaces:**
- Produces: таблицы устройств/регионов/частотности и полностью подписанные столбцы редактора.

- [ ] Добавить падающие SSR-тесты заголовков, подсказок, сообщения о городах и предупреждения классификации.
- [ ] Подтвердить RED.
- [ ] Удалить неоднозначные breakdown-графики и реализовать подписанные таблицы и подсказки.
- [ ] Запустить целевые тесты до GREEN.

### Task 4: Проверка и сохранение

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: проверенный commit в `main`, готовый к deployment.

- [ ] Запустить целевые тесты, `yarn typecheck`, `yarn test` и `yarn build`.
- [ ] Проверить `git diff --check`, отсутствие секретов и неожиданных файлов.
- [ ] Закоммитить изменения без `output/` и `tmp/`.
