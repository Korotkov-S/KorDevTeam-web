# GEO Compatible Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task-by-task.

**Goal:** Expose honest branded/generic coverage and permit GEO improvement experiments only from full compatible saved evidence.

**Architecture:** One strict pure full-run snapshot builder feeds existing overview and experiment metrics; persist experiment cohort dimensions and extend existing read interfaces, not collectors.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, React Router, node:test, existing immutable image pipeline.

**Spec:** docs/superpowers/specs/2026-10-08-geo-compatible-control-design.md

## Global Constraints

- No AI/provider/indexing sends, public-content/core/entity changes, budget/timer changes, new monitor or automatic experiment approval.
- Only full successful runs with actual3×prompt rows and identical platform/surface/mode/language/region/personalization qualify; validate before topic/prompt/personalization projection.
- Three distinct compatible full snapshots, not three weeks, gate observation recommendations/candidates; legacy unknown dimensions fail closed.
- Current changed-after-run prompt definitions are ineligible; raw historical evidence remains readable.
- Brand/nonbrand inventory0/N and unchecked/no-data are distinct; SoV concerns tracked confirmed entities only.
- Preserve official referral/crawler thresholds,7/14/28 milestone ordering and human approval boundaries; same-page experiments at least14 days apart.
- Owner selected continuous native delivery; no intermediate approval pauses, test/review/deploy gates retained.

## Review Focus

- A scoped topic hides a missing sibling observation, causing a partial run to appear complete.
- Filtering false personalization or mixing live UI surfaces accidentally changes the cohort denominator.
- Same-day independent runs are valid while duplicate IDs or counters without actual observations cannot make a baseline.
- Legacy unknown experiment dimensions and edited prompt definitions must remain inconclusive rather than silently use current conditions.
- Concurrent different-prompt experiments on one page must not evade the14-day cooldown or overwrite fixed baseline evidence.

### Task 1: Full snapshot analytics and coverage

**Files:** `src/server/geo-monitoring/analytics.ts`, new `control.ts`/`control.test.ts`, analytics/repository tests, repository.ts read helpers.

**Interfaces:** extend `GeoAnalyticsRow` with full run metadata, surface, actual/run personalization, prompt category/update timestamp. `buildGeoSnapshots(rows)` returns only validated full snapshots; `compareGeoSnapshots(snapshots)` deduplicates run IDs and checks all dimensions. `summarizeGeoControl({rows,prompts,platforms,filters})` returns brand/nonbrand coverage and compatible cohorts. Repository fetches full run rows using run-level filters before pure projection; `getOverview` adds control without changing private evidence reads.

- [ ] Write pure regressions named full_run_before_projection, mixed_personalization, same_day_not_duplicate, edited_definition, category_zero_vs_unchecked. Assert partial/missing/counter-only snapshots excluded;3 distinct same-day exact cohorts eligible; changed dimension incomparable;0/3 distinct from null/0.
- [ ] Run `node --import tsx --test src/server/geo-monitoring/analytics.test.ts src/server/geo-monitoring/control.test.ts`; expected missing contract/regression failures.
- [ ] Implement strict builder/cohort/control and full-row repository read. Preserve actual numerators/denominators and raw detail reads. Add real DB scoped-missing-sibling/personalization-filter tests.
- [ ] Run focused pure/repository tests with dedicated TEST_DATABASE_URL, typecheck; expected all pass. Commit.

### Task 2: Fixed experimental cohorts and cooldown

**Files:** schema/migration0022/journal/schema+backup tests; repository experiment methods, service contracts/validation, MCP tools/adapter tests, experiments tests.

**Interfaces:** new nullable experiment surface/sessionPersonalized fields; new observational candidate requires both. Existing `GeoReadFilters` accepts optional surface/sessionPersonalized. Observation metric reads return complete/cohort/runIds/numerator/denominator using Task1 snapshots. Same-page implementation lock enforces14-day separation independently of prompt set; existing official metrics stay separate.

- [ ] Write DB tests for different surface/personality recommendation rejection,3 full runs in one week accepted,3 weeks with missing observations rejected, fixed baseline/result/legacy unknown inconclusive and concurrent different-set page cooldown. Observe failures using focused repository tests.
- [ ] Implement dimensions/migration and propagate them through candidate, baseline and evaluation; snapshot provenance preserved in result. Add strict service/MCP validation for false, missing pairs and unsafe strings. Retain existing official metric gates and milestone order.
- [ ] Run focused DB/schema/backup/service/MCP tests, typecheck/build/dbcheck; expected green. Commit.

### Task 3: Honest admin/reporting and release

**Files:** admin GEO read/filter/shared UI, new `geo-control.tsx`/tests, overview tests, operations protocol/runbook, existing heartbeat after deploy.

**Interfaces:** authenticated overview includes full queue progress, control.coverage/cohorts; bounded surface and tri-state personalization filters retained in navigation. Descriptive action matrix copy states readiness gate, not a suggestion from one run. MCP overview exposes same cohort evidence under existing read scope.

- [ ] Write loader/UI tests for queue on overview, false filter propagation and platform/category0/N versus no data, exact cohort readiness and tracked-only SoV wording; observe failures.
- [ ] Implement small control panel/filter changes and runbook. Run focused tests, full npm test, typecheck/build/dbcheck; expected all pass. One fresh whole-branch review; Important findings one RED→GREEN fix pass plus complete suite.
- [ ] Merge/push exact tested tree, require CI/artifact/protected immutable deploy, verify active digest/revision/health/content unchanged and read actual saved control. No new sends or experiment mutations. Update existing heartbeat only after compatibility verification, keeping recurrence/target/budgets. Record release proof/rulings and proceed publication lifecycle stage5.
