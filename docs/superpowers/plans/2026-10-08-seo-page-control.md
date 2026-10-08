# Unified SEO page control implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every published article, case and service with durable source-specific index evidence and its keyword/decision history.

**Architecture:** Append-only normalized audit observations in PostgreSQL, a bounded CLI report importer and a read-only page-control repository. Extend the existing authenticated pages loader and UI, retaining existing performance metrics.

**Tech Stack:** TypeScript, React Router, Drizzle, PostgreSQL, node:test, existing immutable-image deployment.

**Spec:** docs/superpowers/specs/2026-10-08-seo-page-control-design.md

## Global Constraints

- No content/publication/core/budget/paid-check/recrawl mutations.
- Source failure preserves previous success; absence of a sample does not prove exclusion.
- Full published registry, no metric-based inventory or fixed count.
- Strict same-origin URL and published identity/version validation.
- Owner explicitly waived intermediate process approval pauses; execute inline, review and release each stage.

## Review Focus

- A new page with neither keys nor observations must remain visible.
- Historical observations must not look current after a published version changes.
- Failed and older out-of-order imports must not erase or supersede newer successful evidence.
- Idempotent replay must not silently accept changed data at the same observation identity.
- Pagination must retain the selected filters and source-specific semantics.

---

### Task 1: Durable audit observations and page registry

**Files:** Create `src/server/seo-monitoring/pageControl.ts`, `pageControlRepository.ts`, corresponding `.test.ts`; modify `src/server/db/schema.ts`; add `drizzle/0019_seo_index_observations.sql` and journal entry.

**Interfaces:** `parseIndexingAudit(report: unknown): IndexObservation[]`; `createPageControlRepository(db).importAudit(report)`; `listPages({pagePath?,limit,cursor}, now)` returns registry, latest attempt and last successful evidence per source, version freshness and active keywords.

- [ ] Write failing validation and real PostgreSQL replay/history/inventory tests with literal fixtures, including all Review Focus classes.
- [ ] Run `node --import tsx --test src/server/seo-monitoring/pageControl*.test.ts`; expect missing implementation failures.
- [ ] Implement validation, append-only migration, transactional importer and full registry projection.
- [ ] Run the same tests with TEST_DATABASE_URL; expect no failures.

### Task 2: CLI, admin integration and release

**Files:** Create `server/seo-index-audit-import.mjs` and test; modify `src/entry.server.tsx`, `src/routes/admin/seo-read.server.ts`, `seo-pages.tsx`, `seo-sections.test.tsx`; add operational runbook.

**Interfaces:** CLI reads at most 8 MiB stdin and invokes built `importSeoIndexingAudit(report)`; safe counts/error only. `getPageControl` exported runtime supports authenticated pages loader, composed with existing source/date-specific metrics and rank control.

- [ ] Write failing CLI, authenticated loader and rendered page tests; verify real outcomes, not source text.
- [ ] Run focused tests; expect new contract absent.
- [ ] Implement CLI/export/loader/page cards, summary completeness and links with preserved filters.
- [ ] Run focused tests, `npm test`, `npm run typecheck`, `npm run build`; expect all exit 0.
- [ ] Review diff; fix important findings through RED→GREEN. Commit, merge into main and push.
- [ ] Verify immutable CI manifest, deploy using existing protected workflow, verify deployed SHA/health and preserved content.
- [ ] Import the existing Oct7–8 schemaVersion 2 audits using bounded CLI; preserve Oct6 schemaVersion 1 locally because its source timestamps/published versions are absent. Verify source counts and the complete current published registry. Record evidence, then proceed to stage 2.
