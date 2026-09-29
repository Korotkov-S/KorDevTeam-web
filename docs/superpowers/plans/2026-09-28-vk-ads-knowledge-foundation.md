# VK Ads Knowledge Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать первый безопасный слой рекламного контура KorDevTeam: долговременную базу знаний, проверяемый жизненный цикл гипотез и экспериментов, отдельные MCP-права агента и read-only кабинет без вызовов VK Ads или Krasotula CRM.

**Architecture:** PostgreSQL хранит нормализованные рекламные сущности, неизменяемые измерения/события и идемпотентные receipts команд. `AdvertisingService` является единственной границей валидации, переходов состояний, fingerprint и optimistic concurrency; MCP и защищённая админка используют этот сервис, но на этом этапе не получают клиентов VK/CRM и не могут создать рекламный расход.

**Tech Stack:** TypeScript 5.9, React Router 7, React 18, PostgreSQL, Drizzle ORM, Zod 4, MCP SDK 2.1, node:test, JSDOM.

**Spec:** `docs/superpowers/specs/2026-09-28-vk-ads-experiment-agent-design.md`

## Scope

Это первый независимо поставляемый план из полного проекта. Он реализует этап **Knowledge foundation** и подготавливает интерфейсы для следующих отдельных планов:

1. импорт существующих VK-объектов и сбор статистики;
2. read-only feedback из Krasotula CRM и атрибуция;
3. автоматизированный Research Radar;
4. approval envelope и VK Executor;
5. Decision Engine, уведомления и эксплуатационная автоматизация.

В рамках этого плана разрешены только записи в локальную рекламную базу знаний. Реальные VK/CRM API, секреты, лиды и рекламные бюджеты не используются.

## Global Constraints

- Никакой код этого этапа не обращается к VK Ads или Krasotula CRM и не создаёт рекламный расход.
- Админка хранит и показывает знания; в ней нет кнопок запуска, остановки, изменения ставки или бюджета VK.
- MCP получает отдельные scopes `ads:read` и `ads:write`; существующие токены не приобретают их автоматически.
- Любая MCP-запись требует UUID `idempotencyKey`; одинаковый ключ с одинаковой командой возвращает сохранённый результат, а с другим payload даёт `ads_idempotency_conflict`.
- Изменение версии гипотезы, эксперимента или verdict использует optimistic concurrency и даёт безопасный `ads_*_conflict`.
- Passport и approval snapshot неизменяемы после одобрения; несоответствие серверного fingerprint отклоняется.
- Рекламные таблицы, loader data, HTML, MCP-ответы, события и command receipts не содержат контактного имени лида, телефона, email, файлов заявки, токенов, секретов или необработанных vendor responses; названия компаний, источников и вариантов остаются допустимыми типизированными полями.
- Metric snapshots, events и approval snapshot append-only; исправление создаёт новую запись, а не переписывает историю.
- Списки ограничены `1..100` строками и используют непрозрачный cursor; текстовые/JSON-поля имеют серверные пределы размера.
- Сохранять пользовательские каталоги `output/` и `tmp/` без изменений.

## Review Focus

- Повтор одной MCP-команды после потери ответа не должен создавать вторую запись; одинаковый ключ с изменённым payload должен отклоняться — покрывается Task 3.
- Подмена passport между предложением и approval не должна позволить одобрить другой бюджет, аудиторию или оффер — покрывается Task 3.
- Просроченный `expectedVersion` не должен перетирать более новое решение администратора или агента — покрывается Tasks 2 и 3.
- Токен только с `ads:read` не должен видеть или вызывать ни один write-tool, а `ads:write` без `ads:read` не должен давать инструменты — покрывается Task 4.
- PII/секретоподобные поля и управляющие элементы VK не должны попасть в MCP/admin DTO даже через JSON evidence или error path — покрывается Tasks 3, 5 и 6.

---

### Task 1: Контракты, схема и миграция рекламных знаний

**Files:**
- Create: `src/server/advertising/contracts.ts`
- Create: `src/server/advertising/contracts.test.ts`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/schema.test.ts`
- Create: `drizzle/0013_advertising_knowledge.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0013_snapshot.json`

**Interfaces:**
- Produces: union-типы `AdEvidenceGrade`, `AdResearchSourceType`, `AdChannel`, `AdHypothesisStatus`, `AdConversionPath`, `AdChangedVariable`, `AdPrimaryMetric`, `AdExperimentStatus`, `AdVariantStatus`, `AdMetricGranularity`, `AdLeadClassification`, `AdExperimentVerdict`, `AdLearningConfidence`, `AdActor` и безопасные command/read DTO.
- Produces: таблицы `ad_research_sources`, `ad_market_signals`, `ad_hypotheses`, `ad_experiments`, `ad_experiment_variants`, `ad_metric_snapshots`, `ad_lead_attributions`, `ad_experiment_events`, `ad_learnings`, `ad_command_receipts`.
- Consumed by: Tasks 2–7.

- [ ] **Step 1: Write failing contract tests**

В `contracts.test.ts` закрепить точные значения:

- evidence grade: `A | B | C`;
- research source type: `official_guide | case_study | public_ad | competitor_landing | wordstat | product | internal`;
- channel: `vk | yandex | telegram | web | internal`;
- hypothesis status: `candidate | proposed | approved | testing | validated | rejected | inconclusive | archived`;
- conversion path: `vk_lead_form | site | message`;
- changed variable: `offer | audience | creative_angle | conversion_path`;
- primary metric: `qualified_lead_cost | sale_cost | romi`;
- experiment status: `draft | awaiting_approval | approved | creating | moderation | scheduled | running | stopping | completed | analyzed | rejected_moderation | invalid_tracking | stopped_safety | failed_reconciliation`;
- variant status: `draft | moderation | scheduled | running | paused | rejected | completed`;
- metric granularity: `hour | day`;
- verdict: `winner | loser | inconclusive | invalid_tracking | stopped_safety`;
- lead classification: `submitted | contacted | qualified | won | lost | open`;
- learning confidence: `low | medium | high`;
- actor kind: `agent | admin | mcp | system | vendor`;
- page contract: `{ items, nextCursor }`, где `nextCursor` равен `string | null`.

- [ ] **Step 2: Write failing schema tests**

В `schema.test.ts` проверить наличие десяти таблиц, внешние ключи и DB-ограничения: SHA-256 fingerprint имеет 64 hex-символа; оценки `impact/confidence/ease/evidenceQuality` лежат в `1..5`; бюджеты и метрики неотрицательны; `periodEnd > periodStart`; version положительный; `ad_metric_snapshots` уникальны по source/object/granularity/period; `ad_command_receipts.idempotency_key` уникален; `ad_experiment_events` и snapshots не имеют колонок update/delete lifecycle.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx tsx --test --test-concurrency=1 src/server/advertising/contracts.test.ts src/server/db/schema.test.ts
```

Expected: FAIL because advertising contracts and schema exports do not exist.

- [ ] **Step 4: Define exact tables and safe DTOs**

В `contracts.ts` экспортировать константы enum values и следующие DTO names: `ResearchSourceCommand`, `MarketSignalCommand`, `HypothesisCommand`, `ExperimentCommand`, `ApprovalCommand`, `VariantBindingCommand`, `MetricSnapshotCommand`, `LeadAttributionCommand`, `ExperimentEventCommand`, `ExperimentVerdictCommand`, `LearningCommand`, `ManualNoteCommand`, `AdsPageInput`.

В схеме использовать UUID PK, `createdAt/updatedAt`, FK с `restrict` для истории и следующие обязательные ключи:

- research source: canonical URL, publisher, source type, channel, published/discovered dates, evidence grade, fingerprint, bounded metadata;
- market signal: source ID, hook, offer, proof, format, CTA, audience, landing URL, disclosed metrics, applicability, evidence grade, fingerprint;
- hypothesis: service/problem/audience/offer/proof/creative angle, conversion path, changed variable, controls, metric rules, budget/duration/stop rules, four priority scores, status, rationale, version;
- experiment: hypothesis ID+version, immutable passport JSON+fingerprint, status, approval fields, approved limits/schedule/KPI/decision rules, spent amount, optional verdict/evidence, version and time bounds;
- variant: experiment ID, role/name, text/creative versions, audience fingerprint, conversion path, nullable VK IDs, status, version;
- metric snapshot: experiment/variant IDs, source/object ID, hour/day granularity, period, normalized spend/impressions/reach/clicks/form opens/leads plus bounded extras;
- lead attribution: internal lead UUID, external lead hash, experiment/variant IDs, CRM receipt IDs, classification, actual/potential amount, safe lost reason code and timestamps, without PII columns;
- event: experiment/variant IDs, actor kind/ID, action/reason, previous/new state, request ID, safe error code and bounded payload;
- learning: conclusion, evidence snapshot, applicability, confidence, review date, optional superseded link, version;
- command receipt: idempotency key, command name, request hash, `processing | completed | failed`, bounded safe result, timestamps.

- [ ] **Step 5: Generate and review migration**

Run:

```bash
yarn db:generate
yarn db:check
```

Expected: `0013_advertising_knowledge.sql` and snapshot are generated; migration contains no credentials, PII columns, destructive statements or unrelated schema changes.

- [ ] **Step 6: Run focused tests and commit**

Run the Task 1 tests with `TEST_DATABASE_URL` when the dedicated `kordev_test` database is available; expect PASS or explicit DB-test skips only when the variable is absent.

```bash
git add src/server/advertising/contracts.ts src/server/advertising/contracts.test.ts src/server/db/schema.ts src/server/db/schema.test.ts drizzle
git commit -m "feat: add advertising knowledge schema"
```

### Task 2: Repository, read models and append-only history

**Files:**
- Create: `src/server/advertising/repository.ts`
- Create: `src/server/advertising/repository.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and command DTOs.
- Produces: `createAdvertisingRepository(db)` and type `AdvertisingRepository`.
- Produces read methods: `getOverview()`, `listResearchSources(filters, page)`, `listMarketSignals(filters, page)`, `listHypotheses(filters, page)`, `getHypothesis(id)`, `listExperiments(filters, page)`, `getExperiment(id)`, `listLearnings(filters, page)`, `listEvents(filters, page)`, `getEconomics(filters)`.
- Produces write primitives used only by `AdvertisingService`: `claimCommand`, `completeCommand`, `failCommand`, `createResearchSource`, `createMarketSignal`, `createHypothesis`, `updateHypothesis`, `createExperiment`, `saveApproval`, `transitionExperiment`, `upsertVariantBinding`, `insertMetricSnapshot`, `upsertLeadAttribution`, `appendEvent`, `finishExperiment`, `createLearning`, `appendManualNote`.

- [ ] **Step 1: Write failing PostgreSQL repository tests**

Проверить cursor pagination и фильтры; дедупликацию source/signal по fingerprint; сортировку новых записей; атомарный `expectedVersion`; append-only snapshots/events; unique metric snapshot; безопасный summary без passport/raw payload; агрегаты spend/clicks/leads/qualified/won/revenue; command receipt claim/replay/conflict under two concurrent calls.

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test npx tsx --test --test-concurrency=1 src/server/advertising/repository.test.ts
```

Expected: FAIL because `createAdvertisingRepository` is missing.

- [ ] **Step 3: Implement repository methods**

Использовать Drizzle transactions for command claim + domain mutation + completed receipt. Cursor кодирует `{createdAt,id}` и валидируется до SQL. Updates hypothesis/experiment/learning include `WHERE id = ? AND version = expectedVersion`; zero returned rows map to domain conflict. Не экспортировать generic table access или delete methods.

- [ ] **Step 4: Run repository tests and verify GREEN**

Expected: all focused DB tests PASS, including simultaneous idempotency claim and stale version.

- [ ] **Step 5: Commit**

```bash
git add src/server/advertising/repository.ts src/server/advertising/repository.test.ts
git commit -m "feat: persist advertising knowledge"
```

### Task 3: Service rules, fingerprints and idempotent commands

**Files:**
- Create: `src/server/advertising/canonical.ts`
- Create: `src/server/advertising/canonical.test.ts`
- Create: `src/server/advertising/service.ts`
- Create: `src/server/advertising/service.test.ts`
- Create: `src/server/advertising/runtime.ts`

**Interfaces:**
- Consumes: `AdvertisingRepository` and Task 1 DTOs.
- Produces: `canonicalJson(value): string`, `sha256Fingerprint(value): string`, `createAdvertisingService(repository)` and `getAdvertisingService()`.
- Produces service methods matching all repository reads plus `createResearchSource`, `createMarketSignal`, `createHypothesis`, `transitionHypothesis`, `createExperiment`, `saveApprovalEnvelope`, `transitionExperiment`, `recordVariantBinding`, `recordMetricSnapshot`, `recordLeadAttribution`, `appendEvent`, `finishExperiment`, `createLearning`, `addManualNote`.
- Every mutation signature ends with `(actor: AdActor, idempotencyKey: string)` and returns a safe DTO suitable for command receipts.

- [ ] **Step 1: Write canonicalization and validation tests**

Закрепить одинаковый SHA-256 для объектов с разным порядком ключей, различный hash при изменении бюджета/оффера/аудитории, rejection non-finite numbers, excessive nesting/arrays/text, unexpected fields, malformed UUID/date/URL/fingerprint, negative budgets and forbidden lead-PII/secret keys including `name`, `phone`, `email`, `file`, `token`, `secret`, `authorization`, `cookie`, `rawResponse` in free-form evidence/payload JSON. Также отклонять email/phone-like значения в evidence, events и manual notes, сохраняя названия компаний/источников только в их типизированных полях.

- [ ] **Step 2: Write lifecycle and idempotency tests**

Проверить:

- hypothesis transitions only along `candidate → proposed → approved → testing → validated|rejected|inconclusive → archived`;
- обычные experiment transitions разрешены только как `draft → awaiting_approval → approved → creating → moderation → scheduled → running → stopping → completed`; `finishExperiment` отдельно выполняет `completed → analyzed` с `winner|loser|inconclusive`, `moderation → rejected_moderation`, `running|stopping → invalid_tracking` с одноимённым verdict, `approved|creating|moderation|scheduled|running|stopping → stopped_safety` с одноимённым verdict либо `creating|moderation|scheduled|running|stopping → failed_reconciliation`; терминальные состояния не имеют исходящих переходов;
- `saveApprovalEnvelope` accepts only `awaiting_approval`, computes fingerprint from the stored passport, requires exact caller fingerprint and atomically changes status to `approved`;
- changing passport/budget/audience after approval has no service method and stale approval fails;
- command replay returns the original safe result without a second repository mutation;
- same idempotency key with another command or request hash throws `ads_idempotency_conflict`;
- stale version returns `ads_hypothesis_conflict`, `ads_experiment_conflict` or `ads_learning_conflict`;
- verdict requires a terminal-compatible status, sample facts and one of the five exact verdict values.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx tsx --test --test-concurrency=1 src/server/advertising/canonical.test.ts src/server/advertising/service.test.ts
```

Expected: FAIL because canonicalization and service do not exist.

- [ ] **Step 4: Implement minimal service**

Validate commands with strict Zod schemas before repository access. Wrap every mutation through one private `executeIdempotent(commandName, payload, actor, idempotencyKey, operation)` path. Store only allowlisted result fields in receipts. Map unknown failures to `ads_unavailable` at HTTP/MCP boundaries; retain exact safe `ads_*` codes for validation/conflict.

- [ ] **Step 5: Run tests and commit**

```bash
git add src/server/advertising/canonical.ts src/server/advertising/canonical.test.ts src/server/advertising/service.ts src/server/advertising/service.test.ts src/server/advertising/runtime.ts
git commit -m "feat: enforce advertising experiment lifecycle"
```

### Task 4: Scoped MCP advertising tools

**Files:**
- Create: `src/server/advertising/mcpService.ts`
- Create: `src/server/advertising/mcpService.test.ts`
- Modify: `src/server/mcp/contracts.ts`
- Modify: `src/server/mcp/runtime.ts`
- Modify: `src/server/mcp/http.ts`
- Modify: `src/server/mcp/http.test.ts`
- Modify: `src/server/mcp/tools.ts`
- Modify: `src/server/mcp/tools.test.ts`
- Modify: `src/server/mcp/tokenService.test.ts`
- Modify: `src/routes/admin/mcp.test.tsx`

**Interfaces:**
- Consumes: Task 3 `AdvertisingService`.
- Produces: `createMcpAdvertisingService(service, tokenId)` and `McpAdvertisingService`.
- Adds scopes `ads:read`, `ads:write` in canonical `MCP_SCOPES` order.
- Produces read tools: `get_ads_overview`, `list_ad_research_sources`, `list_ad_market_signals`, `list_ad_hypotheses`, `get_ad_hypothesis`, `list_ad_experiments`, `get_ad_experiment`, `list_ad_learnings`, `list_ad_events`, `get_ad_economics`.
- Produces write tools: `create_ad_research_source`, `create_ad_market_signal`, `create_ad_hypothesis`, `transition_ad_hypothesis`, `create_ad_experiment`, `save_ad_approval`, `transition_ad_experiment`, `record_ad_variant_binding`, `record_ad_metric_snapshot`, `record_ad_lead_attribution`, `append_ad_event`, `finish_ad_experiment`, `create_ad_learning`.

- [ ] **Step 1: Write failing scope and adapter tests**

Проверить, что `ads:read` показывает только 10 read tools with `readOnlyHint`; `ads:write` alone показывает 0 tools; оба scope показывают read + 13 write tools; никакие content/media/seo/geo tools не появляются; hidden call does not reach service; every write rejects missing/invalid `idempotencyKey` and unknown fields.

- [ ] **Step 2: Add safe schema/error tests**

Проверить limits `1..100`, valid cursor, strict dates/UUIDs/enums, rejection PII/secret JSON keys, audit record with `tokenId/tool/errorCode`, compact summaries in list outputs, bounded safe passport only in `get_ad_experiment`, and absence of contact data, secrets and vendor responses in outputs/errors.

- [ ] **Step 3: Run MCP tests and verify RED**

Run:

```bash
npx tsx --test --test-concurrency=1 src/server/advertising/mcpService.test.ts src/server/mcp/tools.test.ts src/server/mcp/http.test.ts src/server/mcp/tokenService.test.ts src/routes/admin/mcp.test.tsx
```

Expected: FAIL because advertising scopes/services/tools are absent.

- [ ] **Step 4: Implement adapter and tool registration**

Bind actor as `{ kind: "mcp", mcpTokenId: tokenId }`; never accept actor IDs from tool input. Add `adsForToken(tokenId)` to runtime and construct it per authenticated principal in `http.ts`, matching the existing SEO/GEO isolation. Use strict Zod objects, shared page bounds and existing safe MCP result wrapper. Register write tools only when both `ads:read` and `ads:write` are present. `save_ad_approval` only persists an already explicit approval snapshot; it does not call VK.

- [ ] **Step 5: Run tests and commit**

```bash
git add src/server/advertising/mcpService.ts src/server/advertising/mcpService.test.ts src/server/mcp src/routes/admin/mcp.test.tsx
git commit -m "feat: expose advertising knowledge over MCP"
```

### Task 5: Authenticated advertising read loaders

**Files:**
- Create: `src/routes/admin/ads-read.server.ts`
- Create: `src/routes/admin/ads-read.server.test.ts`
- Create: `src/routes/admin/ads-notes.server.ts`
- Create: `src/routes/admin/ads-notes.server.test.ts`

**Interfaces:**
- Consumes: Task 3 service reads and `addManualNote`.
- Produces: `createAdsSectionLoader(section, auth, service)` for `overview | hypotheses | experiments | radar | learnings | economics | events`.
- Produces: `createAdsExperimentLoader(auth, service, idempotencyKeyFactory)` returning a hidden-form `noteIdempotencyKey`, and `createAdsNoteAction(auth, service, config)`.

- [ ] **Step 1: Write failing loader tests**

Для каждого section проверить обязательную admin authentication, `Cache-Control: no-store`, only-needed service calls, bounded cursor/filter parsing, 422 on malformed filters and 503 with generic text on unexpected errors. Serialized JSON must not match contact fields, token/secret/cookie/authorization, full vendor response or internal command receipt.

- [ ] **Step 2: Write failing manual-note action tests**

Проверить same-origin + CSRF, authenticated admin actor, UUID `idempotencyKey` from a hidden form field, note length `1..2000`, optional experiment ID, append-only event `manual_note`, safe 409 conflict and no experiment lifecycle/budget mutation. Experiment loader creates one UUID for the rendered form; browser retry reuses the same request body and key.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx tsx --test --test-concurrency=1 src/routes/admin/ads-read.server.test.ts src/routes/admin/ads-notes.server.test.ts
```

Expected: FAIL because advertising loaders/actions are absent.

- [ ] **Step 4: Implement loaders and note action**

Reuse `requireAdminPage`, `verifyAdminMutationRequest`, `adminHeaders`, CSP nonce and current error-mapping patterns. Do not return or accept any VK control intent. Map admin actor from the authenticated principal, not form fields.

- [ ] **Step 5: Run tests and commit**

```bash
git add src/routes/admin/ads-read.server.ts src/routes/admin/ads-read.server.test.ts src/routes/admin/ads-notes.server.ts src/routes/admin/ads-notes.server.test.ts
git commit -m "feat: add advertising admin read models"
```

### Task 6: Read-only advertising cabinet

**Files:**
- Modify: `src/routes.ts`
- Modify: `src/routes/admin/layout.tsx`
- Modify: `src/routes/admin/layout.test.tsx`
- Create: `src/routes/admin/ads-layout.tsx`
- Create: `src/routes/admin/ads-shared.tsx`
- Create: `src/routes/admin/ads-overview.tsx`
- Create: `src/routes/admin/ads-hypotheses.tsx`
- Create: `src/routes/admin/ads-experiments.tsx`
- Create: `src/routes/admin/ads-experiment.tsx`
- Create: `src/routes/admin/ads-radar.tsx`
- Create: `src/routes/admin/ads-learnings.tsx`
- Create: `src/routes/admin/ads-economics.tsx`
- Create: `src/routes/admin/ads-events.tsx`
- Create: `src/routes/admin/ads-sections.test.tsx`

**Interfaces:**
- Consumes: Task 5 loaders/actions.
- Produces authenticated routes `/admin/ads/`, `/hypotheses/`, `/experiments/`, `/experiments/:id/`, `/radar/`, `/learnings/`, `/economics/`, `/events/` under one secondary navigation.

- [ ] **Step 1: Write failing route and SSR tests**

Проверить все URLs and headings, exactly one active navigation item, empty/loading/error states, visible sample size and limitations beside verdict, economics labels for actual revenue vs potential amount, event audit order, mobile-safe tables and `dd.mm.yyyy` dates.

- [ ] **Step 2: Pin the no-control and no-PII guarantees**

Render representative data and assert HTML contains no contact value and no buttons/labels/intents matching `Запустить`, `Остановить`, `Изменить бюджет`, `Ставка`, `VK API`, `access token`. Единственная форма в разделе эксперимента — «Добавить заметку» with CSRF.

- [ ] **Step 3: Run UI tests and verify RED**

Run:

```bash
npx tsx --test --test-concurrency=1 src/routes/admin/ads-sections.test.tsx src/routes/admin/layout.test.tsx
```

Expected: FAIL because ads routes and sidebar entry are absent.

- [ ] **Step 4: Implement focused pages**

Use existing admin primitives and nested-layout style. Overview shows active experiment state, approved/remaining limits from stored data, last metric timestamp and economics, but no fake score. Detail shows passport fingerprint, approval metadata, variants, metrics, CRM-safe IDs, events and notes. Add sidebar item `Реклама` with a suitable existing Lucide icon.

- [ ] **Step 5: Run tests and commit**

```bash
git add src/routes.ts src/routes/admin/layout.tsx src/routes/admin/layout.test.tsx src/routes/admin/ads-*.tsx src/routes/admin/ads-sections.test.tsx
git commit -m "feat: add advertising knowledge cabinet"
```

### Task 7: End-to-end safety, runbook and release gate

**Files:**
- Create: `src/server/advertising/end-to-end.test.ts`
- Create: `docs/runbooks/advertising-experiment-agent.md`
- Modify: `README.md`
- Modify if required by checks: `tests/ciReleaseGate.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: one tested local flow `research source → signal → hypothesis → experiment → approval snapshot → metric/event → verdict → learning`, visible through MCP and admin without external side effects.
- Produces: operator instructions for scoped token issuance, validation, rotation and explicit boundary before future VK/CRM integration.

- [ ] **Step 1: Write failing end-to-end DB/MCP/admin test**

Using only the dedicated test database and in-memory MCP transport, execute the full local flow twice with replayed idempotency keys. Assert one row per command, exact audit actor, stable fingerprints, stale-write conflict, safe read DTOs, rendered cabinet data, no PII/secrets and zero network calls.

- [ ] **Step 2: Run the end-to-end test and verify RED**

Run:

```bash
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test npx tsx --test --test-concurrency=1 src/server/advertising/end-to-end.test.ts
```

Expected: FAIL until all runtime wiring and routes are complete.

- [ ] **Step 3: Complete runtime wiring and reach GREEN**

Fix only missing composition discovered by the test. Do not add VK/CRM clients, environment variables, schedulers or advertising mutations outside the local knowledge DB.

- [ ] **Step 4: Write the operator runbook**

Document issuing a dedicated MCP token with only `ads:read`/`ads:write`, testing read and candidate creation, revocation/rotation, backup relevance, safe failure codes, idempotency recovery, and the explicit statement: this release cannot launch ads or contact CRM. Do not put a real token, client ID or secret in examples.

- [ ] **Step 5: Run full verification**

Run:

```bash
yarn db:check
yarn typecheck
yarn test
yarn build
git diff --check
git status --short
```

Expected: all commands PASS; `git status` shows only intended tracked work plus the pre-existing untracked `output/` and `tmp/`.

- [ ] **Step 6: Review security and scope**

Search source, built output and fixtures for known real credential/contact strings from the current environment and task history, plus forbidden control labels. Synthetic rejection fixtures are allowed but must never reach stored/read output. Confirm that `ads:read` alone cannot write, current tokens lack ads scopes, all writes require idempotency, admin has no VK control, and no dependency or runtime performs outbound VK/CRM requests.

- [ ] **Step 7: Commit documentation and final verification evidence**

```bash
git add src/server/advertising/end-to-end.test.ts docs/runbooks/advertising-experiment-agent.md README.md tests/ciReleaseGate.test.mjs
git commit -m "docs: add advertising knowledge runbook"
```

Record actual command results in the implementation handoff. Do not mark the full advertising-agent project complete: only the Knowledge foundation stage is complete after this plan.
