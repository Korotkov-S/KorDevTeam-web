# GEO / AI Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate, evidence-backed GEO monitoring and promotion area that records controlled AI-answer checks, identifies actionable visibility gaps, links approved changes to experiments, measures their 7/14/28-day effect, imports AI referral traffic, exposes safe MCP tools, and never changes public content automatically.

**Architecture:** A dedicated `src/server/geo-monitoring` domain owns GEO contracts, storage, validation, analytics, prompt catalog, promotion experiments, referral collection, and crawler checks. It shares PostgreSQL, the existing Yandex Metrica credential, MCP bearer scopes, SEO recommendations/change journal, admin authentication, and the production collection/deployment path, but it never mixes AI observations with search positions. Controlled AI responses are recorded by the authorized chat agent through MCP; the server does not scrape AI interfaces.

**Tech Stack:** TypeScript, React Router 7 SSR, React 18, Drizzle ORM, PostgreSQL 16, Zod, MCP SDK, Yandex Metrica Reporting API, Node test runner + `tsx`, Docker Compose/systemd.

**Spec:** `docs/superpowers/specs/2026-09-27-geo-ai-visibility-design.md`

## Global Constraints

- Platforms are `yandex_alice`, `chatgpt_search`, `google_ai`, and `bing_copilot`; modes are `official_report`, `live_ui`, and `api_probe`.
- Mention rate, citation rate, Share of Voice, citation share, and source order remain separate metrics; source order is never called a search position.
- Comparisons require equal platform, mode, language, region, prompt set, and completed repetitions; partial and failed runs never drive recommendations.
- Each active prompt is repeated three times in a comparable run; the complete active catalog must be covered at least weekly.
- A response snapshot is private, capped at 16 KiB, marked when truncated, served only to an authenticated admin with `Cache-Control: no-store`, and omitted from list MCP outputs.
- MCP writes require both `seo:read` and `seo:write`; candidates and measurements are allowed, public content and metadata changes are not.
- Automated recommendations require three complete weekly samples or sufficient official volume and must be stored in existing `seo_recommendations`; no automatic publishing is added.
- All dates render as `дд.мм.гггг`; missing data renders as an explanation, never as zero.
- No PDF, print report, public report URL, live SERP scraping, unlimited answer storage, cookies, or personalized session data.
- Production secrets remain in mode-0600 operations env; the web and lead-worker services receive no new provider secret.

## Review Focus

- Replayed or out-of-order MCP writes must remain idempotent and must not let one MCP principal append to or finish another principal's run; Tasks 3 and 4 pin this.
- A partial/failed run, mismatched prompt set, or fewer than three repetitions must not change comparison metrics or recommendations; Task 4 pins this.
- Oversized snapshots, unsafe URLs, malformed metadata, and inconsistent `mentioned/linked/cited` flags must be rejected with safe codes and no partial write; Tasks 1 and 3 pin this.
- Referral classification must not label generic `google.com`, `bing.com`, or `yandex.ru` search traffic as AI traffic; Task 5 pins this.
- Empty platforms, missing city support, and unavailable official reports must render “нет данных” with source freshness rather than zero visibility; Task 8 pins this.
- A second material change on the same page during an experiment window must mark the result confounded instead of claiming causality; Task 7 pins this.

---

### Task 1: PostgreSQL GEO schema and migration-safe backup contract

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0011_geo_ai_visibility.sql`
- Create: `drizzle/meta/0011_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/deploy/backup.test.mjs`
- Test: `src/server/geo-monitoring/repository.test.ts`

**Interfaces:**
- Produces: Drizzle tables `geoTopics`, `geoEntities`, `geoPrompts`, `geoRuns`, `geoObservations`, `geoObservationMentions`, `geoCitations`, `geoFanoutQueries`, `geoReferralDailyMetrics`, `geoCrawlerChecks`, `geoExperiments`, and `geoExperimentPrompts` exported through `schema`.
- Produces: enums/types for platform, run mode/status, prompt category/status, entity type/status, sentiment, citation category, and crawler status.
- Consumes: `seoQueries` and `mcpTokens` foreign keys.

- [ ] **Step 1: Write failing migration/repository tests**

Add assertions that duplicate `(normalized_text, language, region)` prompts fail, `(run_id, prompt_id, repetition)` is unique, source URLs must be HTTP(S), response snapshots are at most 16 KiB, coherent citation flags are enforced, experiment windows are exactly 7/14/28 days, counts are non-negative, and an observation graph deletes atomically with its run.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/repository.test.ts tests/deploy/backup.test.mjs`

Expected: FAIL because the GEO schema and migration do not exist.

- [ ] **Step 3: Add the Drizzle schema and generated migration**

Use arrays for prompt tags and entity aliases; use UUID primary keys; store `initiated_by_mcp_token_id` on `geo_runs`; store a `response_excerpt`, private `response_snapshot`, `snapshot_truncated`, and SHA-256 on observations. Add indexes for period/platform/mode, prompt/run, entity/observation, citation host/path, referral date/platform, and crawler date/target.

- [ ] **Step 4: Extend backup/restore fixtures for all twelve GEO tables**

Update post-migration inventory and migration history so a pre-0011 backup remains valid and a post-0011 restore requires exact GEO table counts. Do not add GEO tables to the pre-migration required set.

- [ ] **Step 5: Run schema and backup tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/repository.test.ts && node --test tests/deploy/backup.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts drizzle tests/deploy/backup.test.mjs src/server/geo-monitoring/repository.test.ts
git commit -m "feat: add GEO monitoring schema"
```

### Task 2: Versioned GEO prompt catalog, entities, and normalization

**Files:**
- Create: `src/server/geo-monitoring/contracts.ts`
- Create: `src/server/geo-monitoring/normalization.ts`
- Create: `src/server/geo-monitoring/promptCatalog.ts`
- Create: `src/server/geo-monitoring/promptCatalog.test.ts`
- Create: `content/seo/geo-prompts.ru.json`

**Interfaces:**
- Produces: `GeoPlatform`, `GeoRunMode`, `GeoPromptCategory`, `GeoPromptStatus`, `GeoEntityStatus`, `GeoObservationInput`, `GeoCitationInput`, and `GeoRunFilters`.
- Produces: `normalizeGeoPrompt(text: string): string`, `normalizeCitationUrl(value: string): { url: string; hostname: string }`, `parseGeoPromptCatalog(value: unknown): GeoPromptCatalogEntry[]`, and `loadGeoPromptCatalog(path?: string): GeoPromptCatalogEntry[]`.
- Consumes: canonical site paths from `src/server/seo-monitoring/normalization.ts`.

- [ ] **Step 1: Write catalog and normalization tests**

Cover 40–60 entries, unique normalized prompt/language/region keys, known platforms/categories, bounded tags, valid target paths, tracking-parameter removal, HTTP(S)-only citations, IDN/lowercase host normalization, and exact starting distribution of 48 prompts: 12 commercial, 12 informational, 8 comparison, 12 local, and 4 brand.

- [ ] **Step 2: Run tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/promptCatalog.test.ts`

Expected: FAIL because catalog functions are missing.

- [ ] **Step 3: Implement contracts and normalizers**

Keep prompt text at 2,000 characters, tag count at 20, each tag at 80 characters, citation URLs at 2,000 characters, and normalized response hashes at SHA-256 lowercase hex.

- [ ] **Step 4: Add the 48-question Russian catalog**

Build it only from current services, semantic-core phrases, published articles, and real cases. Each entry names its topic, tags, category, language `ru`, region, target path, linked normalized SEO query when available, priority, and `active` or `candidate` status. Local entries cover Russia, Moscow, and Saint Petersburg in the first catalog.

- [ ] **Step 5: Run tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/promptCatalog.test.ts`

Expected: PASS with exactly 48 parsed prompts.

- [ ] **Step 6: Commit**

```bash
git add src/server/geo-monitoring content/seo/geo-prompts.ru.json
git commit -m "feat: add versioned GEO prompt catalog"
```

### Task 3: GEO repository, write service, and evidence-safe run lifecycle

**Files:**
- Create: `src/server/geo-monitoring/repository.ts`
- Create: `src/server/geo-monitoring/service.ts`
- Create: `src/server/geo-monitoring/service.test.ts`
- Expand: `src/server/geo-monitoring/repository.test.ts`
- Create: `src/server/geo-monitoring/runtime.ts`

**Interfaces:**
- Produces repository methods `syncPromptCatalog(entries)`, `createPromptCandidate(input)`, `updatePrompt(input)`, `updateEntity(input)`, `startRun(input, tokenId)`, `recordObservation(runId, tokenId, input)`, `finishRun(runId, tokenId, input)`, and `recordCrawlerChecks(input)`.
- Produces service methods with the same names after validation, plus `syncGeoPromptCatalog()` from runtime.
- Consumes Task 1 schema and Task 2 normalized inputs.

- [ ] **Step 1: Write failing service lifecycle tests**

Test that a run starts only with bounded planned counts; only its initiating token can record/finish it; repetitions are `1..3`; duplicate records return the existing observation; `cited=true` requires an owned citation; `linked=true` requires an owned URL; snapshots over 16 KiB are rejected; metadata over 16 KiB is rejected; and finish counters must match stored rows.

- [ ] **Step 2: Run service tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/service.test.ts src/server/geo-monitoring/repository.test.ts`

Expected: FAIL because the repository/service lifecycle is absent.

- [ ] **Step 3: Implement transaction-safe repository writes**

`recordObservation` writes the observation, mentions, citations, and explicit fan-out queries in one transaction. Candidate competitors are created only after two observations in different completed runs co-mention the same canonical name/domain; they remain `candidate` and do not enter Share of Voice.

- [ ] **Step 4: Implement strict service validation**

Use safe errors prefixed `geo_`; never echo the supplied snapshot or URL in an error. Accept only bounded plain metadata, confirmed platform/mode values, normalized paths/URLs, and consistent flags.

- [ ] **Step 5: Implement catalog synchronization**

Insert missing catalog topics/prompts, promote catalog-marked active prompts, preserve administrator edits and archived records, and return `{ inserted, promoted, preserved }`.

- [ ] **Step 6: Run focused tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/service.test.ts src/server/geo-monitoring/repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/geo-monitoring
git commit -m "feat: add controlled GEO run lifecycle"
```

### Task 4: GEO analytics and scoped MCP surface

**Files:**
- Create: `src/server/geo-monitoring/analytics.ts`
- Create: `src/server/geo-monitoring/analytics.test.ts`
- Create: `src/server/geo-monitoring/mcpService.ts`
- Create: `src/server/geo-monitoring/mcpService.test.ts`
- Modify: `src/server/mcp/runtime.ts`
- Modify: `src/server/mcp/http.ts`
- Modify: `src/server/mcp/tools.ts`
- Modify: `src/server/mcp/tools.test.ts`

**Interfaces:**
- Produces read methods `getOverview(filters)`, `listTopics(input)`, `listEntities(input)`, `listPrompts(input)`, `listObservations(input)`, `getObservationEvidence(id)`, `listCitations(input)`, `listFanoutQueries(input)`, and `listReferrals(input)`.
- Produces MCP tools `get_geo_overview`, `list_geo_topics`, `list_geo_entities`, `list_geo_prompts`, `list_geo_observations`, `list_geo_citations`, `list_geo_fanout_queries`, `list_geo_referrals`, `create_geo_prompt_candidate`, `start_geo_run`, `record_geo_observation`, and `finish_geo_run`.
- Consumes: `createGeoMonitoringService()` from Task 3; uses existing scopes `seo:read` and `seo:write` without introducing new token scopes.

- [ ] **Step 1: Write failing analytics tests**

Assert transparent numerator/denominator outputs for mention rate, citation rate, citation share, owned-source coverage, and confirmed-entity Share of Voice. Assert the four action-matrix buckets, equal-set comparisons, exclusion of partial/failed runs, three-repetition requirement, and “insufficient baseline” before three weekly snapshots.

- [ ] **Step 2: Write failing MCP registration/security tests**

Assert read tools appear with `seo:read`; write tools appear only with both scopes; response snapshots never appear in list outputs; observation writes are capped by the MCP request limit; token A cannot mutate token B's run; and all failures return safe `geo_*` codes.

- [ ] **Step 3: Run tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/analytics.test.ts src/server/geo-monitoring/mcpService.test.ts src/server/mcp/tools.test.ts`

Expected: FAIL because analytics and GEO tools are absent.

- [ ] **Step 4: Implement analytics and paginated read methods**

Return absolute counts beside every rate. Keep platform, mode, language, region, topic, prompt-set fingerprint, and period in each comparison result. Do not expose private snapshots from any list method.

- [ ] **Step 5: Register the scoped MCP service and tools**

Add `geoForToken(tokenId)` to runtime services and pass it through HTTP per authenticated principal. Use strict Zod objects, maximum 100 list rows, 1–366 day periods, three repetitions, maximum 100 citations/mentions/fan-out rows per observation, and read-only MCP annotations for list tools.

- [ ] **Step 6: Run focused tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/analytics.test.ts src/server/geo-monitoring/mcpService.test.ts src/server/mcp/tools.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/geo-monitoring src/server/mcp
git commit -m "feat: expose evidence-backed GEO analytics over MCP"
```

### Task 5: Yandex Metrica AI referrals without false attribution

**Files:**
- Modify: `src/server/seo-monitoring/providers/yandexMetrika.ts`
- Modify: `src/server/seo-monitoring/providers/yandexMetrika.test.ts`
- Modify: `src/server/seo-monitoring/collector.ts`
- Modify: `src/server/seo-monitoring/collector.test.ts`
- Modify: `src/server/geo-monitoring/repository.ts`
- Create: `src/server/geo-monitoring/referrals.ts`
- Create: `src/server/geo-monitoring/referrals.test.ts`

**Interfaces:**
- Produces: `NormalizedGeoReferral` and `classifyAiReferral({ refererDomain, refererPath, utmSource }): GeoPlatform | null`.
- Extends provider with `collectAiReferrals(window): Promise<NormalizedGeoReferral[]>` using official dimensions `ym:s:date`, `ym:s:refererDomain`, `ym:s:refererPath`, and `ym:s:startURLPath`.
- Extends repository with `upsertGeoReferrals(rows): Promise<number>`.

- [ ] **Step 1: Write failing classification/provider tests**

Recognize verified ChatGPT, Gemini, and Copilot referrers plus explicit normalized UTM source values. Reject suffix attacks such as `chatgpt.com.evil.example`. Do not classify generic `google.com`, `bing.com`, `yandex.ru`, or direct traffic as AI; Alice referral remains unavailable unless a distinguishable verified signal exists.

- [ ] **Step 2: Run tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/referrals.test.ts src/server/seo-monitoring/providers/yandexMetrika.test.ts src/server/seo-monitoring/collector.test.ts`

Expected: FAIL because AI referral collection is absent.

- [ ] **Step 3: Implement the Metrica report and strict completeness checks**

Use `accuracy=full`, reject sampled/rounded/incomplete reports, collect visits/users/new users/pageviews and landing paths, and deduplicate a visit classified by both referrer and UTM inside the provider output key.

- [ ] **Step 4: Add partial-source handling to the existing Metrica collector**

Organic traffic and AI-referral writes are independent slices within one source run. If one succeeds and the other fails, finish the run `partial`, retain successful rows, and report only a safe error code plus completed/failed slice counts.

- [ ] **Step 5: Run focused tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/referrals.test.ts src/server/seo-monitoring/providers/yandexMetrika.test.ts src/server/seo-monitoring/collector.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/geo-monitoring src/server/seo-monitoring
git commit -m "feat: collect verified AI referral traffic"
```

### Task 6: GEO crawler health and production collection integration

**Files:**
- Create: `src/server/geo-monitoring/crawlerHealth.ts`
- Create: `src/server/geo-monitoring/crawlerHealth.test.ts`
- Create: `src/server/geo-monitoring/collector.ts`
- Create: `src/server/geo-monitoring/collector.test.ts`
- Modify: `src/server/seo-monitoring/runtime.ts`
- Modify: `server/seo-collect.mjs`
- Create: `server/geo-core-sync.mjs`
- Create: `server/geo-core-sync.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `checkGeoCrawlerHealth(origin: URL, fetchImpl?: typeof fetch): Promise<GeoCrawlerCheckInput[]>`.
- Produces: `runGeoCollection()` for AI referrals already attached to SEO collection plus crawler-health persistence; controlled AI prompt checks remain MCP-driven.
- Produces: CLI script `geo:core:sync` that invokes exported `syncGeoPromptCatalog()`.

- [ ] **Step 1: Write failing crawler and CLI tests**

Cover robots rules for OAI-SearchBot, Googlebot, Bingbot, YandexBot and separate GPTBot handling; sitemap 200/no redirect; canonical/indexability checks for active prompt targets; 401/403/429 failures; timeouts; bounded response bodies; and secret-free CLI errors.

- [ ] **Step 2: Run tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/crawlerHealth.test.ts src/server/geo-monitoring/collector.test.ts && node --test server/geo-core-sync.test.mjs`

Expected: FAIL because the collector and sync CLI are missing.

- [ ] **Step 3: Implement crawler checks**

Fetch only the configured HTTPS site origin and normalized same-origin targets; disallow redirects to another origin and private/link-local IP literals; cap each body; store safe status/reason codes rather than response bodies.

- [ ] **Step 4: Wire daily collection and catalog synchronization**

Extend `runSeoCollection()` to append a `geo_crawler` report without making disabled AI platforms look failed. Add `--source=geo-crawler`, keep compact CLI output secret-free, and add `geo:core:sync` to package scripts.

- [ ] **Step 5: Run focused tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/crawlerHealth.test.ts src/server/geo-monitoring/collector.test.ts && node --test server/geo-core-sync.test.mjs server/seo-collect.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/geo-monitoring src/server/seo-monitoring server package.json
git commit -m "feat: add GEO crawler health collection"
```

### Task 7: Evidence-backed GEO promotion experiments

**Files:**
- Create: `src/server/geo-monitoring/experiments.ts`
- Create: `src/server/geo-monitoring/experiments.test.ts`
- Modify: `src/server/geo-monitoring/repository.ts`
- Modify: `src/server/geo-monitoring/service.ts`
- Modify: `src/server/geo-monitoring/analytics.ts`
- Modify: `src/server/geo-monitoring/mcpService.ts`
- Modify: `src/server/mcp/tools.ts`
- Modify: `src/server/mcp/tools.test.ts`

**Interfaces:**
- Produces service methods `listExperiments(input)`, `createExperimentCandidate(input, actor)`, `approveExperiment(input, adminActor)`, `linkExperimentChange(input, adminActor)`, and `evaluateExperiment({ id, milestone, evaluatedAt }, actor)`.
- Produces MCP tools `list_geo_experiments`, `create_geo_experiment_candidate`, and `record_geo_experiment_evaluation`; MCP cannot approve an experiment, link an unverified content change, publish content, or roll anything back.
- Consumes: completed comparable GEO runs, existing `seo_recommendations`, existing `seo_changes`, active prompt IDs, and referral/crawler metrics.

- [ ] **Step 1: Write failing lifecycle and attribution tests**

Assert that a candidate requires an existing evidence-backed recommendation, target page, immutable prompt set, platform/mode/language/region, action type, hypothesis, primary metric, direction, minimum delta, and 7/14/28-day windows. Assert that only an admin can approve and link a real `seo_changes` row, only one experiment can be active for the same page/comparable prompt set, and evaluation never edits public content.

- [ ] **Step 2: Write failing evaluation tests**

Assert that day 7 is labeled an early signal, day 14 intermediate, and day 28 final; only full days after `implemented_at` count; baseline and result use identical prompt fingerprints and dimensions; insufficient repetitions return `inconclusive`; a second material page change marks `confounded`; and final `won/lost/inconclusive` follows the stored direction and minimum delta rather than an opaque score.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/experiments.test.ts src/server/mcp/tools.test.ts`

Expected: FAIL because GEO experiments do not exist.

- [ ] **Step 4: Implement the promotion lifecycle**

Allowed action types are `content_answer`, `first_party_evidence`, `internal_linking`, `technical_indexing`, `structured_data`, and `authority_outreach`. Store structured success criteria with explicit unit; calculate metric deltas from completed comparable runs; never mark purchased reviews, fabricated evidence, or mass outreach as an allowed action.

- [ ] **Step 5: Implement safe MCP experiment tools**

Return absolute baseline/result values, delta, sample counts, completeness, milestone, confounding changes, and verdict. Candidate creation and evaluation require both SEO scopes; listing requires `seo:read`. No tool accepts arbitrary HTML, a content mutation, or an automatic rollback instruction.

- [ ] **Step 6: Run focused tests**

Run: `yarn tsx --test --test-concurrency=1 src/server/geo-monitoring/experiments.test.ts src/server/geo-monitoring/analytics.test.ts src/server/geo-monitoring/mcpService.test.ts src/server/mcp/tools.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/geo-monitoring src/server/mcp
git commit -m "feat: add measurable GEO promotion experiments"
```

### Task 8: Separate AI visibility admin report with evidence drill-down

**Files:**
- Create: `src/routes/admin/seo-ai-visibility.tsx`
- Create: `src/routes/admin/geo-read.server.ts`
- Create: `src/routes/admin/geo-actions.server.ts`
- Create: `src/routes/admin/geo-shared.tsx`
- Create: `src/routes/admin/geo-sections.test.tsx`
- Modify: `src/routes/admin/seo-layout.tsx`
- Modify: `src/routes.ts`

**Interfaces:**
- Produces route `/admin/seo/ai-visibility/` with query view `overview|platforms|prompts|entities|sources|evidence|traffic|promotion`.
- Consumes: Task 4 read methods and Task 3 admin mutations with `{ adminUserId }` actor where applicable.
- Produces authenticated evidence detail that alone includes the bounded snapshot and always sets `Cache-Control: no-store`.

- [ ] **Step 1: Write failing SSR and loader/action tests**

Assert eight distinct views, only the selected view's dataset is loaded, Russian labels/tooltips and `дд.мм.гггг` dates, absolute numerator/denominator beside rates, source freshness, formulas, action matrix, confirmed-vs-candidate competitors, and explanatory empty states. Assert no page contains PDF/print controls and no snapshot appears in overview/list markup.

- [ ] **Step 2: Run tests and confirm failure**

Run: `yarn tsx --test --test-concurrency=1 src/routes/admin/geo-sections.test.tsx src/routes/admin/seo-sections.test.tsx`

Expected: FAIL because the route and navigation item are absent.

- [ ] **Step 3: Implement protected loader/action boundaries**

Reuse `requireAdminPage`, CSRF validation, private admin headers, offset cursors, safe 422 validation errors, and safe 503 availability errors. Admin actions may activate/archive/edit prompts and confirm/archive competitor entities; they never edit content entries.

- [ ] **Step 4: Implement the eight focused views**

Use internal tabs so only one report is visible at a time. The evidence view opens a single observation by UUID, shows its bounded snapshot with truncation warning, mentions, citation URLs, and explicit fan-out. The promotion view shows opportunity, hypothesis, target prompts/page, approved change, baseline, 7/14/28-day results, confounders, and verdict; approval and change linkage require CSRF-protected admin actions. All tables have named columns, help text, internal horizontal overflow, and no page-level horizontal overflow.

- [ ] **Step 5: Run focused tests**

Run: `yarn tsx --test --test-concurrency=1 src/routes/admin/geo-sections.test.tsx src/routes/admin/seo-sections.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes.ts src/routes/admin
git commit -m "feat: add focused GEO visibility reports"
```

### Task 9: Deployment packaging, daily-agent contract, and complete verification

**Files:**
- Modify: `Dockerfile`
- Modify: `scripts/deploy-slot.sh`
- Modify: `deploy/docker-compose.team.yml`
- Modify: `deploy/env/operations.env.example`
- Modify: `deploy/README.md`
- Modify: `tests/deploy/seo-monitoring.test.mjs`
- Modify: `tests/deploy/scripts.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Packages: `content/seo/geo-prompts.ru.json` and `server/geo-core-sync.mjs` in the immutable web image.
- Deploys: migration, GEO catalog sync, existing SEO catalog sync, content release, candidate slot, smoke, then route switch.
- Configures: `GEO_SITE_ORIGIN=https://kordev.team` for the isolated SEO job only; no AI vendor credential is required for MCP-driven checks.

- [ ] **Step 1: Write failing packaging/deploy tests**

Assert the catalog and sync CLI exist in the image, GEO sync runs after migration and before candidate startup, crawler origin reaches only the SEO job, AI vendor/cookie variables are absent from web and lead-worker services, and backup still precedes migration.

- [ ] **Step 2: Run deploy tests and confirm failure**

Run: `node --test tests/deploy/seo-monitoring.test.mjs tests/deploy/scripts.test.mjs tests/deploy/image.test.mjs`

Expected: FAIL because packaging and deployment do not yet include GEO.

- [ ] **Step 3: Update image, compose, deploy script, and operator documentation**

Validate `GEO_SITE_ORIGIN` as an exact HTTPS origin. Document that controlled answers are collected by the authorized chat agent over MCP; do not add server-side AI UI scraping or cookie storage.

- [ ] **Step 4: Run the complete local verification suite**

Run: `yarn typecheck && yarn test && yarn build`

Expected: all checks PASS and the production build completes.

- [ ] **Step 5: Run release-gate and migration dry checks**

Run: `bash scripts/release-gate.sh`

Expected: exit 0 with no secret material in output.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile scripts/deploy-slot.sh deploy README.md tests/deploy
git commit -m "chore: package and deploy GEO monitoring"
```

- [ ] **Step 7: Deploy and verify production**

Use the existing blue/green deployment path. Verify migration inventory, GEO catalog counts, `/admin/seo/ai-visibility/`, MCP tool discovery, one three-repetition test run, evidence drill-down, crawler health, and Metrica AI-referral empty state. Do not fabricate a baseline where platforms return no data.

- [ ] **Step 8: Update the existing daily SEO heartbeat**

Extend automation `seo` to rotate active GEO prompts after the official SEO collection, use the new MCP GEO tools, preserve platform/mode/region, record three repetitions, remain quiet on healthy unchanged data, and create recommendations only after the minimum evidence threshold. Every two weeks it may propose one measurable experiment per page; at 7/14/28 full days it records evaluations and flags confounders. The automation must never approve an experiment, publish content, fabricate external signals, or treat missing platform data as zero.
