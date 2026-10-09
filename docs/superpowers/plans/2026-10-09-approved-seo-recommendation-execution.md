# Approved SEO Recommendation Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исполнять через MCP только точные человечески согласованные SEO-правки, подтверждать результат и сохранять достоверный статус/историю без повторной публикации.

**Architecture:** Расширить существующую рекомендацию структурированным планом и отдельной записью согласования/применения. Защищённое применение использует общий транзакционный writer CMS; отдельное завершение проверяет сохранённую версию и публичный SSR. Существующий heartbeat подключается только после проверенного релиза.

**Tech Stack:** TypeScript, React Router7, PostgreSQL/Drizzle, Zod4, MCP SDK2, node:test/tsx, существующий Cheerio для разбора HTML; новых зависимостей не требуется.

**Spec:** `docs/superpowers/specs/2026-10-09-approved-seo-recommendation-execution-design.md` — согласована владельцем9 октября2026.

## Global Constraints

- `schemaVersion=1`, единственная операция первого релиза — `publish_patch`, размер плана не более256KiB.
- Один уже опубликованный `article`, `case` или `service` на рекомендацию; patch содержит итоговые значения, не произвольные JSON-path-операции.
- Разрешены `title`, `excerpt`, `bodyMd`, `seoTitle`, `seoDescription`, внутренние связи; payload: `h1` для трёх видов, `lead` для услуги, `relatedArticleSlugs` и `primarySeoQuery` для статьи.
- Не менять slug, canonical, indexable, даты, provenance, изображения, robots/sitemap, активное ядро, частотность, бюджеты, расписания и аккаунты; не отправлять на индексацию и не запускать платный сбор.
- История append-only; старое согласование и неизвестная версия не реконструируются. Повтор не создаёт публикацию/версию/SEO-событие повторно.
- «Выполнено» — внедрение и проверка действия, не доказательство роста/индексации. GEO-интервал не чаще одного изменения в14 дней на страницу сохраняется.
- Текущая ветка `codex/seo-full-cycle`, без нового worktree. Поэтапные локальные коммиты; merge/deploy только целого защищённого контракта.
- DB-тесты используют только проверенный выделенный `TEST_DATABASE_URL` с pathname `/kordev_test`; production и его credentials не используются. Пропущенные DB-тесты не считаются приёмкой.

## Review Focus

1. Длинный русский текст и перестановка ключей JSON: одинаковые данные дают одинаковый SHA-256; размер ограничивается UTF-8-байтами, а не символами (Task1).
2. Картинки/видео, добавленные через Markdown, не обходят запрет изменения изображений и медиа (Task1).
3. Удалённая/снятая с публикации связанная цель между просмотром и применением не приводит к битой подтверждённой перелинковке (Task3).
4. Старый кеш, дублированный маркер в пользовательском содержимом или изменение страницы во время HTTP-проверки не дают ложного implemented (Task4).
5. Очередь меняется между страницами чтения: старые accepted не пропускаются из-за дат, offset-сдвига или сброса фильтров; чтения остаются без записей (Task5).

## File and interface map

- `src/server/seo-monitoring/recommendationExecutionPlan.ts`: pure план/patch/хеш/diff, без БД и HTTP.
- `src/server/seo-monitoring/recommendationExecutionRepository.ts`: снимки, согласование, очередь, применение, финальный guarded commit.
- `src/server/seo-monitoring/recommendationExecutionService.ts`: orchestration проверки, критериев и репозитория; не вызывает поисковые API.
- `src/server/seo-monitoring/recommendationExecutionVerification.ts`: bounded HTTP и SSR-проверка с инъекцией fetch для тестов.
- `src/server/admin/contentWrite.ts`: общий writer внутри переданной CMS-транзакции, без своего commit/invalidation.
- `src/components/PublishedContentIdentity.tsx`: один серверный marker-wrapper для трёх публичных видов.
- `src/routes/admin/seo-recommendation-card.tsx`: общий diff/согласование/состояние для существующих двух поверхностей.
- DB-schema/migration, существующие history/service/runtime/MCP/routes: только соединение этих контрактов и закрытие обходов.

Общие типы находятся в `recommendationExecutionPlan.ts`, без импорта серверного crypto в UI:

`ExecutionPlan = {schemaVersion:1; operation:"publish_patch"; contentEntryId:string; baseVersion:number; pagePath:string; baseHash:string; patch:ExecutionPatch; criteria:Array<{id:string;description:string}>}`.

`ExecutionPatch` — strict partial объект разрешённых верхних полей CMS, optional частичный `payload` по allowlist и optional `relations:AdminRelation[]`; отсутствие поля сохраняет прежнее значение. `ExecutionDiff = {fieldPath:string;before:JsonValue;after:JsonValue}`, где отсутствующее значение представляется null для отображения, а не неявной командой удаления. Удаление произвольных payload-полей не поддерживается.

`PublishedSnapshot = {entry:JsonPublishedEntry; relations:AdminRelation[]; mediaRefs:AdminMediaRef[]; publicContract:{url:string;canonical:string;indexable:boolean;title:string;h1:string;description:string}}`. Даты сериализуются ISO, связи/refs нормализуются в установленном порядке до хеширования. Исходный снимок включает неизменяемые поля и provenance.

`JsonPublishedEntry` — точная JSON-safe форма `ContentEntry` с kind article/case/service, status published, датами ISO/null; не произвольный клиентский Record. `JsonValue` — конечный plain JSON. `SeoChangeRow = typeof seoChanges.$inferSelect`.

`ExecutionCommand = {recommendationId:string;executionId:string;expectedUpdatedAt:string}`.

`CriterionEvidence = {criterionId:string;excerpt:string;sourceUrl:string}`; `CompleteExecutionCommand = ExecutionCommand & {criteriaEvidence:CriterionEvidence[]}`.

`PublicExecutionProof = {checkedAt:string;url:string;httpStatus:200;responseSha256:string;contentEntryId:string;contentVersion:number;contentHash:string;checks:{identity:true;metadata:true;canonical:true;robots:true;criteria:true};criteriaEvidence:CriterionEvidence[]}`. Proof создаёт только server verifier; MCP принимает evidence, но никогда готовый proof/checkedAt/hash.

`RecommendationWork = {recommendation;execution;currentPage;state:"blocked"|"ready"|"applied"|"completed";errorCode:string|null}`. Запись execution содержит frozen approval, applied result, последнюю попытку проверки и финальное completion; nullable поля не выдаются за успех.

`WorkPageInput = {limit?:number;cursor?:string|null}` и `WorkPage = {items:WorkSummary[];nextCursor:string|null}`. `WorkSummary = {recommendationId:string;title:string;updatedAt:string;pagePath:string|null;executionId:string|null;state:RecommendationWork["state"];errorCode:string|null}` не содержит больших before/after тел; get возвращает полный снимок. Точные recommendation/execution-типы выводятся из schema, currentPage — PublishedSnapshot|null.

### Task 1: Typed execution plan and exact patch

**Files:** Create `recommendationExecutionPlan.ts`, `recommendationExecutionPlan.test.ts`; существующие `src/server/content/types.ts`/`src/server/admin/contentSchemas.ts` использовать без расширения публичной модели.

**Interfaces:** `parseExecutionPlan(value:unknown):ExecutionPlan`; `hashExecutionJson(value:unknown):string`; `prepareExecutionPatch(base:PublishedSnapshot,plan:ExecutionPlan):{command:AdminContentCommand;diff:ExecutionDiff[]}`. Итоговый resultHash вычисляется по фактически сохранённому снимку после writer, не по выдуманному будущему updatedAt. UI использует только `import type`; готовый diff формирует loader на сервере, crypto/DB не входят в клиентский bundle.

- [ ] Написать RED-тесты `plan_enforces_262144_utf8_bytes`, `hash_is_stable_for_cyrillic_and_key_order`, `patch_rejects_forbidden_and_prototype_fields`, `patch_preserves_unmentioned_payload_provenance_and_dates`, `noop_patch_is_not_a_publication`. Assert: `hash({a:1,b:2}) === hash({b:2,a:1})`, но перестановка массива меняет хеш; plan263KiB отклоняется безопасным `seo_execution_plan_invalid`.
- [ ] Добавить RED `markdown_media_cannot_expand_approval`: неизменённые существующие медиа допустимы, добавление/удаление/смена Markdown image/reference-image, video-link или HTML media через bodyMd запрещены. Сравнивать фактически рендеримые медиа посредством существующего Markdown pipeline/AST, не одного regex.
- [ ] Выполнить `yarn tsx --test --test-concurrency=1 src/server/seo-monitoring/recommendationExecutionPlan.test.ts`; подтвердить отказ из-за отсутствующей реализации/ожидаемого поведения, не ошибку окружения.
- [ ] Реализовать strict allowlist, 1..20 критериев с уникальными id/описанием, finite plain JSON без undefined/function/Date/prototype-ключей, установленную нормализацию снимков и существующую CMS-валидацию итогового command. Хеш не включает поля времени попыток/verification; frozen approval хранит конкретный принятый снимок карточки.
- [ ] Повторить команду до PASS, затем `git diff --check` и commit `feat(seo): validate exact recommendation execution plans`.

### Task 2: Human approval, immutable execution ledger and history guards

**Files:** Modify `src/server/db/schema.ts`, `src/server/seo-monitoring/recommendationHistory.ts`, его `.test.ts`, `src/server/seo-monitoring/repository.ts`, `service.ts`; Create `recommendationExecutionRepository.ts`, `.test.ts`; Generate следующую свободную миграцию `drizzle/0024_seo_recommendation_executions.sql` и соответствующие meta. Если номер уже занят, не перезаписывать, выбрать следующий.

**Interfaces:** `createRecommendationExecutionRepository(db)` produces `readPublishedSnapshot(id):Promise<PublishedSnapshot>`, `approve(input:{recommendationId;expectedUpdatedAt;expectedBaseVersion?;expectedBaseHash?},actor:{adminUserId:string}):Promise<RecommendationWork>`, `get(id):Promise<RecommendationWork>`. `approve` вызывается только cookie-auth admin action, не MCP adapter. `revise` получает optional `executionPlan?:ExecutionPlan|null`; отсутствие сохраняет план, null явно снимает его с историей.

- [ ] Написать DB RED `acceptance_atomically_freezes_human_card_and_page`, `stale_acceptance_fails_without_status_or_history_write`, `mcp_status_acceptance_is_not_human_authority`, `old_accepted_is_blocked`, `reapproval_preserves_previous_approval`, `changed_card_or_page_blocks_execution`, `generic_status_revision_and_reconcile_cannot_implement`. Assert: accepted без плана не создаёт execution; accepted с планом создаёт ровно1 execution и связанное событие принятия; повторное согласование после applied отклоняется.
- [ ] Запустить `yarn tsx --test --test-concurrency=1 src/server/seo-monitoring/recommendationExecutionRepository.test.ts src/server/seo-monitoring/recommendationHistory.test.ts` с действующим test fixture; убедиться, что новые DB-кейсы реально запущены и RED.
- [ ] Добавить nullable `executionPlan` в рекомендации и ledger с unique approvalHistoryId, frozen recommendation/page/plan/hash, admin/time, supersededAt, applied result/version/hash/CMS event/token/time, lastVerificationAttempt, completion/evidenceHash/time. FK сохраняют историю; check constraints исключают partial applied/completion без обязательных доказательств. Не backfill legacy-approval.
- [ ] Реализовать согласование/повторное согласование одним transaction; guards updatedAt/pageVersion/baseHash. Revision/dedup-refresh сохраняют plan и делают старое согласование непригодным при изменении карточки; accepted не сбрасывается автоматически. Закрыть implemented во всех общих mutators, разрешив неизменный implemented при уточнении исторических доказательств. Расширить history eventType check значениями `approval`, `execution_applied`, `execution_verified`, `execution_failed`: их время — фактическое время операции. Применение и неудачная проверка пишут ledger/history, но не меняют семантическую версию принятой карточки/её updatedAt и не инвалидируют собственное согласование. Completion меняет статус/updatedAt и сохраняет старый approval snapshot.
- [ ] Выполнить DB-команду до PASS и `yarn db:check`, `git diff --check`; commit `feat(seo): bind execution to immutable human approvals`.

### Task 3: Atomic CMS application and recovery

**Files:** Create `src/server/admin/contentWrite.ts`, `.test.ts`; Modify `src/server/admin/contentRepository.ts`, `src/server/content/publicationLifecycle.ts`/`.test.ts`, `recommendationExecutionRepository.ts`/`.test.ts`.

**Interfaces:** `saveContentInTransaction(tx,command:AdminContentCommand,actor:{adminUserId?:string;mcpTokenId?:string}):Promise<{entry:ContentEntry;publicationChanges:SeoChangeRow[]}>`; существующий admin save остаётся обёрткой с собственной transaction. Execution repository adds `apply(command:ExecutionCommand,actor:{mcpTokenId:string}):Promise<{work:RecommendationWork;unchanged:boolean}>`. Инвалидация штатных кешей вызывается после commit, включая безопасное восстановление потерянного ответа.

- [ ] Написать RED `apply_publishes_exact_patch_and_records_its_cms_change_once`, `publication_failure_rolls_back_execution_revision_relations_and_change`, `concurrent_apply_has_one_version_and_event`, `lost_response_replay_returns_saved_application`, `two_approvals_on_one_base_version_cannot_both_apply`. Assert: contentVersion увеличилась ровнона1, один CMS-event новой версии, no direct manual record_seo_change.
- [ ] Добавить RED `unpublished_relation_target_blocks_apply`, `later_manual_edit_does_not_republish_or_claim_current_success`, `geo_page_interval_cannot_be_bypassed_by_another_prompt_set`, `unapproved_linked_geo_experiment_cannot_execute`. GEO last implementation проверяется по всем наборам/статусам на странице, включая сохранённые исполнения/журнал изменений. Связанный GEO-эксперимент требует уже имеющегося человеческого утверждения и сохранённых совместимых baseline-гейтов; недостаточное/неизвестное основание блокирует. Не создавать/утверждать GEO-эксперимент этим методом.
- [ ] Выполнить `yarn tsx --test --test-concurrency=1 src/server/admin/contentWrite.test.ts src/server/seo-monitoring/recommendationExecutionRepository.test.ts src/server/content/publicationLifecycle.test.ts`; подтвердить RED.
- [ ] Выделить общий writer без копирования CMS-validation/provenance/revisions/relations. Publication lifecycle возвращает свои фактически вставленные события; MCP-исполнение записывает actorMcpTokenId, не выдаёт владельца токена за клик человека. Установить порядок locks: recommendation → execution → все участвующие content rows по UUID; перечитать актуальные related targets под locks. Применить только plan из ledger и сохранить applied result в той же transaction. Replay сверяет актуальность и возвращает сохранённый результат, не вызывает writer второй раз.
- [ ] Выполнить указанную suite и существующие `src/server/admin/contentRepository.test.ts`, `src/server/admin/contentService.test.ts` до PASS; `git diff --check`; commit `feat(seo): apply approved patches atomically through CMS`.

### Task 4: Public verification and protected implemented

**Files:** Create `recommendationExecutionVerification.ts`, `.test.ts`, `recommendationExecutionService.ts`, `.test.ts`, `src/components/PublishedContentIdentity.tsx`; Modify `src/routes/blog-post.tsx`, `case.tsx`, `content-page.tsx`, execution repository; Test `tests/ssr/seoParity.test.ts` и новый `tests/ssr/publicationIdentity.test.tsx`.

**Interfaces:** `verifyPublishedExecution(input:{snapshot:PublishedSnapshot;criteriaEvidence:CriterionEvidence[];criteria:ExecutionPlan["criteria"]},fetcher:typeof fetch):Promise<PublicExecutionProof>`; `createRecommendationExecutionService(repository,{verify,invalidate})` exposes `apply(command,actor)`, `complete(command:CompleteExecutionCommand,actor):Promise<{work;unchanged:boolean}>`. Repository adds `completeVerified(command,proof,actor)` с повторными locks/guards, `recordVerificationFailure(command,errorCode,actor)` без изменения публикации/status.

- [ ] Написать RED HTTP/DB/SSR: `matching_public_version_completes_once`, `old_cache_or_duplicate_identity_marker_fails`, `external_redirect_credentials_or_query_are_rejected`, `stream_limit_timeout_and_retry_are_bounded`, `page_changed_during_verification_cannot_complete`, `missing_or_fabricated_criterion_excerpt_fails`, `wrong_change_id_cannot_complete`, `failed_verification_preserves_accepted_and_applied_result`, `metadata_entities_and_payload_h1_follow_actual_presenter`. Assert: generic status остаётся запрещённым; identical completion replay не создаёт event и не повторяет HTTP.
- [ ] Запустить `yarn tsx --test --test-concurrency=1 src/server/seo-monitoring/recommendationExecutionVerification.test.ts src/server/seo-monitoring/recommendationExecutionService.test.ts tests/ssr/publicationIdentity.test.tsx`; подтвердить RED.
- [ ] Добавить marker-wrapper с серверными `data-kordev-content-entry-id`/`data-kordev-content-version` на actual article/case/service render. Другие page/FAQ не менять; существующие layout/semantic tags не дублировать. Identity поступает из той же entry, что presentation; не из payload.
- [ ] Реализовать fetch только `https://kordev.team` + согласованный path; manual same-origin redirect максимум3, total timeout10s, stream максимум2MiB, без auth/cookies. Cheerio требует единственный доверенный root marker, точную версию/id, HTTP200/finalURL, ожидаемые title/H1/description и исходный canonical/indexable, учитывая X-Robots-Tag. Все criteriaEvidence имеют уникальные известные id, sourceUrl=approved public URL, непустую выдержку≤2000 символов, реально присутствующую в нормализованном тексте соответствующего публичного root. Никаких исполняемых инструкций из HTML.
- [ ] Завершать только связанную applied execution: proof получает серверные checkedAt/responseSHA/фактические результаты. После сетевого чтения повторно проверить card/page/ledger и атомарно записать completion+implemented+history. Идентичность replay — хеш command/evidence; противоречащий повтор не перезаписывает proof. Сохранять безопасную последнюю неудачную попытку отдельно от достоверного applied/completed результата.
- [ ] Повторить suite плюс `tests/ssr/seoParity.test.ts` до PASS; `git diff --check`; commit `feat(seo): verify published executions before completion`.

### Task 5: MCP reads, execution tools and authorization

**Files:** Modify `src/server/seo-monitoring/mcpService.ts`/`.test.ts`, `runtime.ts`, `src/server/mcp/tools.ts`/`.test.ts`, `runtime.ts`, `http.test.ts`; execution repository/service tests.

**Interfaces:** repository/service add `list(input:WorkPageInput):Promise<WorkPage>`; MCP exposes `listRecommendationWork(input)`, `getRecommendationWork({recommendationId})`, `applyRecommendation(command)`, `completeRecommendation(command)`. Tool names строго как в spec: `list_seo_recommendation_work`, `get_seo_recommendation_work`, `apply_seo_recommendation`, `complete_seo_recommendation`.

- [ ] Написать RED `old_accepted_queue_is_date_independent_and_read_only`, `keyset_queue_does_not_skip_after_status_change`, `invalid_cursor_cannot_cross_query`, `tool_scopes_enforce_content_publish`, `mcp_cannot_invent_admin_approval_or_replace_patch`, `revise_plan_keeps_evidence_limit_separate`. Assert: readonly token не видит write-tools; seo:write без content:publish не получает apply; mutation payload с snapshot/actor/URL/changeId отклоняется strict schema.
- [ ] Выполнить `yarn tsx --test --test-concurrency=1 src/server/mcp/tools.test.ts src/server/mcp/http.test.ts src/server/seo-monitoring/mcpService.test.ts src/server/seo-monitoring/recommendationExecutionRepository.test.ts`; подтвердить RED.
- [ ] Реализовать bounded limit1..100/default25 и keyset cursor по неизменяемым createdAt/id рекомендации (opaque strict base64url с точным PostgreSQL timestamp, без потери микросекунд). Очередь accepted включает blocked legacy и applied; get может прочитать completed для recovery. Даты создания не являются фильтром пригодности.
- [ ] Подключить execution service через runtime без provider dependencies. Reads: seo:read+content:read; apply: также seo:write+content:write+content:publish; complete: seo:read+seo:write+content:read. Actor только из authenticated principal. Добавить безопасные русские сообщения conflict/approval_required/unsupported/verification_failed, не raw stack/HTML/секреты. Existing tools и scopes сохраняются, implemented bypass остаётся закрытым.
- [ ] Повторить suite до PASS; `yarn typecheck`, `git diff --check`; commit `feat(mcp): expose protected SEO recommendation work`.

### Task 6: Owner-facing diff, approval and recovery UI

**Files:** Create `src/routes/admin/seo-recommendation-card.tsx`, `.test.tsx`; Modify `src/routes/admin/seo.tsx`, `seo-changes.tsx`, `seo.server.ts`, их route/UI tests, `seo-recommendation-history.tsx`/`.test.tsx`.

**Interfaces:** shared `SeoRecommendationCard({recommendation,work,csrfToken})`; existing loader reads bounded approval preview/work, action adds explicit human approve/reapprove dispatch using Task2 API. Generic reject остаётся guarded status action. Скрытые поля approval: expectedUpdatedAt/baseVersion/baseHash; actor никогда не берётся из form.

- [ ] Написать RED `both_surfaces_show_full_reviewable_diff_and_publication_consent`, `stale_form_cannot_approve_new_text`, `unsupported_accepted_has_no_auto_publish_promise`, `reapproval_requires_explicit_click_and_is_hidden_after_apply`, `applied_unverified_is_not_done`, `rejection_does_not_execute`. Assert exact copy: «Принять — разрешить агенту применить эти изменения и опубликовать их при следующем запуске» только для supported plan.
- [ ] Выполнить `yarn tsx --test --test-concurrency=1 src/routes/admin/seo-recommendation-card.test.tsx src/routes/admin/seo-changes.ui.test.tsx src/routes/admin/seo-recommendation-history.test.tsx`; подтвердить RED.
- [ ] Реализовать общий компонент с collapsed/expanded diff без скрытой подмены/усечения согласуемого значения, page/version, blocked reason, applied/completed facts и journal link. Сохранить таблицу изменений, её фильтры/пагинацию и историю. Устаревший submitted form не очищать и не принимать заново автоматически; показать понятный конфликт и свежую карточку.
- [ ] Повторить UI/route suite до PASS, локально проверить русский длинный diff, мобильную ширину и историю браузера; `git diff --check`; commit `feat(admin): review and approve exact SEO changes`.

### Task 7: Acceptance, immutable release and existing heartbeat

**Files:** Create `docs/runbooks/approved-seo-recommendation-execution.md`, `docs/runbooks/approved-seo-recommendation-execution-release-2026-10-09.md`; Modify `docs/runbooks/seo-recommendation-history.md`, `docs/operations/seo-geo-automation-prompt.md`; существующую automation `seo` обновлять только штатным automation_update после релиза, не прямой правкой TOML.

**Interfaces:** consume Tasks1–6; новая automation не создаётся. Release использует `.github/workflows/docker-build.yml` и существующий immutable deployment, не отдельный deploy script без проверки.

- [ ] Выполнить полный `yarn test` с CI-equivalent локальными fixtures, затем последовательно `yarn typecheck`, `yarn build`, `yarn db:check`, `git diff --check`. Не запускать build параллельно suite. Зафиксировать actual passed/skipped/failed; новые DB-тесты должны быть executed, не skipped.
- [ ] Независимый whole-branch reviewer проверяет spec/plan/diff, реальные тесты и обходы согласования/implemented, включая generic routes/CLI, акторов, recovery/HTTP и неподдерживаемые поля. На конкретные findings — RED regression, исправление, повторная приёмка; не переносить известную безопасность «на потом».
- [ ] Сохранить secret-free baseline prod revision/content/core/SEO/GEO/recommendations без provider calls; проверить чистоту ветки и отсутствие unrelated edits. Merge/push штатно после review и успешных проверок; CI должен завершиться success на точном release SHA. Deploy dispatch только штатного main workflow с его защищёнными артефактами/backup/gates.
- [ ] Независимо проверить sole exact current-slot marker, regular non-symlink0600 slot record, immutable digest и совпадение Config.Image/imageID/OCI revision/checkout, health, миграцию и публичные SSR smoke-checks. Content/core/raw observations и legacy recommendations не должны измениться из-за миграции/deploy. Не создавать prod тестовую публикацию или согласование; marked lead допускается только существующим deploy gate.
- [ ] Проверить через существующую авторизацию MCP discovery и readonly work/get, scopes нового apply без записи. Если клиентская схема/права недоступны, не расширять их автоматически и не включать исполнение обходным способом; сообщить требуемое действие владельца.
- [ ] Обновить prompt существующего `seo` с narrow exception для пригодного human approval/exact patch: list/get → apply → verify/complete, applied recovery без republish, no generic publish/status, safe blockers и недублируемые уведомления. Сохранить расписание/чат/модель/статус/лимиты, независимый SEO/audit/evaluation/GEO и запреты бюджетов/индексирования. Прочитать обратно prompt и остальные поля; не запускать повторный провайдерский сбор для проверки prompt.
- [ ] Записать actual SHA/CI/deploy/проверки и оставшиеся ограничения в release runbook; не объявлять работу задеплоенной/выполненной раньше подтверждений. Commit документов/evidence отдельно без лишнего deploy, если application bytes не менялись.

## Self-review and handoff

Spec coverage: plan/allowlist→Task1; human consent/history→Task2; atomic CMS/recovery/GEO interval→Task3; public verification/implemented→Task4; paginated MCP/scopes→Task5; diff/reapproval→Task6; monitoring/limits/release→Task7. Все пять Review Focus привязаны к конкретным RED-тестам. До подтверждения этого плана реализация не начинается.

Рекомендуемый метод — **Native**: один исполнитель в этой сессии, последовательные проверяемые коммиты и один независимый review всего изменения перед merge/deploy. Эти задачи тесно связаны общими transaction/types/approval guards; отдельный implementer на каждый шаг добавил бы передачу контекста без изоляции риска.
