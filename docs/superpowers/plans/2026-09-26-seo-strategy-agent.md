# SEO Strategy Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить текущий SEO-кабинет в управляемый контур с видимым семантическим ядром, кандидатами, ограниченным ежедневным контролем позиций и MCP-инструментами для ежедневного AI-анализа.

**Architecture:** PostgreSQL остаётся единственным источником истины для запросов, метрик, контрольных позиций и рекомендаций. Версионированный файл начального ядра идемпотентно добавляет новые фразы и повышает существующие API-кандидаты, но не перезаписывает последующие ручные правки. Кабинет разделяет утверждённое ядро, кандидатов и фактические запросы, а MCP разрешает агенту читать ядро и сохранять кандидатов/утверждённые изменения без доступа к публичной публикации.

**Tech Stack:** TypeScript, React Router 7, React 18, Drizzle ORM, PostgreSQL, Recharts, MCP SDK, Node test runner, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-26-seo-strategy-agent-design.md`

## Global Constraints

- Пользовательские даты в кабинете имеют формат `дд.мм.гггг`; внутренние даты остаются ISO `yyyy-mm-dd`.
- Google Search Console не получает городские срезы и не подменяется парсингом живой выдачи.
- Yandex Search API проверяет только активные фразы, по восьми утверждённым регионам и двум устройствам.
- API-наблюдения создают кандидатов и никогда не включают контроль позиций автоматически.
- Группа ВЧ/СЧ/НЧ назначается явно, без универсальных автоматических порогов.
- Агент не меняет и не публикует публичный контент автоматически.
- Секреты источников не попадают в БД, ответы MCP, логи, тесты или интерфейс.
- Не изменять пользовательские каталоги `output/` и `tmp/`.

## Review Focus

- Повторная синхронизация ядра не должна затирать изменения, сделанные администратором или MCP после первого импорта; это проверяется тестом синхронизации в Task 2.
- Повторное наблюдение уже утверждённой фразы не должно возвращать её в кандидаты; это проверяется интеграционным тестом репозитория в Task 3.
- Лимит меньше стоимости одной полной матрицы не должен запускать частичный срез одного ключа; это проверяется тестом сборщика в Task 6.
- Форматирование даты не должно менять ISO-ключ, по которому Recharts совмещает точку и отметку изменения; это проверяется компонентным тестом в Task 5.
- MCP-токен только с `seo:read` не должен получить ни одного инструмента изменения ядра; это проверяется тестом набора MCP-инструментов в Task 7.

---

### Task 1: Модель состояния семантического ядра

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0008_seo_semantic_core.sql`
- Create/Modify: `drizzle/meta/0008_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Test: `src/server/db/schema.test.ts`
- Test: `tests/migrations.test.mjs`

**Interfaces:**
- Produces: `seoQueries.status` with `candidate | active | archived`, `seoQueries.kind` with `commercial | informational | other`, `seoQueries.priority` as a non-negative integer, and the existing `tracked` field constrained to equal `status === "active"`.
- Produces: database defaults `status=candidate`, `kind=other`, `priority=0`, `tracked=false`.

- [ ] **Step 1: Write failing schema and migration tests**

Assert that a new API query defaults to `candidate`, `other`, priority `0`, and not tracked; assert that invalid status/tracked combinations and negative priority are rejected. Add a migration assertion that existing unclassified API rows become candidates while non-API tracked rows become active.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `yarn tsx --test src/server/db/schema.test.ts && node --test tests/migrations.test.mjs`

Expected: FAIL because the status/kind/priority fields and migration do not exist.

- [ ] **Step 3: Add the Drizzle fields and generate migration 0008**

Create enums `seo_query_status` and `seo_query_kind`, add columns/defaults/checks/indexes, change `tracked` default to false, and backfill existing data without treating current API noise as active semantic core.

- [ ] **Step 4: Run focused tests and database check**

Run: `yarn tsx --test src/server/db/schema.test.ts && node --test tests/migrations.test.mjs && yarn db:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/schema.test.ts drizzle tests/migrations.test.mjs
git commit -m "feat: model semantic core lifecycle"
```

### Task 2: Версионированное начальное ядро и безопасная синхронизация

**Files:**
- Create: `content/seo/semantic-core.ru.json`
- Create: `src/server/seo-monitoring/semanticCore.ts`
- Create: `src/server/seo-monitoring/semanticCore.test.ts`
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/repository.test.ts`
- Modify: `src/server/seo-monitoring/runtime.ts`
- Modify: `src/entry.server.tsx`
- Create: `server/seo-core-sync.mjs`
- Create: `server/seo-core-sync.test.js`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `scripts/deploy-slot.sh`
- Modify: `.github/workflows/docker-build.yml`

**Interfaces:**
- Produces: `SemanticCoreEntry { queryText, targetPath, wordstatFrequency, frequencyBand, kind, priority }`.
- Produces: `repository.syncSemanticCore(entries)` returning `{ inserted, promoted, preserved }`.
- Produces: `syncSeoSemanticCore()` exported from the server build and CLI `node server/seo-core-sync.mjs`.

- [ ] **Step 1: Write failing validation and sync tests**

Cover duplicate normalized phrases, invalid paths, negative Wordstat values, unsupported groups/kinds, and a bounded initial core of at most 60 unique phrases. Verify commercial service queries from `docs/seo/semantic-research-2026-09.md` plus primary article queries from `docs/seo/briefs/`. Verify that sync inserts missing rows, promotes an API candidate to imported active, and preserves an existing manual/imported row changed after seeding.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `yarn tsx --test src/server/seo-monitoring/semanticCore.test.ts src/server/seo-monitoring/repository.test.ts && node --test server/seo-core-sync.test.js`

Expected: FAIL because the core source and sync command do not exist.

- [ ] **Step 3: Add the curated core and validator**

Store source-grounded phrases with one canonical target each. Use priorities `100` for commercial service phrases and `50` for informational article phrases. Keep the first active set within 60 phrases so the complete 8-region × 2-device matrix remains at or below 960 daily Search API calls.

- [ ] **Step 4: Implement idempotent sync**

For a missing normalized phrase, insert `origin=import`, `status=active`, `tracked=true`. For an existing `origin=api,status=candidate` row, promote and populate curated fields. For existing manual/imported rows, return `preserved` and do not overwrite later administrative choices.

- [ ] **Step 5: Wire the production command into build and deploy**

Bundle/import the JSON into the server build, expose `syncSeoSemanticCore`, add the minimal MJS loader command, include it in the production image, and run it after migrations but before content release planning. In CI, run it against the migrated test PostgreSQL before the crawl.

- [ ] **Step 6: Run focused tests and production-image checks**

Run: `yarn tsx --test src/server/seo-monitoring/semanticCore.test.ts src/server/seo-monitoring/repository.test.ts && node --test server/seo-core-sync.test.js && yarn typecheck && yarn build`

Expected: PASS, with the command present in the built production inputs.

- [ ] **Step 7: Commit**

```bash
git add content/seo src/server/seo-monitoring src/entry.server.tsx server/seo-core-sync.mjs server/seo-core-sync.test.js package.json Dockerfile scripts/deploy-slot.sh .github/workflows/docker-build.yml
git commit -m "feat: seed curated SEO semantic core"
```

### Task 3: Репозиторий и сервис управления ядром

**Files:**
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/repository.test.ts`
- Modify: `src/server/seo-monitoring/service.ts`
- Modify: `src/server/seo-monitoring/service.test.ts`
- Modify: `src/server/seo-monitoring/contracts.ts`

**Interfaces:**
- Produces: `listSemanticCore({ status?, kind?, limit?, cursor? })` returning every query independent of observed metrics.
- Produces: `createCandidate({ queryText, targetPath?, wordstatFrequency?, frequencyBand?, kind?, priority? })`.
- Produces: `updateSemanticQuery({ id, expectedUpdatedAt, targetPath, wordstatFrequency, frequencyBand, kind, priority, status })` with optimistic conflict detection.
- Preserves: `listQueries(...)` as factual metrics only.

- [ ] **Step 1: Write failing repository tests**

Assert that the semantic-core listing includes active zero-impression rows and separately filters candidates. Assert that observation ingestion inserts a candidate with `tracked=false`, while a matching active row keeps all curated fields. Assert cursor bounds and optimistic update conflicts.

- [ ] **Step 2: Run repository tests and verify RED**

Run: `yarn tsx --test src/server/seo-monitoring/repository.test.ts`

Expected: FAIL on missing lifecycle methods and incorrect API defaults.

- [ ] **Step 3: Implement repository behavior**

Keep metric filters on `seo_daily_metrics`. Add a separate direct `seo_queries` listing ordered by status, priority descending, and query text. Do not use a left join whose metric filters silently remove zero-observation rows.

- [ ] **Step 4: Write failing service validation tests**

Cover normalized query text, local canonical target path, integer Wordstat/priority bounds, allowed enum values, UUIDs, duplicate conflict, and `expectedUpdatedAt` validation.

- [ ] **Step 5: Implement the service methods**

Use `normalizeQuery` and `normalizeSitePath`, bound query text to 500 characters, Wordstat to non-negative safe integers, and priority to `0..1000`.

- [ ] **Step 6: Run focused tests**

Run: `yarn tsx --test src/server/seo-monitoring/repository.test.ts src/server/seo-monitoring/service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/seo-monitoring
git commit -m "feat: manage semantic core queries"
```

### Task 4: Семантическое ядро и кандидаты в админке

**Files:**
- Modify: `src/routes/admin/seo.server.ts`
- Modify: `src/routes/admin/seo.tsx`
- Modify: `src/routes/admin/seo.test.tsx`

**Interfaces:**
- Consumes: `listSemanticCore`, `createCandidate`, and `updateSemanticQuery` from Task 3.
- Produces: loader fields `semanticCore` and `candidates` plus actions `create-query` and `update-query`.

- [ ] **Step 1: Write failing loader/action/render tests**

Assert that the page shows «Семантическое ядро» and «Кандидаты» separately from «Фактические запросы», displays an active zero-impression phrase, Wordstat, ВЧ/СЧ/НЧ, target, kind and state, and supports add/edit/archive/activate forms with CSRF and optimistic timestamp fields.

- [ ] **Step 2: Run the admin test and verify RED**

Run: `yarn tsx --test src/routes/admin/seo.test.tsx`

Expected: FAIL because the loader and panels do not expose the core.

- [ ] **Step 3: Extend loader and actions**

Load up to 100 active/archived core rows and 100 candidates independently of the selected metrics period. Map validation failures to safe 422/409 responses; keep unknown failures sanitized.

- [ ] **Step 4: Render the three distinct query concepts**

Rename the existing metrics block to «Фактические запросы». Add compact forms and explicit empty states. Explain that a candidate is observed but not yet included in daily Search API control.

- [ ] **Step 5: Run the admin test**

Run: `yarn tsx --test src/routes/admin/seo.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin/seo.server.ts src/routes/admin/seo.tsx src/routes/admin/seo.test.tsx
git commit -m "feat: show semantic core in SEO admin"
```

### Task 5: Формат дат на графиках

**Files:**
- Modify: `src/routes/admin/seo-charts.tsx`
- Create: `src/routes/admin/seo-charts.test.tsx`
- Modify: `src/routes/admin/seo.test.tsx`

**Interfaces:**
- Produces: `formatSeoChartDate(value: unknown): string` returning `dd.mm.yyyy` for valid ISO dates and a safe original/empty label otherwise.

- [ ] **Step 1: Write failing formatter/component tests**

Assert `2026-09-23 -> 23.09.2026`, verify all three time-series `XAxis` instances receive `tickFormatter`, all three `Tooltip` instances receive `labelFormatter`, and the underlying `date` plus `ReferenceLine.x` remain ISO.

- [ ] **Step 2: Run the chart tests and verify RED**

Run: `yarn tsx --test src/routes/admin/seo-charts.test.tsx src/routes/admin/seo.test.tsx`

Expected: FAIL because chart axes/tooltips expose ISO values.

- [ ] **Step 3: Implement display-only formatting**

Add one pure helper and reuse it in traffic, CTR and position charts. Do not rewrite data arrays or marker keys.

- [ ] **Step 4: Run chart/admin tests**

Run: `yarn tsx --test src/routes/admin/seo-charts.test.tsx src/routes/admin/seo.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/seo-charts.tsx src/routes/admin/seo-charts.test.tsx src/routes/admin/seo.test.tsx
git commit -m "fix: format SEO chart dates for readers"
```

### Task 6: Ограниченный дневной контроль Яндекса

**Files:**
- Modify: `src/server/seo-monitoring/contracts.ts`
- Modify: `src/server/seo-monitoring/config.ts`
- Modify: `src/server/seo-monitoring/config.test.ts`
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/rankCollector.ts`
- Modify: `src/server/seo-monitoring/rankCollector.test.ts`
- Modify: `src/server/seo-monitoring/runtime.ts`
- Modify: `deploy/env/operations.env.example`
- Modify: `deploy/README.md`

**Interfaces:**
- Produces: `YandexSearchConfig.dailyCheckLimit` from `SEO_YANDEX_SEARCH_DAILY_LIMIT`, default `1000`, bounded `16..100000` when enabled.
- Consumes: active queries ordered by `priority DESC`, then commercial before informational/other, then creation/id.

- [ ] **Step 1: Write failing config and collector tests**

Verify default/explicit/invalid limits. Verify a 32-check limit with an eight-region, two-device matrix selects exactly two whole queries, reports omitted query count, and never runs a partial region/device matrix. Verify a limit below one full matrix returns `failed` with `seo_yandex_search_daily_limit_too_low` before provider calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `yarn tsx --test src/server/seo-monitoring/config.test.ts src/server/seo-monitoring/rankCollector.test.ts`

Expected: FAIL because the collector has no quota planner.

- [ ] **Step 3: Implement configuration and whole-query planning**

Calculate `checksPerQuery = regions.length * 2`, select `floor(limit / checksPerQuery)` active queries, and store `availableQueryCount`, `selectedQueryCount`, `omittedQueryCount`, and `dailyCheckLimit` in safe run metadata.

- [ ] **Step 4: Document the operational variable**

Add only the variable name/default/range to the example and runbook; do not print or alter Search API secrets.

- [ ] **Step 5: Run focused tests**

Run: `yarn tsx --test src/server/seo-monitoring/config.test.ts src/server/seo-monitoring/rankCollector.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/seo-monitoring deploy/env/operations.env.example deploy/README.md
git commit -m "feat: bound daily Yandex rank checks"
```

### Task 7: MCP-инструменты семантического ядра

**Files:**
- Modify: `src/server/seo-monitoring/mcpService.ts`
- Modify: `src/server/seo-monitoring/mcpService.test.ts`
- Modify: `src/server/mcp/tools.ts`
- Modify: `src/server/mcp/tools.test.ts`

**Interfaces:**
- Produces read tool: `list_seo_semantic_core`.
- Produces write tools: `create_seo_candidate` and `update_seo_query`.
- Requires: `seo:read` for listing; both `seo:read` and `seo:write` for mutation.

- [ ] **Step 1: Write failing MCP service and tool-surface tests**

Verify schemas, pagination, compact JSON dates, token-bound audit records, unknown-field rejection, optimistic conflicts, and that read-only tokens never see mutation tools.

- [ ] **Step 2: Run focused MCP tests and verify RED**

Run: `yarn tsx --test src/server/seo-monitoring/mcpService.test.ts src/server/mcp/tools.test.ts`

Expected: FAIL because the semantic-core tools do not exist.

- [ ] **Step 3: Implement MCP adapters and schemas**

Keep `create_seo_candidate` restricted to status `candidate`. Let `update_seo_query` expose explicit state changes with `expectedUpdatedAt`; the daily automation prompt must not activate or archive without an approved decision.

- [ ] **Step 4: Run focused MCP tests**

Run: `yarn tsx --test src/server/seo-monitoring/mcpService.test.ts src/server/mcp/tools.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/seo-monitoring/mcpService.ts src/server/seo-monitoring/mcpService.test.ts src/server/mcp/tools.ts src/server/mcp/tools.test.ts
git commit -m "feat: expose semantic core over MCP"
```

### Task 8: Полная проверка, публикация и ежедневный агент

**Files:**
- Modify if required by verification: `docs/runbooks/seo-strategy-agent.md`
- Modify if required by verification: existing deployment/test files only within this feature scope

**Interfaces:**
- Consumes: all previous tasks.
- Produces: deployed admin/MCP behavior and an updated `seo` heartbeat automation at 09:00 Europe/Moscow.

- [ ] **Step 1: Write the operating runbook and final automation prompt**

Document source freshness, 7/28-day comparison, candidate handling, no automatic content publication, no automatic activation/archive, Yandex regions, Google limitations, and quiet-on-no-change behavior.

- [ ] **Step 2: Run all local verification**

Run: `yarn typecheck && yarn test && yarn build && git diff --check`

Expected: all commands PASS and `git status --short` contains only intended feature files plus untouched `output/` and `tmp/`.

- [ ] **Step 3: Push and verify CI images**

Push `main`, wait for the build workflow, and record exact immutable web/content image digests only after the workflow succeeds.

- [ ] **Step 4: Deploy the inactive slot and switch safely**

Use the established protected production workflow, exact image digests, backup, migrations, semantic-core sync, content verification, readiness, release gate and manual slot switch. Never print `/etc/kordevteam/operations.env`.

- [ ] **Step 5: Configure the non-secret daily limit and run first control collection**

Set `SEO_YANDEX_SEARCH_DAILY_LIMIT=1000` in the protected operations environment without displaying existing values. Run the SEO job from the active immutable image and verify safe counts/statuses.

- [ ] **Step 6: Verify production behavior**

Confirm `/admin/seo/` is protected, the core contains the curated active phrases, candidates are separate, chart date format is readable, exact Yandex rows are stored, and the MCP tool list matches token scopes. Do not disclose credentials or raw provider responses.

- [ ] **Step 7: Update the existing `seo` heartbeat**

Keep 09:00 Europe/Moscow. Make it collect first, then analyze fresh official data plus control ranks, use the new core MCP tools, add only evidence-backed candidates/recommendations, never auto-publish content or activate/archive phrases, and stay quiet when no action is required.

- [ ] **Step 8: Final report**

Report the deployed commit/image, curated active/candidate counts, planned daily rank-check count, source freshness, verification commands, and any remaining data-latency limitation.
