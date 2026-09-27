# SEO Sections and Yandex Metrica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split SEO monitoring into six focused admin pages and persist official Yandex Metrica organic-traffic metrics in the SEO database.

**Architecture:** Extend the existing SEO source/collector boundary with a dedicated traffic-metrics table and Metrica provider, then expose focused repository read models to six nested admin routes. Keep Webmaster/Search Console search metrics, Search API ranks, and Metrica behavior metrics visibly and structurally separate.

**Tech Stack:** React Router 7, React 18, TypeScript, Drizzle ORM/PostgreSQL, Node fetch, node:test, Recharts.

**Spec:** `docs/superpowers/specs/2026-09-27-seo-sections-and-metrika-design.md`

## Global Constraints

- No printable or PDF report.
- Dates render as `dd.mm.yyyy`.
- Never expose OAuth tokens, private keys, or environment contents.
- Use only official Yandex Metrica Reporting API data; no SERP scraping or invented values.
- Metrica traffic metrics remain separate from Webmaster/Search Console metrics and Search API ranks.
- Each admin subpage loads only the data it needs.
- Preserve existing SEO mutations, optimistic locking, CSRF, and same-origin checks.

## Review Focus

- Sampled or truncated Metrica responses must fail closed instead of being persisted as complete data; covered in Task 2 provider tests.
- A new-users report missing a matching main row must fail validation rather than create impossible totals; covered in Task 2 provider tests.
- Nested SEO navigation must highlight exactly one current section and retain authentication boundaries; covered in Task 4 route tests.
- Empty traffic and city slices must render as “no data”, not numeric zeros; covered in Task 4 UI tests.
- Existing semantic-core and recommendation POST actions must remain CSRF-protected after route splitting; covered in Task 4 action tests.

---

### Task 1: Metrica schema and configuration contract

**Files:**
- Modify: `src/server/seo-monitoring/contracts.ts`
- Modify: `src/server/seo-monitoring/config.ts`
- Modify: `src/server/seo-monitoring/config.test.ts`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/schema.test.ts`
- Create: `drizzle/0009_yandex_metrika.sql`
- Modify: `drizzle/meta/_journal.json`
- Create/modify: `drizzle/meta/0009_snapshot.json`

**Interfaces:**
- Produces: `YandexMetrikaConfig`, `NormalizedTrafficObservation`, source `yandex_metrika`, table `seoTrafficMetrics`.
- Consumed by: Tasks 2 and 3.

- [ ] Write failing configuration and schema tests for disabled/enabled Metrica, bounded numeric counter ID, safe summary, source enum, unique daily slice rows, metric constraints, and no secret serialization.
- [ ] Run `npx tsx --test --test-concurrency=1 src/server/seo-monitoring/config.test.ts src/server/db/schema.test.ts` and verify failures are caused by missing Metrica contracts/schema.
- [ ] Implement the contract and Drizzle schema, then generate/review migration `0009_yandex_metrika.sql`.
- [ ] Re-run the focused tests and `npm run db:check`; expect success.
- [ ] Commit `feat: add Yandex Metrica SEO schema`.

### Task 2: Official Metrica provider and daily collection

**Files:**
- Create: `src/server/seo-monitoring/providers/yandexMetrika.ts`
- Create: `src/server/seo-monitoring/providers/yandexMetrika.test.ts`
- Create: `src/server/seo-monitoring/providers/fixtures/yandex-metrika-organic.json`
- Modify: `src/server/seo-monitoring/collector.ts`
- Modify: `src/server/seo-monitoring/collector.test.ts`
- Modify: `src/server/seo-monitoring/runtime.ts`
- Modify: `server/seo-collect.mjs`
- Modify: `server/seo-collect.test.js`
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/repository.test.ts`

**Interfaces:**
- Consumes: `YandexMetrikaConfig`, `NormalizedTrafficObservation`, `seoTrafficMetrics` from Task 1.
- Produces: `createYandexMetrikaProvider`, collector target `yandex_metrika`, repository `upsertTrafficObservations`.
- Consumed by: Task 3.

- [ ] Write provider tests for OAuth request construction, the four slice definitions, organic/non-robot filters, matched new-user merge, percentage normalization, pagination limits, and fail-closed sampled/truncated/malformed/auth responses.
- [ ] Run the provider tests and verify RED due to the missing provider.
- [ ] Implement `createYandexMetrikaProvider(config, fetchImpl)` with `check()` and `collect(window)`.
- [ ] Run provider tests and verify GREEN.
- [ ] Write failing collector/repository/CLI tests for a 14-complete-day window ending yesterday, idempotent upsert, safe run status, retry behavior, and `--source=metrika`.
- [ ] Implement repository, collector, runtime, and CLI integration.
- [ ] Run all Task 2 tests and verify success.
- [ ] Commit `feat: collect Yandex Metrica organic traffic`.

### Task 3: Focused SEO read models

**Files:**
- Modify: `src/server/seo-monitoring/repository.ts`
- Modify: `src/server/seo-monitoring/repository.test.ts`
- Modify: `src/server/seo-monitoring/service.ts`
- Modify: `src/server/seo-monitoring/service.test.ts`
- Create: `src/routes/admin/seo-read.server.ts`
- Create: `src/routes/admin/seo-read.server.test.ts`

**Interfaces:**
- Consumes: existing search/rank models and Metrica observations from Task 2.
- Produces: loaders/read models for overview, positions, traffic, pages, semantics, and changes.
- Consumed by: Task 4.

- [ ] Write failing repository/service tests for Metrica overview/daily/device/region/page aggregation and search landing-page aggregation.
- [ ] Run focused tests and verify RED on missing read models.
- [ ] Implement `getTrafficReport`, `listPagePerformance`, and focused service methods with weighted rates/depth/duration.
- [ ] Run focused tests and verify GREEN.
- [ ] Write failing route-loader tests proving each section invokes only its required service methods and returns no secrets.
- [ ] Implement focused loader factories and shared filter parsing.
- [ ] Run all Task 3 tests and verify success.
- [ ] Commit `feat: add focused SEO report models`.

### Task 4: Six SEO admin subpages

**Files:**
- Modify: `src/routes.ts`
- Create: `src/routes/admin/seo-layout.tsx`
- Create: `src/routes/admin/seo-shared.tsx`
- Create: `src/routes/admin/seo-overview.tsx`
- Create: `src/routes/admin/seo-positions.tsx`
- Create: `src/routes/admin/seo-traffic.tsx`
- Create: `src/routes/admin/seo-pages.tsx`
- Create: `src/routes/admin/seo-semantics.tsx`
- Create: `src/routes/admin/seo-changes.tsx`
- Modify or remove: `src/routes/admin/seo.tsx`
- Modify: `src/routes/admin/seo.test.tsx`
- Modify: `src/routes/admin/seo.server.ts`

**Interfaces:**
- Consumes: focused loaders/read models from Task 3.
- Produces: six authenticated URLs with persistent SEO secondary navigation.

- [ ] Write failing SSR/route tests for all six URLs, active navigation, page-specific headings/content, Metrica units, empty states, and `dd.mm.yyyy` dates.
- [ ] Run route tests and verify RED because nested pages do not exist.
- [ ] Implement the SEO layout, shared components, and six focused pages; move existing semantic and change forms without altering action security.
- [ ] Run route tests and verify GREEN.
- [ ] Run admin security and SEO action tests to prove authentication, CSRF, same-origin, and optimistic locking remain intact.
- [ ] Commit `feat: split SEO monitoring into focused pages`.

### Task 5: Operational wiring and full verification

**Files:**
- Modify: `.env.example`
- Modify: `deploy/docker-compose.team.yml`
- Modify: deployment/runtime config tests that enumerate SEO environment variables
- Modify: SEO operator documentation if present

**Interfaces:**
- Consumes: Metrica runtime variables and routes from Tasks 1–4.
- Produces: deployable configuration without storing secrets in Git.

- [ ] Write failing deployment tests proving the SEO job receives the three Metrica variables without printing their values.
- [ ] Implement environment wiring and safe operator documentation.
- [ ] Run deployment tests and verify GREEN.
- [ ] Run `npm run typecheck`, focused SEO tests, `npm run db:check`, `npm run build`, and the full `npm test`; record every result.
- [ ] Review the complete diff against the spec and fix Critical/Important findings through RED→GREEN tests.
- [ ] Commit `chore: wire Yandex Metrica SEO collection`.

