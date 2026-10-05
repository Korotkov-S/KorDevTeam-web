# SEO rank resume Implementation Plan

Статус 05.10.2026: задачи 1–4 реализованы и проверены, финальное независимое ревью закрыто исправлениями. Основная поставка — отдельный SEO-коммит, а не четыре промежуточных: это сохраняет согласованность схемы, но укрупняет откат. Дополнительные helper-тесты частично написаны после реализации — универсальная RED-first гарантия не заявляется; сбойные сценарии воспроизведены RED→GREEN. Полный финальный прогон: 1249 passed / 2 environment skips; typecheck/build/db:check успешны. Деплой и установка таймера пока не выполнены. Исходные процедурные чекбоксы ниже не являются журналом фактического порядка действий.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; delegation requires the user's choice.

**Goal:** Продолжать известные незавершённые поисковые операции без повторной оплаты успешных запросов и явно показывать неполноту.

**Architecture:** PostgreSQL хранит неизменяемый недельный план, задания и резерв платных попыток. Collector выполняет ограниченный проход, recovery timer продолжает только существующий план, CLI различает полный успех и незавершённую работу.

**Tech Stack:** TypeScript, Node test/tsx, PostgreSQL, Drizzle, React Router, systemd. Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-10-05-seo-geo-resume-design.md`, раздел SEO.

## Global Constraints

- Новые планы раз в неделю; 1000 потенциально платных POST-попыток за московский день; целые матрицы запросов.
- POST только 00:30–06:00 Europe/Moscow; продолжение плана до 48 часов; checked_at всегда фактический.
- Четыре попытки стадии, задержки 10/30/120 минут; Retry-After не сокращается; pending GET каждые две минуты.
- Неоднозначный POST — blocked, не повтор. Идемпотентность внешнего API не предполагается.
- История не удаляется. Старые partial без operation_id: legacy_resume_unavailable, без автоматического POST.
- Никаких paid live-тестов, изменений контента и секретов в выводе.

## Review Focus

- Авария после внешнего ответа до записи ID: submitting становится uncertain, а не queued (task 2).
- Повтор на следующий московский день: бюджет меняется, окно исходного плана не обнуляется (tasks 1–2).
- Другой процесс/изменение ядра: advisory lock и frozen plan предотвращают дубли (tasks 1–2).
- Результат сохранён, отметка задания прервалась: одна транзакция и идемпотентность (task 1).
- Recovery вне ночного окна и legacy partial: GET разрешён, новый POST/план запрещён (tasks 2–3).

## Task 1: Durable plan repository

**Files:** Create `src/server/seo-monitoring/rankQueue.ts`, `rankQueue.test.ts`, `rankQueueRepository.ts`, `rankQueueRepository.test.ts`, `drizzle/0017_seo_rank_queue.sql`; modify `src/server/db/schema.ts`, `schema.test.ts`, `testDatabase.ts`, `drizzle/meta/_journal.json` and generated snapshot. Register additive migration in existing restore tests.

**Interfaces:** `RankJob` contains id/runId/queryId/frozen queryText/targetPath/regionId/externalRegionId/device, state, operationId, submitAttempts, pollErrorAttempts, nextAttemptAt, errorCode. `RankPlan` contains runId/checkDate/startedAt/expiresAt/jobs and quota metadata. Export `createRankQueueRepository(db)` with `withRankLock(work)`, `getOrCreatePlan({now,dailyLimit,resumeOnly}): Promise<RankPlan|null>`, `listDueJobs(runId,now): Promise<RankJob[]>`, `reserveSubmission(jobId,now,dailyLimit): Promise<boolean>`, `saveOperation(jobId,operationId,now)`, `saveResult(jobId,result,now)`, `deferJob(jobId,{stage,nextAttemptAt,errorCode})`, `blockJob(jobId,errorCode)`, `expirePlan(runId,now)`, `recoverSubmitting(runId)`, `summarizePlan(runId): Promise<RankProgress>`.

`RankProgress` fields: runId/checkDate/status/plannedCount/completedCount/storedCount/remainingCount/blockedCount/nextAttemptAt/periodFrom/periodTo/errorCode/retryable. No operation IDs exposed. New job and submission-reservation tables have unique run/query/region/device and job/attempt constraints; reservations retain Moscow date, even on failure. Result write and job stored transition share a transaction.

- [ ] Write DB tests: reserve 1000 permits exactly 1000 POST attempts including uncertain ones; attempt 1001 false; frozen 60×8×2 plan = 960; concurrent plan creation has one run; stored result cannot duplicate; existing partial without jobs returns blocked legacy progress and no work.
- [ ] Run `npx tsx --test src/server/seo-monitoring/rankQueueRepository.test.ts src/server/db/schema.test.ts` with isolated TEST_DATABASE_URL. Confirm failures name missing queue behavior; absent DB is not a pass.
- [ ] Implement contracts, repository and additive migration. `getOrCreatePlan(resumeOnly:true)` never creates plan; use original run deadline and exact selected matrices. Existing zero-work runs remain successful.
- [ ] Repeat tests and restore test database; confirm old rank history unchanged and operation_id absent from RankProgress.
- [ ] Commit this task's files: `feat: persist SEO rank plans and submission budgets`.

## Task 2: Resumable collector and safe provider errors

**Files:** Modify `src/server/seo-monitoring/rankCollector.ts`, `rankCollector.test.ts`, `providers/yandexSearch.ts`, `providers/yandexSearch.test.ts`, `runtime.ts`; add `rankRecoveryPolicy.ts`, `rankRecoveryPolicy.test.ts`.

**Interfaces:** Collector consumes task 1 repository, current startSearch/pollSearch provider and injected clock. `run({resumeOnly?:boolean} = {}): Promise<RankProgress & {source:'yandex_search'}>`. Provider distinguishes submit-rejected-429 (retryable), submit-uncertain (network/5xx/invalid lost response), permanent submit failure, and retryable GET failure. `rankRecoveryPolicy` exports `isSubmissionWindow(now):boolean`, `nextRetryAt({now,attempt,retryAfterSeconds?}):Date`, `planExpired(plan,now):boolean`.

- [ ] Write tests: restart with polling job performs zero POST and one GET; stored job performs neither; 429 schedules 10/30/120-minute retries and counts each reservation; submitting crash blocks; GET failure preserves ID; retries respect Retry-After; attempt four blocks; pending schedules two minutes; after 48h expires; outside 00:30–06:00 POST count zero; input plan unchanged across day/core edits; resume-only without plan is skipped.
- [ ] Run `npx tsx --test src/server/seo-monitoring/rankCollector.test.ts src/server/seo-monitoring/rankRecoveryPolicy.test.ts src/server/seo-monitoring/providers/yandexSearch.test.ts`; watch each new behavior fail before implementation.
- [ ] Implement one bounded pass under lock, without old in-memory multi-hour polling loop or retries of uncertain POST. Persist ID before subsequent work. Derive totals from stored jobs, not per-pass counters. Existing legacy guard becomes explicit blocked result, not a second full run.
- [ ] Repeat targeted tests; prove no paid-provider network call occurs through fixtures.
- [ ] Commit: `fix: resume rank jobs without duplicate search submissions`.

## Task 3: CLI status and recovery timer

**Files:** Modify `server/seo-collect.mjs`, `server/seo-collect.test.js`, `src/server/seo-monitoring/runtime.ts`, `scripts/run-seo-rank-collect.sh`, `deploy/systemd/kordevteam-seo-rank-collect.service`, `deploy/README.md`; create `scripts/run-seo-rank-recover.sh`, `deploy/systemd/kordevteam-seo-rank-recover.service`, `kordevteam-seo-rank-recover.timer`, `tests/deploy/seoRankRecovery.test.mjs`.

**Interfaces:** CLI accepts sole `--resume-yandex-rank` and forwards `{source:'yandex_search',resumeYandexRank:true}` to runtime, which calls collector `run({resumeOnly:true})`. Reject mixing with --check/--skip-yandex-rank/other source. Exit 0 success/disabled/skipped; 2 retryable incomplete; 1 blocked/failed. Mixed reports prioritize blocked/failed over retryable partial. Generic metric partial also returns nonzero, never fabricated ready.

- [ ] Write CLI tests asserting each exit code, option validation and safe counts; deploy tests asserting recovery every 10 minutes, no new plan, no Restart=on-failure loop and both scripts use validated recorded_worker_image.
- [ ] Run `node --test server/seo-collect.test.js tests/deploy/seoRankRecovery.test.mjs`; confirm red.
- [ ] Implement scripts/timer and status propagation. Timer handles retries; permanent failures stay visible but no immediate infinite systemd restart. Preserve weekly timer schedule. Update full-suite test discovery if needed for server/seo-collect.test.js.
- [ ] Repeat tests and run `bash -n scripts/run-seo-rank-collect.sh scripts/run-seo-rank-recover.sh`; fixture-check shell paths without Docker/API execution.
- [ ] Commit: `fix: surface partial collection and schedule safe recovery`.

## Task 4: Progress and compatible comparisons

**Files:** Modify `src/server/seo-monitoring/service.ts`, `service.test.ts`, `repository.ts`, `repository.test.ts`, `src/routes/admin/seo-read.server.ts`, `seo-read.server.test.ts`, `seo-positions.tsx`, `seo-shared.tsx`, `seo-sections.test.tsx`; add `rankProgress.tsx`, `rankProgress.test.tsx` in routes/admin.

**Interfaces:** Service `getRankProgress({dateTo}): Promise<RankProgress|null>` delegates to task 1 read repository. Positions loader includes rankProgress. `buildRankControl` compares only full matching matrices within 48h; individual known current results can display without claiming whole-run growth. Null job result means unverified; old result retains visible date.

- [ ] Write tests: partial 255/960 shows 705 remaining; blocked unknown POST shows requires action; no-data is not outsideTop100; no week movement from partial/different matrix; stored 05.10/06.10 result shows actual timestamps; Moscow mobile positive result is not hidden by Russia desktop summary.
- [ ] Run targeted service/read/UI tests; confirm red, implement read model/components, repeat green.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run db:check` with DB tests enabled; report every failure/skip and run `git diff --check`.
- [ ] Commit: `feat: show reliable rank collection progress`.

## Delivery gate

Review the complete diff and fault-injection tests before integration. Deployment and paid live checks are separate actions; no automatic 705-query resubmission. After a requested deployment validate migrations, both timers, admin progress, and recovery skip/GET-only behavior without a new paid plan.
