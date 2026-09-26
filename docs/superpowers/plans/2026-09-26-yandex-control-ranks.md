# Yandex Control Ranks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ежедневно сохранять и показывать контрольные органические позиции `kordev.team` по отслеживаемым запросам, регионам и устройствам Яндекса.

**Architecture:** Отдельный адаптер Yandex Search API формирует воспроизводимый запрос и извлекает первый URL домена из топ-100. Отдельный сборщик читает отслеживаемые фразы и регионы из PostgreSQL, сохраняет идемпотентные снимки и подключается к существующему SEO CLI. Админка читает контрольные снимки отдельно от метрик реальных показов.

**Tech Stack:** TypeScript, Node.js, React Router, PostgreSQL, Drizzle ORM, Yandex Search API, node:test.

**Spec:** `docs/superpowers/specs/2026-09-26-yandex-control-ranks-design.md`

## Global Constraints

- Google SERP не парсится и браузерные запросы в Google не автоматизируются.
- Секреты и необработанные внешние ответы не попадают в БД, UI и логи.
- `not_found` не превращается в позицию 0.
- Контрольные позиции не смешиваются со средней позицией Вебмастера/Search Console.
- Все даты в новом UI отображаются как `дд.мм.гггг`.

## Review Focus

- URL поддомена или похожего домена не должен ошибочно считаться `kordev.team`.
- Повреждённый Base64/XML должен завершаться безопасным кодом без утечки ответа.
- Повторный запуск в тот же день не должен создавать дубликаты.
- Пустое отслеживаемое ядро не должно считаться ошибкой.
- Частичный сбой не должен удалять или откатывать успешные проверки.

---

### Task 1: Модель данных и конфигурация

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0007_yandex_control_ranks.sql`
- Modify: `src/server/seo-monitoring/contracts.ts`
- Modify: `src/server/seo-monitoring/config.ts`
- Test: `src/server/db/schema.test.ts`
- Test: `src/server/seo-monitoring/config.test.ts`

**Interfaces:**
- Produces: `YandexSearchConfig`, `seoRankChecks`, `seoRankRuns`, enum-статусы снимка.

- [ ] Написать падающие тесты схемы и конфигурации, включая выключенный источник, обязательные key/folder/host и безопасную сводку.
- [ ] Запустить целевые тесты и подтвердить ожидаемое падение.
- [ ] Добавить типы, таблицы, ограничения, конфигурацию и сгенерировать миграцию.
- [ ] Запустить целевые тесты до зелёного состояния.

### Task 2: Адаптер Search API и сборщик

**Files:**
- Create: `src/server/seo-monitoring/providers/yandexSearch.ts`
- Create: `src/server/seo-monitoring/providers/yandexSearch.test.ts`
- Create: `src/server/seo-monitoring/rankCollector.ts`
- Create: `src/server/seo-monitoring/rankCollector.test.ts`
- Modify: `src/server/seo-monitoring/repository.ts`
- Test: `src/server/seo-monitoring/repository.test.ts`

**Interfaces:**
- Consumes: `YandexSearchConfig`, отслеживаемые запросы и активные регионы.
- Produces: `createYandexSearchProvider`, `createSeoRankCollector`, repository methods для запусков и upsert снимков.

- [ ] Написать падающие тесты тела API-запроса, desktop/mobile, точного host-match, `not_found`, невалидного ответа и безопасных ошибок.
- [ ] Запустить provider-тест и подтвердить RED.
- [ ] Реализовать минимальный provider и довести тест до GREEN.
- [ ] Написать падающие тесты матрицы query × region × device, пустого ядра, partial и идемпотентного upsert.
- [ ] Реализовать repository methods и сборщик, затем запустить все целевые тесты.

### Task 3: CLI, production-конфигурация и документация

**Files:**
- Modify: `src/server/seo-monitoring/runtime.ts`
- Modify: `src/entry.server.tsx`
- Modify: `server/seo-collect.mjs`
- Test: `server/seo-collect.test.js`
- Modify: `deploy/docker-compose.team.yml`
- Modify: `tests/deploy/seo-monitoring.test.mjs`
- Modify: `docs/runbooks/seo-monitoring.md`

**Interfaces:**
- Consumes: `createSeoRankCollector`, `createYandexSearchProvider`.
- Produces: ежедневный combined run и `--source=yandex-rank`.

- [ ] Написать падающие CLI/deploy-тесты для нового target и секретов только в `seo-job`.
- [ ] Запустить тесты и подтвердить RED.
- [ ] Подключить runtime, CLI, compose environment и runbook.
- [ ] Запустить CLI/deploy-тесты до GREEN.

### Task 4: Административное отображение

**Files:**
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/service.ts`
- Modify: `src/routes/admin/seo.server.ts`
- Modify: `src/routes/admin/seo.tsx`
- Test: `src/routes/admin/seo.test.tsx`

**Interfaces:**
- Consumes: сохранённые `seoRankChecks`.
- Produces: `listRankChecks` и блок контрольных позиций в кабинете.

- [ ] Написать падающий UI/loader-тест для понятных заголовков, `не найден в топ-100`, динамики и даты `дд.мм.гггг`.
- [ ] Запустить тест и подтвердить RED.
- [ ] Реализовать чтение и отдельный UI-блок без смешения со средней позицией.
- [ ] Запустить UI и service/repository тесты до GREEN.

### Task 5: Полная проверка и сохранение

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: проверенный commit в `main`, готовый к deployment после добавления credentials.

- [ ] Запустить `yarn typecheck`.
- [ ] Запустить все новые и затронутые тесты.
- [ ] Запустить `yarn test`, отдельно указав известные baseline-сбои, если они воспроизводятся без изменений.
- [ ] Проверить `git diff --check`, отсутствие секретов и неожиданных файлов.
- [ ] Закоммитить реализацию в `main` без `output/` и `tmp/`.
