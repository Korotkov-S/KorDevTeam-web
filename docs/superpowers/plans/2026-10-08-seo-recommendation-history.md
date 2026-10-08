# SEO Recommendation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task-by-task.

**Goal:** Reconcile stale decision cards without losing original facts or inventing completion.

**Architecture:** Transactional current-row revision plus append-only before/after events; bounded CLI and authenticated admin/MCP reads/writes.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, React Router, node:test, existing immutable release.

**Spec:** docs/superpowers/specs/2026-10-08-seo-recommendation-history-design.md

## Global Constraints

- No content/core/budget/timer/provider/index-submission changes or new monitor.
- Preserve existing recommendation IDs, identity and all original evidence in history.
- expectedUpdatedAt and reason required; unchanged content no-op; stale writer fails closed.
- Existing status transitions; resolution of externally completed new task is dismissed with explicit reason, not invented implementation.
- Reconciliation batch <=100 /1MiB, all-or-nothing, explicit operational actor.
- Owner requested continuous native execution; intermediate approval pauses waived, review/release gates retained.

## Review Focus

- Concurrent status/content writer must invalidate a stale revision, including equal millisecond timestamps.
- Deduplicated create refresh and ordinary status change must preserve history too.
- Batch validation or late stale item must roll back earlier items.
- Historical evidence must remain readable after current card is closed; filtering/pagination cannot leak unrelated history.
- Partial issue resolution never silently closes a card or claims causal ranking improvement.

### Task 1: Durable history and guarded revision

**Files:** schema/migration0021/journal and backup fixtures; new `src/server/seo-monitoring/recommendationHistory.ts`/tests; repository/service integration.

**Interfaces:** `reviseRecommendation({id,expectedUpdatedAt,title,rationale,evidence,confidence,status?,reason},actor)`; paginated `listRecommendationHistory({recommendationId,limit,cursor})`; `reconcileSeoRecommendations(commands)` transactional bounded batch. Events store before/after/reason/time/actor; immutable identity fields excluded from revision.

- [ ] Write real PostgreSQL tests for initial update history, unchanged replay, stale writer, illegal transition, same-millisecond update monotonicity, batch rollback and bounded pagination; run focused test and observe missing contract failures.
- [ ] Implement transactional helpers and migration; existing create/status operations call the same event writer. Focused history/repository/schema/backup tests must pass; commit.

### Task 2: Interfaces, reconciliation and release

**Files:** runtime/entry export, bounded `server/seo-recommendations-reconcile.mjs`/test; MCP adapters/tools and tests; authenticated changes loader/UI/history/tests; runbook.

**Interfaces:** built reconciliation accepts validated commands from stdin, prints safe revised/unchanged; MCP revise uses token actor, history is read-only; admin history selector preserves filters and pagination.

- [ ] Write failing CLI validation/safe-error, MCP scope/revision and authenticated history render tests; run focused commands, expect missing contract failures.
- [ ] Implement safe validated interfaces, history links and runbook. Run focused tests/typecheck/build/db:check, then complete npm test; one independent whole-branch review and Important fixes RED→GREEN; commit.
- [ ] Merge/push identical tested tree, verify CI manifest/protected immutable deploy and public readiness. Prepare guarded proposal from saved official evidence, apply through CLI once, verify old evidence/history and no-op replay. Update the existing heartbeat to read saved effect checkpoints and revise matching issues or propose new evidence-backed actions; no approval/publication/provider rerun. Record actual counts and remaining open issues; proceed stage4.
