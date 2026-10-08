# SEO effect evaluation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task-by-task.

**Goal:** Preserve change baselines and honest source-specific 7/14/28 measurement checkpoints.

**Architecture:** Pure evaluator plus append-only measurements, operational CLI, authenticated admin/MCP reads. Existing collector and index evidence are inputs, never API calls from evaluation.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, React Router, node:test, existing immutable releases.

**Spec:** docs/superpowers/specs/2026-10-08-seo-effect-evaluation-design.md

## Global Constraints

- No content/core/paid budget/timer/index-submission changes; no extra monitor.
- Freeze assigned cohort and complete baseline; preserve later attempts, label retrospective capture.
- Russia, actual device rows only; same query cohort, complete source days and successful coverage windows.
- Latest source success fresh within36h, indexed current page and post-change crawl before directional verdict.
- Per-query100 impressions per window, primary equal-query mean positions, minimum1 position; engineering policy, observational not causal.
- Owner waived intermediate approval pauses; retain tests/review/release gates.

## Review Focus

- Successful windows with zero rows are covered, but cannot pass sample gate.
- A latest failed/running source or internal coverage gap must not yield a directional verdict.
- Late data completes baseline without erasing earlier incomplete attempts; same evidence replays idempotently.
- City/device=all/query-cohort drift or later page changes cannot silently mix into comparison.
- Read-only admin/MCP cannot trigger collection or persistence; history pagination preserves page filter.

### Task 1: Evaluator and durable evidence

**Files:** Create `src/server/seo-monitoring/effects.ts`, `effectsRepository.ts` and tests, migration0020; modify schema/journal and backup/rollback fixtures.

**Interfaces:** `evaluateSeoEffect(input: EffectInput): EffectResult`; `createSeoEffectsRepository(db).evaluateAll(now?)` appends deduplicated snapshots; `.list({pagePath?,limit,cursor})` reads latest per change/source/checkpoint and count/history. Input includes change/cohort/baseline/metrics/source runs/index/latest publication/subsequent changes. Result includes status/windows/baseline/after/policy/provenance.

- [ ] Write pure literal-fixture tests for all state gates, full dates/timezones, sign/minimum-effect, equal weighting and excluded dimensions; run `node --import tsx --test src/server/seo-monitoring/effects.test.ts`, expect missing module failure.
- [ ] Implement pure evaluator; same test command must pass.
- [ ] Write PostgreSQL baseline/history/idempotency/read-pagination/collector-lock tests; run with TEST_DATABASE_URL and expect missing repository failure.
- [ ] Implement transactional source locks, immutable measurements and read model; verify focused tests and db:check pass, commit.

### Task 2: Runtime/admin/MCP and release

**Files:** Add `server/seo-effects-evaluate.mjs`/test and admin effects component/test; modify runtime/entry export, service/repository, seo-read/seo-changes and MCP service/tools/tests; add runbook.

**Interfaces:** built `evaluateSeoChanges()` runs saved evidence; service/MCP `listChangeEffects` and `getPageControl` read only. CLI prints safe counts, never private errors. Changes loader joins read models, no write.

- [ ] Write failing CLI, authenticated loader/render and MCP scope/read tests; run focused commands, expect missing contract failures.
- [ ] Implement interfaces, semantic labels and bounded safe CLI; focused tests/typecheck/build pass.
- [ ] Run complete `npm test` with dedicated local database; no concurrent build/reset. Review whole branch once, fix important findings RED→GREEN, commit.
- [ ] Fast-forward tested tree to main/push, verify CI immutable manifest and protected deploy. Verify SHA/health/content unchanged, evaluate saved production evidence and inspect persisted results/replay.
- [ ] Update existing heartbeat to run idempotent evidence evaluation after audit sync without new provider calls. Record release evidence, proceed stage3.
