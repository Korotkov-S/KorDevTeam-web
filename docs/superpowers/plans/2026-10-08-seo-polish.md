# SEO/GEO clarity and bounded evaluation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the five user-approved SEO/GEO admin defects without changing monitoring policy or public content.

**Architecture:** Separate dated paid controls from free impression averages in the UI. Classify known CMS conflicts without exposing internal errors. Read effect evidence by change and relevant window instead of eagerly loading the entire database history; retain the existing evaluator and append-only evidence semantics.

**Tech Stack:** TypeScript, React Router, Drizzle/PostgreSQL, node:test, protected immutable-image releases.

**Spec:** The user's approved scope is: weekly rather than daily paid-control copy; same-row free/paid comparison; explicit operational GEO queue scope; accurate Telegram-source/provenance errors; bounded SEO evaluator reads. The user requests implementation, merge, deployment and verification after each stage, without stopping between stages.

## Global Constraints

- No provider collection, paid sends, indexing submissions, public content/core/budget/schedule changes.
- Free averages are impression-based period statistics, not exact rank controls; missing observations are unknown, not outside top-100.
- Comparison scope is Russia/desktop; retain the existing complete city/device control matrix and actual measurement dates.
- Preserve frozen cohorts, first complete baselines, collector locks, source freshness, index provenance, checkpoint windows 7/14/28 and append-only hashes.
- Merge only after verification; deploy exact successful CI digests using the existing protected release workflow and independently verify active slot/image/revision/health and unchanged managed content.

## Review Focus

- Source collection failure with cached means: retain data with warning, never claim confirmed zero.
- Separate source-specific Russia region identifiers and paginated query results.
- Non-version conflict with unsaved text: retain submitted fields, do not suggest a stale version.
- Latest failed/partial source attempt outside a change's metric window: still blocks a directional verdict.
- Historical cohorts/baselines and changes spanning multiple batches: preserve evidence and process every change exactly once.

### Task 1: SEO/GEO presentation

**Files:** `src/routes/admin/seo-position-comparison.tsx`, `seo-positions.tsx`, `seo-read.server.ts`, `seo-overview.tsx`, `seo-semantics.tsx`, `geo-collection-progress.tsx`, adjacent tests.

**Interfaces:** Existing `getRankControl`, `getDashboard`, paginated `listQueries`; produce `averages: { yandex, google }` with safe source health and timestamps. No writes or provider calls.

- [x] Write and observe failing tests for same-row means/control/date, weekly copy, queue scope, complete pagination and source failures.
- [x] Implement the comparison and copy; retain cached means with warnings.
- [x] Run focused tests, full CI-equivalent tests, typecheck/build and fresh review.
- [x] Commit, merge, push, deploy immutable CI artifacts and verify production before Task 2 release.

### Task 2: Accurate content editor conflicts

**Files:** `src/routes/admin/content-http.server.ts`, `content-editor.server.ts`, `content-routes.test.tsx`.

**Interfaces:** Extend `contentErrorMessage(status: number, error?: unknown): string`; only `content_version_conflict` loads `currentVersion` in editor action. Existing callers remain compatible.

- [x] Add failing action tests for source conflict, immutable provenance and occupied slug: status 409, distinct actionable safe message, unchanged fields, no current-version read. Keep real version conflict behavior; unknown internal errors stay sanitized.
- [x] Run `node --import tsx --test src/routes/admin/content-routes.test.tsx` and observe RED.
- [x] Implement narrow classification and run the same command to GREEN, then typecheck and build.
- [x] Fresh review, commit/merge/push; require successful complete CI and protected deployment, then independently verify production.

### Task 3: Bounded saved-evidence evaluation

**Files:** `src/server/seo-monitoring/effectsRepository.ts`, `effects.ts`, `effectsRepository.test.ts`, `effects.test.ts`.

**Interfaces:** Preserve `evaluateAll(now): Promise<{inserted, unchanged}>` and result shape. Share `seoEffectWindows(appliedAt, source, checkpoint)` between evaluator and repository if needed for source-calendar bounds.

- [x] Add integration regressions: unrelated historical metrics/evaluations are not returned in bulk; multiple change batches all processed; newest failed run outside window still blocks; frozen cohort/baseline and idempotence remain unchanged. Observe RED on bounded-read regression.
- [x] Page changes by `(appliedAt,id)` in the existing fenced transaction; read only matching publication, assigned keys, first cohort, first complete checkpoint baselines, relevant page/window metrics, overlapping runs plus global newest eligible run, latest index and later same-page changes.
- [x] Run local effects tests with the isolated CI-configured test database, then full CI-equivalent tests, typecheck and build. Review numerical/evidence equivalence and source-calendar edges.
- [x] Commit/merge/push, protected deploy and independent production checks; compare immutable state hashes and run only the idempotent saved-DB evaluator, without external collection.

## Execution record

- Task 1 RED observed for seven presentation assertions; three additional health regressions observed RED, fixed GREEN. Focused suite: 28/28. Reviewer health finding resolved.
- Initial full-test invocations without the full CI environment were invalid acceptance evidence; one was interrupted. Authoritative acceptance uses `release-artifacts/2026-10-08-seo-polish/run-tests.mjs` with CI fixture environment and the existing disposable localhost test database only.
- Browser verification currently reaches the existing admin login, not an authenticated dashboard; do not represent this as a visual dashboard check.
- Task 1 acceptance: JS 224 passed / 2 skipped / 0 failed; TypeScript/application 1157 passed / 0 skipped / 0 failed. Typecheck/build passed. Authoritative log: `/tmp/kordev-seo-polish-stage1-acceptance.log`.
- Task 2: three misleading messages reproduced RED; route tests GREEN 9/9, typecheck/build passed. Fresh scoped review had no findings and independently passed 9/9 tests. Implementation prepared in the feature branch while Task 1 CI runs; shared-branch release remains sequenced after Task 1 production verification.
- Task 3: bounded-read tests RED (112 unrelated metrics and an unpaged 56-change journal), then GREEN. Review identified a microsecond-to-Date keyset loop and a latest-source test whose requested dates were still inside the 28-day envelope. Added native timestamp regressions, observed both RED, retained the exact database cursor and original millisecond source/evidence semantics; 17/17 effects tests GREEN. Latest failed source now explicitly tested outside the full envelope. Typecheck/build passed. Interrupted pre-fix full run is not acceptance; final full run restarted after fixes.
- Required evidence remains proportional to overlapping collection runs and later same-page changes; this removes eager whole-database histories from application memory, not every possible SQL scan or per-page historical array. Existing floating-point iteration order and read-committed snapshots are unchanged policy limitations.
- Task 1 production: revision `6c91ff5d71b636c04917f4231033aa9e220e9e8e`, CI `37792782041`, protected deployment `37795561439`; independent active green/image/revision/health/public canonical/release-boundary checks passed. Content plan/apply 145 unchanged, 0 insert/update/mismatch. Content/core/GEO/journal/evaluation/recommendation hashes unchanged. Before optimization the saved-DB evaluator returned inserted=0, unchanged=108, without provider calls.
- Task 3 final acceptance: JS 224 passed / 2 skipped / 0 failed; TypeScript/application 1166 passed / 0 skipped / 0 failed. Typecheck/build and diff check passed. Authoritative log `/tmp/kordev-seo-polish-stage3-final-acceptance.log`. Reviewer blockers addressed with observed failing/passing regressions; no additional concrete issue remained in its scoped review.
- Task 2 production: revision `bf71fc8c6c4ce56ef405b9f06c7e8e557eeafe09`, CI `37796097497`, protected deployment `37798957379`; independently verified at 2026-10-08T15:17:04.963Z. Active blue identity, health, canonical/release gates passed. Managed content 145 unchanged; complete monitored state hashes unchanged.
- Task 3 production: revision `7429f90b89e8f8958af8596e3987339cd7015376`, CI `37799493487`, protected deployment `37802561647`; independently verified at 2026-10-08T15:42:24.763Z. Active green identity, health, canonical/release gates passed. Managed content 145 unchanged; complete monitored state hashes unchanged. New evaluator returned inserted=0/unchanged=108, identical to the old-code baseline; pipeline exited 0 at 2026-10-08T15:42:54.262Z.
- Final proof: `docs/runbooks/seo-polish-release-2026-10-08.md`. All functional commits are merged into main and deployed. The final documentary proof is retained on the feature branch; it does not imply a fourth deployment.
