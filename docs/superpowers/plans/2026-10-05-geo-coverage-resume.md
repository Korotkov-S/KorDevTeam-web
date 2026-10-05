# GEO coverage and resume Implementation Plan

Статус 05.10.2026: задачи 1–4 реализованы и проверены, финальное независимое ревью закрыто исправлениями. Основная поставка — отдельный GEO-коммит; итоговый коммит исправляет замечания обеих поставок. Тестируются протокольные helpers, а не текст инструкции агента: фактическое выполнение инструкции требует проверки после деплоя. Новые циклы здоровых платформ разрешены после их полного прохождения со следующего дня даже при блокировке другой платформы; неполная история остаётся отдельной и требует корректной интерпретации. Полный финальный прогон: 1249 passed / 2 environment skips; typecheck/build/db:check успешны. Деплой и переключение автоматизации пока не выполнены. Исходные процедурные чекбоксы ниже не являются журналом фактического порядка действий.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; delegation requires the user's choice.

**Goal:** Покрывать все активные GEO-вопросы и продолжать недостающие повторения без блокировки остальных платформ.

**Architecture:** PostgreSQL хранит очередь покрытия, lease, совместимость run и дневные резервирования отправок. MCP выдаёт задания и продолжение, агент получает реальные ответы в официальном браузерном UI; админка показывает охват и препятствия.

**Tech Stack:** Existing TypeScript/PostgreSQL/Drizzle/MCP/React Router. No new AI API or dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-seo-geo-resume-design.md`, раздел GEO. Независим от запуска платного SEO; выпуск после SEO plan допускается, общие schema/migration edits выполняются последовательно.

## Global Constraints

- Все 38 активных вопросов: RU, RU-MOW, RU-SPE; четыре официальные платформы, live_ui, ru.
- До шести разных вопросов и 18 отправок суммарно за московский день; повторы расходуют тот же лимит.
- Три независимых ответа на вопрос; продолжение до 24h только при одинаковой персонализации/поверхности/регионе.
- Полное покрытие 456 отправок: минимум 26 дней, цель 28 при доступности платформ, не неделя.
- Никакого обхода CAPTCHA, новых входов/настроек аккаунтов, скрейпинга или фиктивных отрицательных ответов.
- SEO/GSC ошибка не отменяет GEO; контент и эксперименты не утверждаются автоматически.

## Review Focus

- Два исполнителя/истёкшая lease: только один получает право отправки и запись в run (tasks 1–2).
- Подтверждение отправки/ответ потерян: бюджет уже зарезервирован, наблюдение не выдумывается (task 2).
- Смена персонализации/истёкший run: новая тройка, старые ответы не копируются (tasks 1–2).
- Архивация человеком посреди coverage cycle: задание отменяется с причиной, охват не рисуется полным (task 1).
- Платформа постоянно blocked: backoff и fallback без голодания прочих платформ/регионов (tasks 1, 3).

## Task 1: Coverage queue, leases and budget

**Files:** Create `src/server/geo-monitoring/coverage.ts`, `coverage.test.ts`, `queueRepository.ts`, `queueRepository.test.ts`; modify `src/server/db/schema.ts`, `schema.test.ts`, `testDatabase.ts`, migration journal/snapshot; add `drizzle/0018_geo_coverage_queue.sql` if task 1 SEO migration occupies 0017 (otherwise use next free sequential number and adjust restore history).

**Interfaces:** `GeoQueueItem` contains id/cycleId/promptId/platform/surface/mode/language/region, state, runId, completedRepetitions, attempts, nextAttemptAt, errorCode, leaseOwner/leaseExpiresAt. Queue states queued/running/retry_wait/blocked/complete/cancelled. Cycle snapshots active prompt IDs and supported four-platform combinations; queue key unique cycle/platform/surface/mode/language/region/prompt.

Export `createGeoQueueRepository(db)` with `listQueue(filters):Promise<{items,nextCursor,coverage}>`, `claimWork({tokenId,now,limit:6}):Promise<GeoWork[]>`, `reserveAttempt({runId,promptId,repetition,tokenId,leaseId,now}):Promise<{attemptId:string}>`, `releaseWork({leaseId,tokenId,errorCode,nextAttemptAt})`, `resumeRun({runId,tokenId,sessionPersonalized,now}):Promise<GeoResumeState>` and `recordAttemptResult({attemptId,observationId|null,tokenId})`. `GeoWork` includes leaseId/runId/platform/surface/mode/language/region/prompts with missing repetitions/deadline; omits private snapshots. Lease 15 minutes; active executor renews before expiry via `renewLease(leaseId,tokenId,now)`; expired lease never grants write authority. Select oldest eligible unfinished, never measured, then oldest complete; group by homogeneous run dimensions, at most six questions total per day.

- [ ] Write DB tests: 38×4=152 queue combinations, all three regions; atomic competing claim; lease expiry rejects original holder; reserve 19th daily sending fails; seventh new question fails; same-question retries consume sending budget; next Moscow day resets budget, not run deadline; archived question cancelled with incomplete cycle; blocked platform does not starve others.
- [ ] Run `npx tsx --test src/server/geo-monitoring/coverage.test.ts src/server/geo-monitoring/queueRepository.test.ts` with isolated TEST_DATABASE_URL and observe red.
- [ ] Implement transactions/advisory budget lock, cycle snapshot and additive schema. Store personalization baseline on first successful observation, not in free-form metadata. Budget counts every possible sending, including lost/failed response.
- [ ] Repeat DB tests and restore-history test; verify old runs/observations unchanged and no auto-activation of prompts.
- [ ] Commit: `feat: persist GEO coverage queue and sending limits`.

## Task 2: MCP-owned continuation and attempt recording

**Files:** Modify `src/server/geo-monitoring/contracts.ts`, `service.ts`, `service.test.ts`, `repository.ts`, `repository.test.ts`, `runtime.ts`, `mcpService.ts`, `mcpService.test.ts`, `src/server/mcp/tools.ts`, `tools.test.ts`.

**Interfaces:** Add MCP `list_geo_collection_queue` (seo:read; filters platform/region/status/cursor/limit), `claim_geo_collection_work` (seo:write; limit 1..6), `reserve_geo_attempt` (seo:write; runId/promptId/repetition/leaseId), `resume_geo_run` (seo:write; runId/sessionPersonalized), `renew_geo_collection_lease` (seo:write; leaseId), `defer_geo_collection_work` (seo:write; leaseId/safe error code). Principal supplied by MCP context, never caller input. `record_geo_observation` accepts attemptId/leaseId for new queue-managed runs; `finish_geo_run` derives exact counters and updates queue atomically. Legacy finished runs remain immutable; legacy interrupted runs with no queue may be read, not silently reopened.

New live_ui start_geo_run registers managed work; managed observation requires reservation/valid ownership. Older finished historical records need no backfilled attempt. Existing idempotent repetition recording stays idempotent; a second reservation represents a genuinely retried sending, not duplicate bookkeeping. Response received after losing lease stays unrecorded until same-owner controlled reconciliation, never written by another principal.

- [ ] Write tests: 2/3 resumes only repetition 3; success requires all three; foreign token cannot read private continuation/write/resume; revoked token rejected; repeated record stores one observation; older-than-24h or changed personalization creates linked fresh run with zero copied answers; expired lease cannot reserve/write; false zero observation rejected when no factual answer; tool scope/read lists match.
- [ ] Run targeted geo service/repository/MCP tests and `npx tsx --test src/server/mcp/tools.test.ts`; watch new behavior fail before code.
- [ ] Implement validated strict tool schemas, server-derived deadlines/counters and queue-run transitions. New run reference records previous attempt without converting it into complete history.
- [ ] Repeat tests; verify UI evidence permission unchanged and no operation IDs/tokens/private snapshots in queue output.
- [ ] Commit: `feat: add safe GEO continuation tools`.

## Task 3: Independent agent protocol and platform fallback

**Files:** Create `docs/operations/geo-collection-protocol.md`, `src/server/geo-monitoring/collectionProtocol.test.ts`; update conflicting `docs/superpowers/specs/2026-10-03-geo-unattended-collection-design.md` with explicit superseded live_ui section, `deploy/README.md`. Saved seo automation is updated through automation_update only after compatible MCP is deployed; preserve schedule/name/notification policy.

**Interfaces:** Protocol uses task 2 tools: read queue→claim→resume if compatible→reserve attempt→one independent factual UI response→record→finish/defer. Normalize surfaces alice_web/google_ai_mode/bing_copilot_search/chatgpt_search_web, not arbitrary strings. Stop at total 18 sends/6 questions; same-day blocked fallback can change platform and region in separate runs. Temporary UI unavailability schedules retries after 30 and 120 minutes (maximum three availability attempts in 24h); auth/CAPTCHA/confirmation requires user action, no bypass. Update the single existing-thread seo heartbeat to wake at 09:00, 09:30, 11:00 and 11:30 Europe/Moscow. Only the first daily pass refreshes free SEO sources; later passes handle due GEO work only, never another paid rank plan. A due-time check and durable leases make extra wakes no-ops; failed SEO does not skip GEO. No new standalone chats or paid provider.

- [ ] Write protocol tests using fixture planner/queue, asserting GSC failure leaves GEO eligible; blocked Alice permits Google/Bing/ChatGPT; exact surfaces and all regions; no weekly coverage promise; remaining-answer selection; factual attempt budget, no scraper/API substitute; later daily wakes skip SEO refresh and only select already-due work.
- [ ] Run `npx tsx --test src/server/geo-monitoring/collectionProtocol.test.ts` and coverage tests; confirm red.
- [ ] Implement required small protocol helpers in coverage.ts, write operator guide and update stale API-only guidance. Prepare cohesive replacement automation prompt preserving existing SEO SSH/security/paid exclusion and analysis restrictions; do not execute remote requests during tests.
- [ ] Repeat fixtures; only after requested deployment use automation_update with resolved id seo and full preserved fields. Verify saved prompt reads current queue, never silently skips GEO after a failed SEO source, and reports meaningful blocks only.
- [ ] Commit: `docs: align GEO collection with durable continuation`.

## Task 4: Coverage UI and verification

**Files:** Modify `src/routes/admin/geo-read.server.ts`, `geo-shared.tsx`, `geo-sections.test.tsx`, `seo-ai-visibility.tsx`; add `geo-collection-progress.tsx`, `geo-collection-progress.test.tsx`; modify geo service/queue read tests as needed.

**Interfaces:** platforms/prompts views include `collectionQueue` and cycle coverage returned by task 1; component consumes public queue fields only. Show checked/planned/remaining/blocked, question+platform+region, last/next attempt, actual run window and coverage goal. Missing data is «не проверено», not zero visibility.

- [ ] Write UI tests: old 2/3 Alice displays partial and missing repetition; 0 stored failed is no data; regions all present; blocked auth says action required; dates дд.мм.гггг and Moscow times; complete run percentage requires actual three observations; no private evidence leaks.
- [ ] Run `npx tsx --test src/routes/admin/geo-sections.test.tsx src/routes/admin/geo-collection-progress.test.tsx`; observe red, implement components/read integration, repeat green.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run db:check` with DB tests enabled, plus `git diff --check`; report all failures/skips.
- [ ] Commit: `feat: expose GEO coverage and retry progress`.

## Delivery gate

Review full diff and migrations; browser availability is not guaranteed by queue implementation. Do not call paid APIs, create false observations or claim fixed live collection from fixture tests. After requested deployment verify MCP schemas/scopes and UI against an empty or legacy queue before running a real authorized controlled-answer batch. Compare only full compatible runs after enough history.
