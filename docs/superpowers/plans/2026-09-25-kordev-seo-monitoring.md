# KorDevTeam First-Party SEO Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Apply superpowers:test-driven-development inside every implementation task and superpowers:verification-before-completion before final delivery.

**Goal:** Build a private SEO dashboard backed by daily Yandex Webmaster and Google Search Console imports, with regional Yandex views, charts, change tracking, and scoped MCP tools for the existing daily Codex heartbeat.

**Architecture:** Official API adapters normalize immutable daily observations into PostgreSQL through an idempotent repository. A one-shot production command runs before the 09:00 Moscow heartbeat under a systemd timer and per-source PostgreSQL advisory locks. The protected React Router admin page reads bounded server-side aggregates and renders Recharts visualizations. Existing `/mcp` gains independent `seo:read` and `seo:write` scopes so the heartbeat can analyze data and save recommendations without content-publishing authority.

**Tech Stack:** Node.js 22, TypeScript 5.9, React 18, React Router 7, PostgreSQL 16, Drizzle ORM/Kit, Zod 4, Recharts 2.15, official Yandex Webmaster HTTP API, official Google Search Console HTTP API, Node `crypto` for Google service-account JWT, Node test runner, Testing Library, Docker Compose, systemd.

**Spec:** `docs/superpowers/specs/2026-09-25-kordev-seo-monitoring-design.md`

## Global Constraints

- No paid SERP provider and no browser scraping in this implementation.
- Yandex data may be filtered by configured cities; Google data is country `RUS` only.
- UI labels the metric `Средняя позиция`; it never claims a live exact rank.
- Missing observations remain missing and never become zero-valued metrics.
- Aggregate CTR is `sum(clicks) / sum(impressions)` and position is impression-weighted.
- Reimports update the same source/date/query/page/region/device row and never delete an older row merely because a later API response omitted it.
- Source failures are isolated; a Google failure cannot roll back a successful Yandex import.
- API secrets remain environment-only and cannot appear in database rows, admin loader JSON, HTML, logs, error messages, or MCP responses.
- Existing MCP tokens do not acquire SEO authority automatically.
- `seo:write` cannot edit or publish site content.
- Admin queries are date-bounded and paginated; no loader reads the full observations table into Node memory.
- The existing untracked `output/` and `tmp/` directories are user-owned and must remain untouched.

## Initial Regions and Source Configuration

The desired Yandex views are Russia, Moscow, Saint Petersburg, Novosibirsk, Yekaterinburg, Kazan, Nizhny Novgorod, and Krasnodar. Do not hardcode generic Yandex geobase IDs as if they were guaranteed query-analytics dimensions. Before collection, call the Webmaster regions-directory endpoint for the verified host, persist the returned IDs and names, and match desired views to the regions actually available for export. A desired city that is absent from that directory remains visible as `данных пока нет` and is not queried with an invented ID.

Seed Google with one country region: `ru`, name `Россия`, external ID `RUS`. Seed desired Yandex rows by stable internal code/name with a nullable external ID, then fill or refresh the external ID only from the official host-specific directory.

Environment variables:

- `SEO_YANDEX_ENABLED=true|false`
- `YANDEX_WEBMASTER_OAUTH_TOKEN`
- `YANDEX_WEBMASTER_HOST_ID`
- `SEO_GOOGLE_ENABLED=true|false`
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
- `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY_B64`

An enabled source requires all of its credentials. A disabled source must not require credentials and must render a safe `Не настроено` state.

## Intended File Structure

New server domain under `src/server/seo-monitoring/`:

- `contracts.ts` — normalized records, filters, summaries, statuses, and source constants.
- `config.ts` / `config.test.ts` — strict environment parsing and secret-safe status.
- `normalization.ts` / `normalization.test.ts` — query, URL, date, device, CTR, and position rules.
- `repository.ts` / `repository.test.ts` — runs, catalog, upserts, dashboard queries, changes, and recommendations.
- `analytics.ts` / `analytics.test.ts` — deterministic comparisons and problem signals.
- `providers/yandex.ts` / `providers/yandex.test.ts` — Yandex pagination and response mapping.
- `providers/google.ts` / `providers/google.test.ts` — service-account JWT, paging, and response mapping.
- `collector.ts` / `collector.test.ts` — isolated source orchestration, locks, retries, and run status.
- `service.ts` — bounded admin/MCP facade.
- `runtime.ts` — production wiring.

New delivery/UI files:

- `server/seo-collect.mjs` and `server/seo-collect.test.js` — production build wrapper.
- `scripts/run-seo-collect.sh` — explicit Docker Compose one-shot wrapper.
- `deploy/systemd/kordevteam-seo-collect.service` and `.timer` — daily schedule.
- `src/routes/admin/seo.server.ts`, `seo.tsx`, `seo.test.tsx` — protected dashboard.
- `src/routes/admin/seo-charts.tsx` — chart components isolated from request handling.
- `docs/runbooks/seo-monitoring.md` — credentials, first backfill, schedule, rotation, and diagnosis.

Existing files changed intentionally:

- `src/server/db/schema.ts`, `schema.test.ts`, `drizzle/0005_seo_monitoring.sql`, `drizzle/meta/*`.
- `scripts/postgres-backup.mjs` and backup tests for required-table inventory.
- `package.json`, `src/entry.server.tsx`, `Dockerfile`, `deploy/docker-compose.team.yml`, `deploy/README.md`.
- `src/routes.ts`, `src/routes/admin/layout.tsx`.
- `src/server/mcp/contracts.ts`, `tools.ts`, `tools.test.ts`, `runtime.ts`, and admin MCP labels/tests.

---

### Task 1: Add the SEO database foundation

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/schema.test.ts`
- Create: `drizzle/0005_seo_monitoring.sql`
- Create: `drizzle/meta/0005_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `scripts/postgres-backup.mjs`
- Modify: relevant backup inventory tests

**Produces:** Drizzle exports for `seoSources`, `seoRegions`, `seoQueries`, `seoDailyMetrics`, `seoCollectionRuns`, `seoChanges`, and `seoRecommendations` plus their enums and indexes.

- [ ] **Step 1: Write failing database tests**

Extend `src/server/db/schema.test.ts` with cases that:

```ts
databaseTest("SEO observations are unique and keep missing distinct from zero", async () => {
  // Insert one source, region, query and metric.
  // A duplicate source/date/query/page/region/device must violate 23505.
  // averagePosition must be > 0; clicks must be <= impressions; ctr must be 0..1.
});

databaseTest("SEO content links survive content deletion safely", async () => {
  // Delete content_entries row and assert seoChanges.contentEntryId becomes null,
  // while the historical path and description remain.
});
```

Also assert every Google metric requires the explicit seeded Russia region rather than a nullable key.

- [ ] **Step 2: Run the focused typecheck/test and confirm failure**

Run:

```bash
yarn typecheck
node --import tsx --test src/server/db/schema.test.ts
```

Expected: FAIL because the SEO schema exports do not exist.

- [ ] **Step 3: Implement enums, tables, checks, and indexes**

Use PostgreSQL `date` for observation dates and `numeric` for CTR/position. Add:

- source, device, frequency, query-origin, run-status, change-type, recommendation-confidence, and recommendation-status enums;
- non-null source/region/device/date keys;
- checks for nonnegative counts, `clicks <= impressions`, `0 <= ctr <= 1`, and `average_position > 0`;
- unique observation index on `(date, source, query_id, page_path, region_id, device)`;
- indexes supporting date/source/region/device, query history, page history, active recommendations, and recent runs;
- `onDelete: set null` for optional content/admin/token audit links and `restrict` for metric dimensions.

Seed the two sources, eight desired Yandex rows without asserted external IDs, and the explicit Google Russia row with `ON CONFLICT DO NOTHING`. The Yandex directory sync fills external IDs at runtime.

- [ ] **Step 4: Generate and inspect the append-only migration**

Run: `yarn db:generate --name seo_monitoring`

Expected: only new enums/tables/indexes/checks/seeds are added; no existing column or row is rewritten.

- [ ] **Step 5: Extend verified backup inventory**

Add all seven SEO tables to `requiredTables` and update restore fixtures so an older dump can be migrated with the new empty tables.

- [ ] **Step 6: Verify and commit**

Run:

```bash
yarn db:check
yarn typecheck
yarn test
```

Commit: `feat(seo): add monitoring data model`

---

### Task 2: Implement configuration and normalization contracts

**Files:**
- Create: `src/server/seo-monitoring/contracts.ts`
- Create: `src/server/seo-monitoring/config.ts`
- Create: `src/server/seo-monitoring/config.test.ts`
- Create: `src/server/seo-monitoring/normalization.ts`
- Create: `src/server/seo-monitoring/normalization.test.ts`

**Produces:** `readSeoConfig(env)`, safe source-status objects, `normalizeSeoQuery`, `normalizeSitePath`, `mapDevice`, and exact aggregation helpers.

- [ ] **Step 1: Write failing config tests**

Pin these behaviors:

- disabled sources accept absent credentials;
- enabled Yandex requires token and host ID;
- enabled Google requires site URL, client email, and valid base64 PEM private key;
- only `https://` Search Console properties or exact `sc-domain:` values are accepted;
- thrown errors contain stable codes such as `seo_google_private_key_invalid`, never secret values;
- the public config summary contains booleans and property identifiers but no token/private key.

- [ ] **Step 2: Write failing normalization tests**

Examples:

```ts
assert.equal(normalizeSeoQuery("  Внедрение\u00A0 CRM  "), "внедрение crm");
assert.equal(normalizeSitePath("https://kordev.team/blog/crm/?utm_source=x#part"), "/blog/crm/");
assert.equal(weightedPosition([{ impressions: 10, position: 2 }, { impressions: 30, position: 6 }]), 5);
assert.equal(combinedCtr([{ clicks: 1, impressions: 10 }, { clicks: 9, impressions: 90 }]), 0.1);
```

Reject foreign origins and preserve a gap when the denominator is zero.

- [ ] **Step 3: Run tests and confirm failure**

Run: `node --import tsx --test src/server/seo-monitoring/config.test.ts src/server/seo-monitoring/normalization.test.ts`

- [ ] **Step 4: Implement the smallest strict contracts**

Use explicit discriminated source config types. Decode the Google key only in server memory. Normalize URL paths against the configured site origin. Keep original query text for display and normalized text only for identity.

- [ ] **Step 5: Verify and commit**

Run focused tests and `yarn typecheck`.

Commit: `feat(seo): define source configuration and normalization`

---

### Task 3: Build the idempotent repository and deterministic analytics

**Files:**
- Create: `src/server/seo-monitoring/repository.ts`
- Create: `src/server/seo-monitoring/repository.test.ts`
- Create: `src/server/seo-monitoring/analytics.ts`
- Create: `src/server/seo-monitoring/analytics.test.ts`
- Create: `src/server/seo-monitoring/service.ts`

**Produces:** repository methods for run lifecycle, region/query lookup, batch upsert, bounded dashboard datasets, changes, and deduplicated recommendations; pure comparison/problem rules.

- [ ] **Step 1: Write failing repository integration tests**

With `TEST_DATABASE_URL`, prove:

- importing the same record twice leaves one row and updates late metrics;
- an omitted record remains stored;
- source runs finish independently as `success`, `partial`, or `failed`;
- list queries are paginated and filter by source/region/device/frequency/page/date;
- a recommendation fingerprint reuses the active recommendation instead of duplicating it;
- accepted/rejected/implemented/dismissed transitions reject stale or invalid status changes.

- [ ] **Step 2: Write failing analytics unit tests**

Pin:

- current and previous windows have equal lengths;
- CTR and position use correct weighted formulas;
- an incomplete latest date is excluded;
- a missing day is a gap, not zero;
- query position buckets are mutually exclusive: 1–3, 4–10, 11–30, 31–50, >50;
- cannibalization requires meaningful impressions on at least two pages;
- no fall/CTR alert is produced below configurable minimum impressions;
- a recent matching change suppresses premature repeat advice.

- [ ] **Step 3: Implement repository transactions and SQL aggregation**

Use `INSERT ... ON CONFLICT ... DO UPDATE` for queries and metrics. Dashboard methods must aggregate in PostgreSQL and return only chart points, comparisons, movers, and one requested page of query rows.

Acquire/release per-source advisory locks through a dedicated connection or transaction so the lock lifetime is explicit. Do not use process-local mutexes as the primary protection.

- [ ] **Step 4: Implement the service facade**

Expose bounded methods used by admin and MCP:

```ts
getOverview(filters)
listQueries(filters, cursor)
listChanges(filters, cursor)
listRecommendations(filters, cursor)
saveQueryTarget(command)
recordChange(command, actor)
createRecommendation(command, actor)
updateRecommendationStatus(command, actor)
```

Validate maximum ranges, limits, paths, evidence shape, fingerprints, and enums before repository calls.

- [ ] **Step 5: Verify and commit**

Run focused tests, `yarn typecheck`, then full `yarn test`.

Commit: `feat(seo): add analytics repository and rules`

---

### Task 4: Implement the Yandex Webmaster adapter

**Files:**
- Create: `src/server/seo-monitoring/providers/yandex.ts`
- Create: `src/server/seo-monitoring/providers/yandex.test.ts`
- Create: `src/server/seo-monitoring/providers/fixtures/yandex-query-analytics.json`

**Produces:** `createYandexWebmasterProvider(config, fetchImpl?)` with `check()`, paginated `listAvailableRegions()`, and paginated `collect(window, region, device)`.

- [ ] **Step 1: Save a minimal sanitized official-response fixture**

Keep only fields required for query, page, date, impressions, clicks, CTR, average position, pagination, region, and device mapping. The fixture contains no account ID, token, real private URL, or unnecessary upstream payload.

- [ ] **Step 2: Write failing contract tests**

Assert:

- `Authorization: OAuth ...` is sent but never included in errors;
- the host-specific regions directory is paginated and only returned IDs are eligible for analytics requests;
- request bodies contain the requested `region_ids` and device indicator;
- pages continue until fewer than the requested limit are returned;
- the adapter emits one normalized record per actual date/query/page/region/device;
- `429` and retryable `5xx` return typed retryable errors with optional bounded `Retry-After`;
- `401/403` return non-retryable `seo_yandex_auth_failed`;
- malformed successful payloads fail closed without storing partial invented fields.

- [ ] **Step 3: Implement with injected `fetch` and `AbortSignal.timeout`**

Keep HTTP, parsing, and mapping inside the adapter. Do not write to PostgreSQL here. Validate every numeric metric before returning it.

- [ ] **Step 4: Verify and commit**

Run provider tests and `yarn typecheck`.

Commit: `feat(seo): collect Yandex Webmaster metrics`

---

### Task 5: Implement the Google Search Console adapter

**Files:**
- Create: `src/server/seo-monitoring/providers/google.ts`
- Create: `src/server/seo-monitoring/providers/google.test.ts`
- Create: `src/server/seo-monitoring/providers/fixtures/google-search-analytics.json`

**Produces:** `createGoogleSearchConsoleProvider(config, fetchImpl?, clock?)`, including service-account JWT exchange and paginated Search Analytics collection.

- [ ] **Step 1: Write failing JWT tests**

Generate an ephemeral RSA key inside the test. Decode the JWT without logging it and assert:

- `iss` is the configured service-account email;
- `scope` is Search Console readonly;
- `aud` is the Google OAuth token endpoint;
- `iat/exp` use the injected clock and lifetime is bounded;
- the RS256 signature verifies with the test public key.

- [ ] **Step 2: Write failing API contract tests**

Assert:

- access-token responses are held in memory only;
- Search Analytics requests filter `country equals rus` and group by date/query/page/country/device;
- `startRow` advances with a maximum page size and stops correctly;
- final data lag is respected by the collector window;
- response keys map to the explicit Google Russia region;
- auth, quota, timeout, malformed payload, and partial-page errors are typed and secret-safe.

- [ ] **Step 3: Implement token caching and collection**

Cache the access token only in the adapter instance until shortly before expiry. Use Node `crypto.sign` rather than adding an auth SDK solely for JWT creation.

- [ ] **Step 4: Verify and commit**

Run provider tests and `yarn typecheck`.

Commit: `feat(seo): collect Google Search Console metrics`

---

### Task 6: Orchestrate collection and production scheduling

**Files:**
- Create: `src/server/seo-monitoring/collector.ts`
- Create: `src/server/seo-monitoring/collector.test.ts`
- Create: `src/server/seo-monitoring/runtime.ts`
- Create: `server/seo-collect.mjs`
- Create: `server/seo-collect.test.js`
- Modify: `src/entry.server.tsx`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `deploy/docker-compose.team.yml`
- Create: `scripts/run-seo-collect.sh`
- Create: `deploy/systemd/kordevteam-seo-collect.service`
- Create: `deploy/systemd/kordevteam-seo-collect.timer`
- Modify: `deploy/README.md`

**Produces:** `yarn seo:collect`, `node server/seo-collect.mjs --check`, and a production timer scheduled before the 09:00 Moscow heartbeat.

- [ ] **Step 1: Write failing orchestration tests**

Using fake providers/repository/clock, prove:

- each enabled source gets a separate run and lock;
- one source failure does not prevent the other source;
- retryable failures use bounded exponential backoff with jitter;
- non-retryable auth failures are attempted once;
- late Google dates are reimported and yesterday is not required;
- Yandex refreshes the host-specific regions directory and executes only available desired region/device slices;
- unavailable desired cities remain explicit no-data states and never receive a guessed external ID;
- partial pages finish the run as `partial`, preserving valid completed batches;
- logs contain counts and error codes but not fixture secrets.

- [ ] **Step 2: Implement runtime wiring and CLI wrapper**

Export from `src/entry.server.tsx`:

```ts
export { runSeoCollection, checkSeoCollectionReady } from "./server/seo-monitoring/runtime";
```

The `.mjs` wrapper loads `build/server/index.js`, supports only `--check` and optional exact `--source=yandex|google`, prints a compact safe summary, and exits nonzero if any enabled source fails.

- [ ] **Step 3: Add the production one-shot service**

Add a Compose `seo-job` profile using the immutable worker image, backend plus egress networks, read-only filesystem, database URL, and only SEO credentials. Do not expose SEO secrets to the public web containers unless runtime dashboard status requires only enabled flags; pass non-secret flags separately where needed.

`scripts/run-seo-collect.sh` resolves the recorded immutable worker image and runs:

```bash
docker compose -f "$COMPOSE_FILE" --profile seo run --rm --no-deps seo-job node server/seo-collect.mjs
```

The timer uses `OnCalendar=*-*-* 07:30:00 Europe/Moscow`, `Persistent=true`, and a small randomized delay. The service retries failures without overlapping the next active run; database locks remain authoritative.

- [ ] **Step 4: Add Docker and package assertions**

Ensure the production image contains `server/seo-collect.mjs` and the built entry exports. Add `seo:collect` to `package.json`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
node --test server/seo-collect.test.js
yarn typecheck
yarn build
```

On Linux also run `systemd-analyze verify` for the new units; on macOS record the platform skip and rely on CI.

Commit: `feat(seo): schedule first-party metric collection`

---

### Task 7: Build the protected admin dashboard and charts

**Files:**
- Create: `src/routes/admin/seo.server.ts`
- Create: `src/routes/admin/seo.tsx`
- Create: `src/routes/admin/seo-charts.tsx`
- Create: `src/routes/admin/seo.test.tsx`
- Modify: `src/routes.ts`
- Modify: `src/routes/admin/layout.tsx`
- Modify: `src/routes/admin/index.tsx`

**Produces:** `/admin/seo/` with bounded filters, source health, KPI cards, charts, query table, change log, and recommendations.

- [ ] **Step 1: Write failing loader/action tests**

Pin:

- unauthenticated requests redirect to login;
- loader parses only valid 7/28/90/custom ranges and enforces a maximum;
- Google selection ignores/rejects a city filter rather than fabricating empty city data;
- loader returns no secrets and sends `Cache-Control: no-store`;
- query target/frequency updates, change creation, and recommendation status actions require same-origin plus CSRF;
- invalid actions are safe 4xx responses and unexpected failures expose no SQL/config detail.

- [ ] **Step 2: Write failing component tests**

Render representative loader data and assert visible sections:

- source status and last data date;
- common filters;
- KPI cards with previous-period deltas;
- traffic, CTR, position, position buckets, Yandex regions, devices, and frequency charts;
- query movers table, paginated query table, changes, and recommendations;
- empty source and empty filter states;
- Google view has no city options;
- the position chart passes a reversed numeric domain;
- chart gaps remain `null`, not `0`;
- wide tables are wrapped in `overflow-x-auto`.

- [ ] **Step 3: Implement the server route**

Authenticate through `requireAdminPage`, call only `SeoMonitoringService`, and return pre-shaped chart arrays so the component contains no business aggregation. Use the existing admin headers/nonce helpers.

- [ ] **Step 4: Implement the dashboard**

Use existing `src/components/ui/chart.tsx` and Recharts. Keep impressions/clicks together; render CTR and position separately. Add `ReferenceLine` markers for SEO changes and explicit latest-data-delay text.

Filters submit by GET and remain shareable. Mutations use standard React Router forms and current admin CSRF patterns.

- [ ] **Step 5: Register navigation and overview entry**

Add `/admin/seo/` after MCP or before Settings and an overview card showing collection health rather than a fabricated score.

- [ ] **Step 6: Verify and commit**

Run focused route/component tests, `yarn typecheck`, `yarn build`, and a browser smoke test at desktop and narrow mobile widths with seeded fixture data.

Commit: `feat(seo): add monitoring dashboard and charts`

---

### Task 8: Expose scoped SEO tools through MCP

**Files:**
- Modify: `src/server/mcp/contracts.ts`
- Modify: `src/server/mcp/tools.ts`
- Modify: `src/server/mcp/tools.test.ts`
- Modify: `src/server/mcp/runtime.ts`
- Modify: `src/routes/admin/mcp.tsx`
- Modify: `src/routes/admin/mcp.test.tsx`
- Create: `src/server/seo-monitoring/mcpService.ts`
- Create: `src/server/seo-monitoring/mcpService.test.ts`

**Produces:** `seo:read`, `seo:write`, and the seven SEO tools defined in the specification.

- [ ] **Step 1: Write failing scope tests**

Extend the exact scope tuple with `seo:read` and `seo:write`. Assert:

- a legacy content-only token sees no SEO tools;
- `seo:read` registers only overview/list tools;
- write tools require both `seo:read` and `seo:write`, because the agent must inspect the current evidence and active fingerprint before creating or changing analytical records;
- no SEO scope registers content update/publish tools;
- crafted calls to unregistered tools never reach the service;
- every list has hard limits/date bounds and cursor validation.

- [ ] **Step 2: Implement the MCP facade**

Map compact service DTOs only. Validate recommendation evidence as finite metrics and ISO dates. Generate or verify a stable fingerprint server-side rather than trusting arbitrary client deduplication keys.

- [ ] **Step 3: Register tools and update token UI**

Add:

- `get_seo_overview`
- `list_seo_queries`
- `list_seo_changes`
- `list_seo_recommendations`
- `create_seo_recommendation`
- `record_seo_change`
- `update_seo_recommendation_status`

Update Russian scope labels. Existing database tokens retain their stored scopes unchanged.

- [ ] **Step 4: Verify and commit**

Run MCP and SEO facade tests, then full `yarn test` and `yarn typecheck`.

Commit: `feat(seo): expose monitoring tools over MCP`

---

### Task 9: Document setup, rehearse empty/data states, and run full verification

**Files:**
- Create: `docs/runbooks/seo-monitoring.md`
- Modify: `.env.example` or the repository's canonical environment template if present
- Modify: `deploy/README.md`
- Modify: any readiness/deploy tests that enumerate required exports/files

- [ ] **Step 1: Write the operator runbook**

Document:

- granting the Yandex OAuth application Webmaster read access;
- adding the Google service-account email to the Search Console property;
- base64-encoding the PEM without printing it to shared logs;
- `--check`, first import, limited backfill, source-specific rerun, timer enable/status, and safe credential rotation;
- issuing a new MCP token containing only `seo:read` and `seo:write` for the heartbeat;
- interpreting missing data, Google lag, partial runs, `429`, and auth failures;
- disabling a source without deleting history.

- [ ] **Step 2: Test the empty deployment state**

With both sources disabled, verify the application boots, readiness remains valid, `/admin/seo/` explains setup, and no external request occurs.

- [ ] **Step 3: Test sanitized fixture data end to end**

Load deterministic local fixture observations through the repository, open the dashboard, check all filters/charts/tables, and call SEO MCP read/write tools with a test token.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
yarn db:check
yarn typecheck
yarn test
yarn build
git diff --check
```

Also run the production wrapper test and Docker/Compose config validation available in the repository. Confirm `git status` contains only intended SEO changes plus the pre-existing untracked `output/` and `tmp/`.

- [ ] **Step 5: Perform secret and behavior audits**

Search the diff and built output for credential fixture strings, verify admin/MCP responses omit secrets, confirm Google city UI is absent, and verify no content mutation is possible with an SEO-only token.

- [ ] **Step 6: Commit documentation and final integration**

Commit: `docs(seo): add monitoring operations runbook`

- [ ] **Step 7: Push `main` and report remaining external setup**

The code can ship with both sources disabled. Production data collection remains pending until the owner supplies Yandex OAuth credentials, creates/adds the Google service account, applies migration `0005`, and enables the timer. Do not claim real metrics were collected until the read-only smoke checks succeed against the actual verified properties.
