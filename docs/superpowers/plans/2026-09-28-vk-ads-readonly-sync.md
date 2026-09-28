# VK Ads Read-Only Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, resumable, read-only mirror of the entire accessible VK Ads cabinet, refreshed daily and exposed only through local MCP and admin read models.

**Architecture:** A dedicated `src/server/advertising/vk/` bounded context owns strict configuration, encrypted OAuth state, an allowlisted GET-only provider, private creative storage, PostgreSQL mirror repositories, and the collector. Production jobs are the only components allowed to contact VK; MCP and the admin UI read the local mirror and private object store without triggering synchronization.

**Tech Stack:** TypeScript 5.9, Node.js 22, PostgreSQL 16, Drizzle ORM/Kit, Zod 4, AWS SDK S3 client, React Router 7, MCP SDK 2, Node test runner, Docker Compose, systemd.

**Spec:** `docs/superpowers/specs/2026-09-28-vk-ads-readonly-sync-design.md`

## Global Constraints

- Production VK origin is the code constant `https://ads.vk.ru`; it is not configurable through environment variables.
- The OAuth token endpoint `POST /api/v2/oauth2/token.json` is the only non-GET VK request; advertising resources expose no arbitrary method, path, body, or URL interface.
- Advertising reads are limited to `/api/v2/ad_plans.json`, `/api/v2/ad_groups.json`, `/api/v2/banners.json`, and `/api/v2/statistics/{ad_plans|ad_groups|banners}/day.json`.
- The daily statistics lookback is exactly seven inclusive calendar dates; it is not configurable through production environment variables.
- `VK_ADS_SYNC_ENABLED` defaults to `false`; disabled mode must not require, read, log, or contact any secret-bearing dependency.
- The previously disclosed client secret is compromised and must never be copied into source, tests, fixtures, logs, commits, or runtime configuration.
- Access token and refresh token are encrypted together as a versioned JSON envelope with AES-256-GCM and a fresh nonce for every write; only ciphertext, nonce, auth tag, expiry, version, and timestamps are stored.
- VK provider bodies, bearer headers, OAuth tokens, client secret, targeting user lists, lead PII, and unredacted contacts are never persisted or returned by read models.
- Creative images accept only HTTPS JPEG, PNG, or WebP, at most 20 MiB, after public-DNS and magic-byte validation on every redirect; videos remain metadata plus a safe HTTPS source URL.
- Creative objects use private ACL, `Cache-Control: private, no-store`, SHA-256 deduplication, and the fixed prefix `ads/vk/creatives/`; no stable public object URL is generated.
- Sync modes are exactly `check`, `backfill`, and `daily`; MCP and the admin UI cannot invoke any mode.
- `check` may validate configuration, OAuth, account access, database, and object storage but must not mutate advertising mirror tables.
- Backfill is resumable and idempotent; daily sync re-reads all campaigns, changed groups/ads with overlap, and the last seven dates without treating absence from an incremental response as deletion.
- All external/provider error details are reduced to the spec's bounded `ads_vk_*` error codes before logging or storage.
- The admin surface at `/admin/ads/vk/` is read-only and has no refresh, backfill, start, stop, budget, bid, status, or edit control.
- The daily systemd timer runs at `03:30 Europe/Moscow`, has `Persistent=true`, and uses a bounded randomized delay.
- No new runtime package is added unless an existing platform API or installed dependency cannot satisfy the requirement and the reason is documented in the implementing commit.

## Review Focus

- Two workers refreshing the same nearly expired token must produce one rotation, and the loser must re-read the winner's version instead of invalidating it — pinned in Task 4 concurrency tests.
- A creative redirect, DNS rebinding result, IPv4-mapped IPv6 address, or secondary address resolving to a private range must fail before any body is trusted — pinned in Task 6 downloader tests.
- A non-advancing provider page, duplicate object ID within/across pages, or oversized success body must terminate with `ads_vk_contract_invalid` rather than loop or double-count — pinned in Task 5 provider tests and Task 8 collector tests.
- A crash after a page transaction commits but before the next request must resume from the committed checkpoint without skipping or duplicating rows — pinned in Task 8 collector integration tests.
- Moscow midnight, month/year rollover, and DST-like clock inputs must still yield exactly seven inclusive ISO dates for daily statistics — pinned in Task 8 date-window tests.

---

### Task 1: VK Ads contracts, errors, and strict configuration

**Files:**
- Create: `src/server/advertising/vk/contracts.ts`
- Create: `src/server/advertising/vk/errors.ts`
- Create: `src/server/advertising/vk/config.ts`
- Test: `src/server/advertising/vk/config.test.ts`

**Interfaces:**
- Consumes: `process.env` only through an injected `Readonly<Record<string, string | undefined>>`.
- Produces: `VK_ADS_ORIGIN`, `VK_ADS_DAILY_LOOKBACK_DAYS`, `VK_ADS_IMAGE_MAX_BYTES`, `VK_ADS_MCP_IMAGE_MAX_BYTES`, `VK_ADS_ERROR_CODES`, `VkAdsError`, `redactVkAdsLogRecord(value)`, `readVkAdsConfig(environment)`, and `safeVkAdsConfigSummary(config)`.
- Produces the shared discriminated config `VkAdsConfig = { enabled: false; origin: URL; lookbackDays: 7 } | { enabled: true; origin: URL; lookbackDays: 7; clientId: string; clientSecret: string; tokenEncryptionKey: Buffer; storage: VkAdsStorageConfig }`.
- Produces shared domain types `VkAdsSyncMode`, `VkAdsSyncStatus`, `VkAdsObjectKind`, `VkAdsCheckpoint`, provider source DTOs, normalized account/campaign/group/ad/creative/metric records, `VkAdsPage<T>`, `VkAdsReadPage<T>`, and bounded read filters used by later tasks.

- [ ] **Step 1: Write the failing configuration and contract tests**

Add tests named `disabled config is inert and secret-free`, `enabled config requires exact credentials and a 32-byte base64 key`, `production constants cannot be overridden`, `safe summary exposes fingerprints but no credential material`, and `structured log redaction removes secrets and contacts recursively`. Assert:

```ts
assert.deepEqual(readVkAdsConfig({}), { enabled: false, origin: new URL("https://ads.vk.ru"), lookbackDays: 7 });
assert.equal(VK_ADS_IMAGE_MAX_BYTES, 20 * 1024 * 1024);
assert.equal(VK_ADS_MCP_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
assert.throws(() => readVkAdsConfig({ VK_ADS_SYNC_ENABLED: "true" }), /ads_vk_config_invalid/);
assert.doesNotMatch(JSON.stringify(summary), /client-secret|storage-secret|encryption-key/);
```

Cover whitespace, malformed booleans, a decoded encryption key of 31 or 33 bytes, non-HTTPS S3 endpoints, credentials embedded in URLs, query/hash/port in the endpoint, invalid SSE values, and attempts to set `VK_ADS_ORIGIN` or a lookback override.

- [ ] **Step 2: Run the new test and verify RED**

Run: `yarn tsx --test src/server/advertising/vk/config.test.ts`

Expected: FAIL because the VK Ads modules do not exist.

- [ ] **Step 3: Implement the shared contracts, bounded errors, and parser**

Use these exact environment names when enabled: `VK_ADS_CLIENT_ID`, `VK_ADS_CLIENT_SECRET`, `VK_ADS_TOKEN_ENCRYPTION_KEY_B64`, `VK_ADS_S3_ENDPOINT`, `VK_ADS_S3_REGION`, `VK_ADS_S3_BUCKET`, `VK_ADS_S3_ACCESS_KEY_ID`, `VK_ADS_S3_SECRET_ACCESS_KEY`, and `VK_ADS_S3_SSE`. Fix the object prefix in code as `ads/vk/creatives`; do not add a prefix env variable. `VkAdsError` accepts only the codes listed in spec section 9 and exposes no `cause`, response body, URL query, or credentials in `message`. The log redactor removes secret/contact keys and email/phone-like values recursively before JSON serialization, limits depth/collection/string sizes, and preserves only bounded technical identifiers.

- [ ] **Step 4: Run the focused tests and typecheck**

Run: `yarn tsx --test src/server/advertising/vk/config.test.ts && yarn typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/advertising/vk/contracts.ts src/server/advertising/vk/errors.ts src/server/advertising/vk/config.ts src/server/advertising/vk/config.test.ts
git commit -m "feat: add VK Ads synchronization contracts"
```

### Task 2: Encrypted OAuth envelope primitive

**Files:**
- Create: `src/server/advertising/vk/tokenCrypto.ts`
- Test: `src/server/advertising/vk/tokenCrypto.test.ts`

**Interfaces:**
- Consumes: `VkAdsTokenEnvelope = { schemaVersion: 1; accessToken: string; refreshToken: string; expiresAt: string }` and a 32-byte `Buffer` from Task 1.
- Produces: `EncryptedVkAdsToken = { ciphertext: Buffer; nonce: Buffer; authTag: Buffer; algorithm: "aes-256-gcm"; schemaVersion: 1 }`, `encryptVkAdsToken(envelope, key, randomBytes?)`, and `decryptVkAdsToken(state, key)`.

- [ ] **Step 1: Write failing crypto tests**

Test exact round-trip, fresh 12-byte nonces creating different ciphertext for the same envelope, 16-byte auth tags, invalid key length, tampered ciphertext/tag/nonce, unsupported schema version, malformed decrypted JSON, expired/invalid ISO timestamp structure, and a serialized encrypted state that does not contain either plaintext token.

- [ ] **Step 2: Run the crypto test and verify RED**

Run: `yarn tsx --test src/server/advertising/vk/tokenCrypto.test.ts`

Expected: FAIL because `tokenCrypto.ts` is missing.

- [ ] **Step 3: Implement AES-256-GCM encryption and fail-closed decryption**

Use Node `crypto.createCipheriv/createDecipheriv`; authenticate `"kordevteam:vk-ads-token:v1"` as AAD. Convert every invalid key, parse, schema, authentication, or envelope validation failure to `new VkAdsError("ads_vk_oauth_invalid")` without attaching the original error.

- [ ] **Step 4: Run the focused tests**

Run: `yarn tsx --test src/server/advertising/vk/tokenCrypto.test.ts`

Expected: PASS with no plaintext token in test diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/server/advertising/vk/tokenCrypto.ts src/server/advertising/vk/tokenCrypto.test.ts
git commit -m "feat: encrypt VK Ads OAuth state"
```

### Task 3: PostgreSQL mirror schema, migration, and backup inventory

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `drizzle/0014_vk_ads_readonly_sync.sql` (generated)
- Create: `drizzle/meta/0014_snapshot.json` (generated)
- Modify: `drizzle/meta/_journal.json` (generated)
- Modify: `scripts/postgres-backup.mjs`
- Modify: `tests/deploy/backup.test.mjs`
- Test: `src/server/advertising/vk/schema.test.ts`

**Interfaces:**
- Consumes: normalized record and checkpoint types from Task 1.
- Produces Drizzle tables `adVkOauthStates`, `adVkSyncRuns`, `adVkAccounts`, `adVkCampaigns`, `adVkAdGroups`, `adVkAds`, `adVkCreativeVersions`, `adVkDailyMetrics`, and `adVkExperimentLinks`.
- Produces enums `adVkSyncMode`, `adVkSyncStatus`, `adVkObjectKind`, and `adVkMediaKind` with values from the spec.

- [ ] **Step 1: Write the failing schema and backup assertions**

In `schema.test.ts`, assert all nine tables are exported; use `getTableConfig` to pin unique keys, foreign keys, check constraints, and the absence of columns named or matching `raw`, `authorization`, `client_secret`, `access_token`, or `refresh_token`. Pin sync-run `stage`, safe `error_code`, UUID `correlation_id`, bounded `counters`, and typed `checkpoint` fields. In `backup.test.mjs`, add all nine physical table names to `postMigrationTableCounts`, migration history `0014`, and the missing-required-table loop.

- [ ] **Step 2: Run schema and backup tests and verify RED**

Run: `yarn tsx --test src/server/advertising/vk/schema.test.ts && node --test tests/deploy/backup.test.mjs`

Expected: FAIL because the tables and migration are absent.

- [ ] **Step 3: Add the exact bounded schema**

Implement spec section 6 with these identity rules: external VK IDs are non-empty `varchar(160)` strings; accounts are unique by external account ID, while campaigns/groups/ads are unique by `(account_id, external_id)`; creative versions are unique `(ad_id, fingerprint)`; metrics are unique `(object_kind, external_id, metric_date)`; experiment links are unique `(variant_id, object_kind, external_id)`. Store OAuth as one `encrypted_envelope bytea`, `nonce bytea`, `auth_tag bytea`, `expires_at`, integer `version`, and `refreshed_at`. Use `numeric(18, 6)` for money, `bigint` for provider counts, bounded JSON objects only for targeting labels/checkpoint/counters, and `onDelete: "restrict"` for historical links.

- [ ] **Step 4: Generate and inspect the migration**

Run: `yarn db:generate --name vk_ads_readonly_sync && yarn db:check`

Expected: PASS and only `0014_vk_ads_readonly_sync.sql`, its snapshot, and journal changes are generated. Inspect the SQL to confirm it creates only the nine new tables/enums/indexes and does not drop or rewrite existing advertising tables.

- [ ] **Step 5: Extend required backup validation**

Add the nine tables to the current required-table set in `postgres-backup.mjs`; preserve pre-migration restore compatibility through migration history.

- [ ] **Step 6: Run schema, migration, and backup tests**

Run:

`TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/advertising/vk/schema.test.ts && node --test tests/deploy/backup.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts src/server/advertising/vk/schema.test.ts drizzle/0014_vk_ads_readonly_sync.sql drizzle/meta/0014_snapshot.json drizzle/meta/_journal.json scripts/postgres-backup.mjs tests/deploy/backup.test.mjs
git commit -m "feat: add VK Ads mirror schema"
```

### Task 4: Serialized OAuth repository and token manager

**Files:**
- Create: `src/server/advertising/vk/locks.ts`
- Create: `src/server/advertising/vk/tokenRepository.ts`
- Create: `src/server/advertising/vk/oauthClient.ts`
- Create: `src/server/advertising/vk/tokenManager.ts`
- Test: `src/server/advertising/vk/tokenManager.test.ts`
- Test: `src/server/advertising/vk/tokenRepository.test.ts`

**Interfaces:**
- Consumes: Task 1 config/errors, Task 2 crypto, Task 3 `adVkOauthStates`, and a PostgreSQL URL supplied at runtime.
- Produces `createVkAdsLockFactory(databaseUrl)` with `withOAuthLock<T>(operation: () => Promise<T>): Promise<T>` and `tryAcquireSyncLease(): Promise<{ release(): Promise<void> } | null>` backed by dedicated `pg.Client` sessions and fixed bigint advisory-lock keys.
- Produces `createVkAdsTokenRepository(db)` with `get(fingerprint)`, `insertInitial(state)`, and `replaceIfVersion(fingerprint, expectedVersion, state): Promise<boolean>`.
- Produces `createVkAdsOAuthClient(config, dependencies?)` with only `issue(): Promise<VkAdsTokenEnvelope>` and `refresh(refreshToken): Promise<VkAdsTokenEnvelope>`; both POST the fixed token path as form data.
- Produces `createVkAdsTokenManager({ repository, oauth, locks, key, clientFingerprint, clock })` with `getAccessToken(): Promise<string>` and `forceRefresh(staleAccessToken: string): Promise<string>`.

- [ ] **Step 1: Write failing repository and token-manager tests**

Cover initial issuance, refresh at exactly `expiresAt - 5 minutes`, no refresh outside that window, optimistic version loss followed by re-read, one forced refresh for a stale token, revoked/invalid/decrypt failures with no retry, form encoding, fixed OAuth URL, response content-type/body bounds, and logs/errors containing no token or response body.

Add a real-PostgreSQL concurrency test that pauses the first refresh, starts a second manager for the same fingerprint, releases the first, and asserts exactly one OAuth refresh call and both callers receive the winning access token. Also assert `tryAcquireSyncLease()` returns `null` while another session owns it and succeeds after release.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/tokenCrypto.test.ts src/server/advertising/vk/tokenRepository.test.ts src/server/advertising/vk/tokenManager.test.ts`

Expected: FAIL because persistence, locks, OAuth client, and manager are absent.

- [ ] **Step 3: Implement repository, dedicated advisory-lock sessions, and OAuth client**

The OAuth lock blocks and always unlocks/closes in `finally`; the sync lease uses `pg_try_advisory_lock` and never contacts VK when unavailable. OAuth request handling allows only the fixed production origin or an explicitly injected test origin, caps response bytes, validates JSON with Zod, and maps provider error classes to `ads_vk_oauth_invalid`, `ads_vk_token_expired`, or `ads_vk_token_revoked` without preserving raw fields.

- [ ] **Step 4: Implement the token manager**

Inside the OAuth lock, always re-read the row before issuing/refreshing. Encrypt access and refresh tokens together, replace with `version + 1`, and on optimistic conflict re-read once. `forceRefresh(staleAccessToken)` returns the already-rotated token when storage no longer decrypts to `staleAccessToken`; it must not perform a second refresh.

- [ ] **Step 5: Run focused tests**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/tokenCrypto.test.ts src/server/advertising/vk/tokenRepository.test.ts src/server/advertising/vk/tokenManager.test.ts`

Expected: PASS; database inspection in the test finds neither plaintext access nor refresh token.

- [ ] **Step 6: Commit**

```bash
git add src/server/advertising/vk/locks.ts src/server/advertising/vk/tokenRepository.ts src/server/advertising/vk/oauthClient.ts src/server/advertising/vk/tokenManager.ts src/server/advertising/vk/tokenManager.test.ts src/server/advertising/vk/tokenRepository.test.ts
git commit -m "feat: serialize VK Ads OAuth rotation"
```

### Task 5: Allowlisted read-only VK provider

**Files:**
- Create: `src/server/advertising/vk/providerSchemas.ts`
- Create: `src/server/advertising/vk/provider.ts`
- Test: `src/server/advertising/vk/provider.test.ts`

**Interfaces:**
- Consumes: `{ getAccessToken(); forceRefresh(staleAccessToken) }`, injected `fetch`, `sleep`, jitter source, and optional test origin.
- Produces `VkAdsProvider` with only `checkAccount()`, `listCampaigns(page)`, `listAdGroups(page, changedSince?)`, `listAds(page, changedSince?)`, `getDailyStatistics(kind, ids, dateFrom, dateTo)`, and `downloadCreativeImage(source)`; the last method delegates to the downloader supplied in Task 6.
- Provider page input is `{ offset: number; limit: number }` with `1 <= limit <= 250`; output is `{ items, nextOffset: number | null }` and preserves no raw response.

- [ ] **Step 1: Build a local fake-VK HTTP fixture and failing contract tests**

Exercise bearer auth, documented query parameters, stable ID sorting, pagination, all three statistics paths, changed-since filters, status filters including blocked/deleted, unknown-field tolerance, known-field type rejection, response content-type/body bounds, and URL query redaction. Inspect every received request and assert advertising calls are GET with empty bodies and only allowlisted paths; OAuth is not part of this provider.

Pin retry behavior: one expired-token response causes exactly one forced refresh and one replay; 429 honors bounded `Retry-After`; network/5xx perform at most four total attempts with injected exponential backoff+jitter; other 4xx do not retry.

Pin the provider-owned Review Focus cases: a response whose next offset does not advance, duplicate IDs within one page, and an oversized `200` response all throw `ads_vk_contract_invalid` without another request. Cross-page duplicate detection belongs to the collector in Task 8 because `list*` returns one page at a time.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `yarn tsx --test src/server/advertising/vk/provider.test.ts`

Expected: FAIL because provider modules are missing.

- [ ] **Step 3: Implement strict schemas and request executor**

Use one private `request(pathConstant, query, tokenRetryState)` helper that cannot receive a method or body. Build paths only from literal maps, cap JSON before parsing, ignore unknown keys with `.strip()`, and fail known type mismatches. Never include raw response text, bearer value, full query, or provider message in exceptions.

- [ ] **Step 4: Implement the six public provider methods**

Normalize source responses into Task 1 DTOs, strip landing query/fragment while preserving origin/path, redact email/phone-like text, batch statistics IDs to the documented bound, and reject `dateFrom > dateTo` or more than 366 inclusive dates before I/O.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `yarn tsx --test src/server/advertising/vk/provider.test.ts && yarn typecheck`

Expected: PASS and the test request log contains no non-GET advertising request.

- [ ] **Step 6: Commit**

```bash
git add src/server/advertising/vk/providerSchemas.ts src/server/advertising/vk/provider.ts src/server/advertising/vk/provider.test.ts
git commit -m "feat: add read-only VK Ads provider"
```

### Task 6: Hardened creative downloader and private store

**Files:**
- Create: `src/server/advertising/vk/creativeDownloader.ts`
- Create: `src/server/advertising/vk/creativeStore.ts`
- Test: `src/server/advertising/vk/creativeDownloader.test.ts`
- Test: `src/server/advertising/vk/creativeStore.test.ts`

**Interfaces:**
- Consumes: Task 1 storage config and fixed limits.
- Produces `downloadVkCreativeImage(source: URL, dependencies): Promise<{ bytes: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp"; sha256: string; sourceUrl: string }>`.
- Produces `PrivateVkCreativeStore` with `checkReady()`, `putImage({ bytes, mimeType, sha256 }): Promise<{ objectKey: string }>`, and `getImage(objectKey): Promise<{ bytes: Buffer; mimeType: string; sha256: string }>`.
- Produces `createPrivateVkCreativeStore(config, injectedClient?, runtime?)`; new object keys are `${fixedPrefix}/${randomUUID()}` and callers cannot choose a key. SHA deduplication is coordinated with the mirror repository in Tasks 7–8, so the source filename and checksum never become the object key.

- [ ] **Step 1: Write failing downloader security tests**

Use injected DNS and HTTP fixtures. Accept valid JPEG/PNG/WebP by magic bytes even when a filename is absent. Reject HTTP, credentials, fragments, custom ports, IP literals, empty bodies, misleading content type, unsupported magic bytes, >20 MiB streams, too many redirects, redirect loops, and abort/timeouts.

For every initial/redirect hop, test all DNS answers, including loopback, RFC1918, link-local, CGNAT, multicast, documentation ranges, IPv6 ULA/link-local/loopback, and IPv4-mapped IPv6. Add a rebinding fixture where the first resolution is public and the redirected/reconnected resolution becomes private; assert the private target receives no request body read.

- [ ] **Step 2: Write failing private-store tests**

Assert random UUID keys under the fixed prefix, `IfNoneMatch: "*"`, SHA-256 object metadata, private/no-store put metadata, optional AES256 SSE, collision rejection, fixed-prefix ownership checks, 20 MiB bounded reads, missing-object mapping, and `checkReady()` using only a harmless bucket/prefix capability check. Assert source filenames and source URL paths never influence the key.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `yarn tsx --test src/server/advertising/vk/creativeDownloader.test.ts src/server/advertising/vk/creativeStore.test.ts`

Expected: FAIL because downloader/store modules do not exist.

- [ ] **Step 4: Implement validation, bounded streaming, and storage**

Resolve all addresses with `dns.promises.lookup(hostname, { all: true, verbatim: true })`, reject the hostname if any answer is non-public, and perform each download hop with `node:https.request` plus a custom `lookup` callback pinned to a validated address while preserving the original hostname for TLS/SNI. Set redirects to manual, re-resolve/revalidate/re-pin every hop, and never attach Authorization/cookies/custom headers. Hash bytes only after type/size validation. Use the installed AWS SDK and `NodeHttpHandler` for S3; do not reuse public-media URLs or lead attachment materialization.

- [ ] **Step 5: Wire provider image delegation**

Update `createVkAdsProvider` so `downloadCreativeImage(source)` calls only the injected downloader and never the authenticated request executor.

- [ ] **Step 6: Run downloader, store, and provider tests**

Run:

`yarn tsx --test src/server/advertising/vk/provider.test.ts src/server/advertising/vk/creativeDownloader.test.ts src/server/advertising/vk/creativeStore.test.ts`

Expected: PASS; the fake creative host sees no bearer header.

- [ ] **Step 7: Commit**

```bash
git add src/server/advertising/vk/creativeDownloader.ts src/server/advertising/vk/creativeStore.ts src/server/advertising/vk/creativeDownloader.test.ts src/server/advertising/vk/creativeStore.test.ts src/server/advertising/vk/provider.ts src/server/advertising/vk/provider.test.ts
git commit -m "feat: store validated VK creative images privately"
```

### Task 7: Transactional mirror repository and bounded read models

**Files:**
- Create: `src/server/advertising/vk/repository.ts`
- Create: `src/server/advertising/vk/readService.ts`
- Test: `src/server/advertising/vk/repository.test.ts`
- Test: `src/server/advertising/vk/readService.test.ts`

**Interfaces:**
- Consumes: Task 3 tables and Task 1 normalized records.
- Produces atomic write methods `startRun`, `findResumableBackfill`, `storeAccount`, `storeCampaignPage`, `storeAdGroupPage`, `storeAdPage`, `findStoredImageBySha256`, `storeCreativeVersion`, `storeMetricWindow`, `updateRunCheckpoint`, and `finishRun`; every page/window method writes rows, counters, and the next checkpoint in one transaction.
- Produces `createVkAdsReadService(repository, creativeStore)` with `getSyncStatus()`, `listCampaigns(input)`, `listAdGroups(input)`, `listAds(input)`, `getAd(id)`, `getStatistics(input)`, and `getCreativeImage(id, maxBytes)`.
- List inputs use bounded `limit` 1–100 and opaque base64url keyset cursors containing only versioned sort keys; statistics allow at most 366 inclusive dates and at most 100 object IDs.

- [ ] **Step 1: Write failing PostgreSQL repository tests**

Test idempotent account/campaign/group/ad/metric upserts; creative version interval closing/opening only when fingerprint changes; SHA lookup reusing the first stored random object key across ads; metric correction replacing the same natural key; atomic checkpoint/counter update; resumable run selection; safe partial/failed completion; explicit inactive/deleted markers; and experiment links that require existing experiment/variant/object rows.

Assert incremental absence does not alter `inactiveAt`, while an explicit provider deleted/blocked status does. Assert no repository return value contains encrypted OAuth state, raw provider payload, targeting lists, email, phone, or full landing query.

- [ ] **Step 2: Write failing read-service tests**

Test stable keyset traversal with equal timestamps, cursor tamper/version rejection, filters by campaign/group/status/date, aggregation without floating-point coercion, redaction of accidental contacts in creative text, safe landing origin/path, missing image behavior, and a 5 MiB MCP image limit distinct from the 20 MiB stored-object limit.

- [ ] **Step 3: Run focused database tests and verify RED**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/repository.test.ts src/server/advertising/vk/readService.test.ts`

Expected: FAIL because repository/read service are absent.

- [ ] **Step 4: Implement transactional writes and safe keyset reads**

Use PostgreSQL numeric strings at the repository boundary and convert only counts proven `Number.isSafeInteger`; preserve money as decimal strings in DTOs. Cursor decode must validate schema, filter fingerprint, and maximum length before querying. Store only normalized bounded JSON and compute deterministic SHA-256 fingerprints from canonicalized fields.

- [ ] **Step 5: Run focused database tests**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/repository.test.ts src/server/advertising/vk/readService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/advertising/vk/repository.ts src/server/advertising/vk/readService.ts src/server/advertising/vk/repository.test.ts src/server/advertising/vk/readService.test.ts
git commit -m "feat: persist and query VK Ads mirror"
```

### Task 8: Resumable backfill and seven-day daily collector

**Files:**
- Create: `src/server/advertising/vk/dateWindows.ts`
- Create: `src/server/advertising/vk/collector.ts`
- Test: `src/server/advertising/vk/dateWindows.test.ts`
- Test: `src/server/advertising/vk/collector.test.ts`
- Test: `src/server/advertising/vk/collector.integration.test.ts`

**Interfaces:**
- Consumes: `VkAdsProvider`, `PrivateVkCreativeStore`, Task 7 repository, Task 4 sync lease, and injected `{ now(): Date }`.
- Produces `createVkAdsCollector(dependencies)` with `run(mode: "check" | "backfill" | "daily"): Promise<VkAdsSyncReport>`.
- Produces pure `moscowCalendarDate(now)`, `dailyLookbackWindow(now): { dateFrom; dateTo }`, and `splitDateWindows(dateFrom, dateTo, maxDays)` helpers.

- [ ] **Step 1: Write failing pure date-window tests**

Pin exactly seven inclusive dates at Moscow midnight, UTC dates on either side of Moscow midnight, February/month/year rollover, leap day, and clocks carrying non-Moscow offsets. Assert windows are contiguous, non-overlapping, ascending, bounded, and reject invalid/reversed dates.

- [ ] **Step 2: Write failing collector unit tests**

For `check`, assert config/OAuth/account/storage checks occur and no mirror write method is called. For `backfill`, assert all campaign/group/ad pages and statuses are visited, an existing SHA object key is reused before any upload, videos remain metadata-only, earliest campaign date seeds bounded statistics windows, and a completed run is `succeeded`. For `daily`, assert all campaigns are reread, groups/ads use source-update overlap and explicit statuses, and statistics use `dailyLookbackWindow` exactly.

Cover lock contention with zero provider calls; 429/provider/storage/contract failure mapping; `partial` when prior pages committed; `failed` when nothing committed; `release()` in `finally` for every outcome; and a duplicate external ID returned on two different pages failing with `ads_vk_contract_invalid` before double-counting.

- [ ] **Step 3: Write the failing crash/resume integration test**

Against PostgreSQL and fake provider/store, inject a crash immediately after page 2 commits. Verify the run remains resumable at page 3, rerun backfill, and assert every entity/metric natural key occurs once, counters do not double-count committed pages, creative intervals remain coherent, and no already-committed provider page is requested again.

- [ ] **Step 4: Run collector tests and verify RED**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/dateWindows.test.ts src/server/advertising/vk/collector.test.ts src/server/advertising/vk/collector.integration.test.ts`

Expected: FAIL because date helpers and collector are absent.

- [ ] **Step 5: Implement the mode state machine**

Persist a checkpoint only in the same transaction as its page/window. Resume only `backfill`, never reuse a daily/check run, and derive overlap from the latest successfully observed source-update timestamp minus one day. Do not mark missing incremental objects inactive. Track external IDs across pages within each entity phase and fail safely on repetition. After campaign import, derive the backfill start from the earliest valid campaign creation date; if none exists, complete entity import and record `ads_vk_sync_partial` rather than inventing a date. Emit only `redactVkAdsLogRecord` output; never serialize caught exceptions.

- [ ] **Step 6: Run focused collector tests**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/dateWindows.test.ts src/server/advertising/vk/collector.test.ts src/server/advertising/vk/collector.integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/advertising/vk/dateWindows.ts src/server/advertising/vk/collector.ts src/server/advertising/vk/dateWindows.test.ts src/server/advertising/vk/collector.test.ts src/server/advertising/vk/collector.integration.test.ts
git commit -m "feat: collect VK Ads mirror data"
```

### Task 9: Production runtime and fail-closed CLI

**Files:**
- Create: `src/server/advertising/vk/runtime.ts`
- Create: `server/vk-ads-collect.mjs`
- Create: `server/vk-ads-collect.test.js`
- Modify: `src/entry.server.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: all production factories from Tasks 1–8 and `DATABASE_URL`.
- Produces `runVkAdsCollection(mode): Promise<VkAdsSyncReport>`, `checkVkAdsCollectionReady(): Promise<VkAdsSyncReport>`, and `getVkAdsReadService()`.
- Produces CLI parser `parseVkAdsCollectArgs(args): { mode: "check" | "backfill" | "daily" }` and `runVkAdsCollectCommand(args, loadBuild?, logger?): Promise<0 | 1>`.

- [ ] **Step 1: Write failing runtime/CLI tests**

Accept exactly one of `--mode=check`, `--mode=backfill`, or `--mode=daily`; reject missing, duplicate, unknown, positional, and arbitrary-path arguments before loading the production build. Assert success exits 0 only for `succeeded`/ready, while `partial`, `failed`, disabled, locked, config, and terminal OAuth results exit 1 with one safe summary line containing no secret, URL query, or raw error.

Assert disabled runtime returns `ads_vk_disabled` before constructing DB, S3, OAuth, or fetch dependencies. Assert enabled runtime uses production origin and fixed seven-day lookback even if override-like env keys exist.

- [ ] **Step 2: Run CLI tests and verify RED**

Run: `node --test server/vk-ads-collect.test.js`

Expected: FAIL because the CLI/runtime do not exist.

- [ ] **Step 3: Compose the production runtime and entry exports**

Instantiate separate cached read service and per-job collector dependencies. Add `export { runVkAdsCollection, checkVkAdsCollectionReady }` to `src/entry.server.tsx`; do not add VK readiness to web application startup because sync defaults disabled and runs as a separate job.

- [ ] **Step 4: Implement the CLI and package script**

Load `../build/server/index.js` only after argument parsing. Add `"ads:collect": "node server/vk-ads-collect.mjs"`. Catch top-level errors with the fixed message `VK Ads collection failed.` and no interpolation.

- [ ] **Step 5: Run CLI tests, typecheck, and build**

Run: `node --test server/vk-ads-collect.test.js && yarn typecheck && yarn build`

Expected: PASS and the production bundle exports both functions.

- [ ] **Step 6: Commit**

```bash
git add src/server/advertising/vk/runtime.ts server/vk-ads-collect.mjs server/vk-ads-collect.test.js src/entry.server.tsx package.json
git commit -m "feat: add VK Ads collection runtime"
```

### Task 10: Read-only MCP tools including private image content

**Files:**
- Create: `src/server/advertising/vk/mcpService.ts`
- Test: `src/server/advertising/vk/mcpService.test.ts`
- Modify: `src/server/mcp/tools.ts`
- Modify: `src/server/mcp/tools.test.ts`
- Modify: `src/server/mcp/runtime.ts`
- Modify: `src/server/mcp/http.ts`

**Interfaces:**
- Consumes: `createVkAdsReadService` from Task 7.
- Produces a per-token `createMcpVkAdsService(readService)` with seven read methods matching the spec tool names.
- Extends `McpServices` with `vkAds`; no method accepts a sync mode or network dependency.
- Produces an audited image-result path that returns MCP `{ content: [{ type: "image", data: base64, mimeType }], structuredContent: { id, mimeType, byteSize, sha256 } }` without serializing image bytes into audit logs.

- [ ] **Step 1: Write failing MCP scope and DTO tests**

Assert `ads:read` registers exactly the seven additional tools, `ads:write` alone registers none, and combined scopes do not expose sync/control tools. Pin strict bounded inputs, cursor/date validation, redacted outputs, local service-only calls, safe `ads_vk_*` errors, and audit events without payloads.

For `get_vk_creative_image`, assert valid owned image content/mime type, 5 MiB cap before base64 conversion, missing/collision/storage failures as safe errors, and neither object key nor stable URL in structured output. Assert no other VK tool can return a `token`, `secret`, `rawResponse`, targeting list, email, phone, or landing query.

- [ ] **Step 2: Run MCP tests and verify RED**

Run: `yarn tsx --test src/server/advertising/vk/mcpService.test.ts src/server/mcp/tools.test.ts`

Expected: FAIL because the VK MCP service/tools are absent.

- [ ] **Step 3: Implement the MCP adapter and registrations**

Use the existing `ads:read` scope, existing failure mapping, and the same audit envelope. Add a dedicated `runImage` wrapper rather than passing binary data through the JSON `success()` helper. Input schemas must use strict objects, `limit <= 100`, ISO dates, and IDs/cursors bounded as in Task 7.

- [ ] **Step 4: Wire per-token runtime services**

Update `getMcpServices()` and `createMcpRouter()` service construction so both production and injected-test service objects contain `vkAds`. The adapter captures no token ID because all operations are read-only; the MCP audit still records the authenticated principal.

- [ ] **Step 5: Run MCP tests and typecheck**

Run: `yarn tsx --test src/server/advertising/vk/mcpService.test.ts src/server/mcp/tools.test.ts src/server/mcp/http.test.ts && yarn typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/advertising/vk/mcpService.ts src/server/advertising/vk/mcpService.test.ts src/server/mcp/tools.ts src/server/mcp/tools.test.ts src/server/mcp/runtime.ts src/server/mcp/http.ts
git commit -m "feat: expose VK Ads mirror through MCP"
```

### Task 11: Authenticated read-only admin section and image proxy

**Files:**
- Create: `src/routes/admin/ads-vk.server.ts`
- Create: `src/routes/admin/ads-vk.tsx`
- Create: `src/routes/admin/ads-vk-creative.ts`
- Create: `src/routes/admin/ads-vk.test.tsx`
- Modify: `src/routes/admin/ads-layout.tsx`
- Modify: `src/routes.ts`

**Interfaces:**
- Consumes: admin authentication helpers, CSP/cache headers, and Task 7 read service.
- Produces loaders for `/admin/ads/vk/` and `/admin/ads/vk/creative/:id/` only; neither file exports an `action`.
- Page query allows `view=campaigns|groups|ads`, bounded `limit`, opaque `cursor`, parent/status filters, and an optional valid ISO date range for summary metrics.

- [ ] **Step 1: Write failing loader, proxy, and presentation tests**

Assert unauthenticated requests redirect through `requireAdminPage`; unknown/repeated params and invalid cursors/ranges return safe 422; repository/storage failures return safe 503; successful JSON contains no private keys, secrets, queries, contacts, or raw provider data.

Assert the image proxy accepts only a UUID creative-version ID, returns validated stored bytes with exact `Content-Type`, `Content-Length`, `ETag`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and CSP/admin headers; missing is safe 404. It must never redirect to S3 or the original VK URL.

Render the page and assert sync state/counters, coverage, campaigns/groups/ads, daily metrics, creative text/image, and video metadata are readable. Assert the DOM contains no form, mutation method, or labels matching refresh/backfill/start/stop/budget/bid/edit controls.

- [ ] **Step 2: Run admin tests and verify RED**

Run: `yarn tsx --test src/routes/admin/ads-vk.test.tsx src/routes/admin/ads-sections.test.tsx`

Expected: FAIL because the route and navigation item are absent.

- [ ] **Step 3: Implement safe loaders and proxy**

Reuse `sanitizeAdsReadModel` behavior by extracting a shared sanitizer from `ads-read.server.ts` only if necessary; do not broaden existing mutation services. Stream or return the bounded buffer only after authentication and metadata agreement.

- [ ] **Step 4: Implement the read-only page and routes**

Add `["/admin/ads/vk/", "VK кабинет"]` to `ADS_SECTIONS`; register the page inside `ads-layout` and the creative loader route under the authenticated admin layout. Show safe error/empty states and pagination links preserving validated filters.

- [ ] **Step 5: Run admin tests, typecheck, and build**

Run: `yarn tsx --test src/routes/admin/ads-vk.test.tsx src/routes/admin/ads-sections.test.tsx && yarn typecheck && yarn build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin/ads-vk.server.ts src/routes/admin/ads-vk.tsx src/routes/admin/ads-vk-creative.ts src/routes/admin/ads-vk.test.tsx src/routes/admin/ads-layout.tsx src/routes.ts
git commit -m "feat: add read-only VK Ads admin view"
```

### Task 12: Deployment schedule, operator runbook, end-to-end proof, and final verification

**Files:**
- Create: `scripts/run-vk-ads-collect.sh`
- Create: `deploy/systemd/kordevteam-vk-ads-collect.service`
- Create: `deploy/systemd/kordevteam-vk-ads-collect.timer`
- Create: `tests/deploy/vk-ads-sync.test.mjs`
- Create: `src/server/advertising/vk/end-to-end.test.ts`
- Modify: `deploy/docker-compose.team.yml`
- Modify: `docker-compose.yml`
- Modify: `deploy/env/operations.env.example`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: immutable recorded worker image pattern, Task 9 CLI, fake VK server, test PostgreSQL, and fake/in-memory S3 sender.
- Produces Compose profile `vk-ads`, service `vk-ads-job`, host wrapper, hardened oneshot service, daily timer, and operator commands for check/manual backfill/daily/status diagnosis.

- [ ] **Step 1: Write failing deployment tests**

Assert Bash syntax and zero positional arguments for the daily wrapper; recorded immutable worker image use; `docker compose --profile vk-ads run --rm --no-deps vk-ads-job node server/vk-ads-collect.mjs --mode=daily`; no host build; no published port; read-only root filesystem; backend plus egress networks; dropped capabilities; `no-new-privileges`; bounded tmpfs; all required VK env wiring; and no environment origin/lookback override.

Assert the unit has `After/Requires=docker.service`, `Wants/After=network-online.target`, `EnvironmentFile=/etc/kordevteam/operations.env`, `UMask=0077`, `NoNewPrivileges=true`, bounded restart, and the wrapper path. Assert timer `OnCalendar=*-*-* 03:30:00 Europe/Moscow`, `Persistent=true`, and `RandomizedDelaySec=10m`; run `systemd-analyze verify` on Linux.

- [ ] **Step 2: Write the failing full fake-VK E2E test**

From empty migrated PostgreSQL, use fake OAuth/VK HTTP and private store to run `check`, crash/resume `backfill`, a second complete `backfill`, then two `daily` runs with a corrected prior-day metric and one changed creative. Assert normalized row counts, one current creative interval, seven rewritten metric dates, no duplicates, identical history through the local read service, MCP, and admin loader, authorized image bytes, no network call from reads, and absence of fixture secrets/raw bodies across all JSON/read DTOs and database text columns.

Also inspect all fake-server requests and assert the only POST is `/api/v2/oauth2/token.json`; all advertising calls are allowlisted GETs; creative-host requests contain no bearer header.

- [ ] **Step 3: Run deployment and E2E tests and verify RED**

Run: `node --test tests/deploy/vk-ads-sync.test.mjs && TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/end-to-end.test.ts`

Expected: FAIL because deployment/runtime wiring is absent.

- [ ] **Step 4: Implement Compose, wrapper, systemd, and safe env template**

Use the same recorded worker-image helper as SEO jobs. The env example contains placeholders only and explicitly says to rotate the disclosed old secret. Web/admin services receive only S3 read credentials needed for the proxy; the scheduled job receives OAuth/encryption/write-storage credentials. If the current shared credentials cannot be split at the provider, document that limitation and keep application interfaces read-only.

- [ ] **Step 5: Document the operator sequence**

Add exact commands for: deploy the migration with `VK_ADS_SYNC_ENABLED=false`; provision mode-0600 env; issue and install a new secret; `--mode=check`; one manual `--mode=backfill`; verify `/admin/ads/vk/` and MCP; enable/start timer; run manual `--mode=daily`; inspect `systemctl status`, timer schedule, and journal; verify/restore from backup; rotate OAuth/encryption/storage credentials; and disable sync without deleting history. State that backfill is never scheduled, partial exits nonzero, lock contention performs no network call, the disclosed old secret must never be reused, and MCP/admin cannot trigger sync. Document monitoring of the first three daily runs and alerting only for partial/failed status, stale synchronization, or required operator action.

- [ ] **Step 6: Run the E2E and deployment tests after the wiring changes**

Run: `node --test tests/deploy/vk-ads-sync.test.mjs && TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test --test-concurrency=1 src/server/advertising/vk/end-to-end.test.ts`

Expected: PASS.

- [ ] **Step 7: Run credential and mutation-surface audits**

Run repository searches for the exact environment variable names only, plus structural checks:

```bash
rg -n "VK_ADS_(CLIENT_SECRET|TOKEN_ENCRYPTION_KEY_B64|S3_SECRET_ACCESS_KEY)" --glob '!docs/superpowers/**'
rg -n "POST|PATCH|PUT|DELETE" src/server/advertising/vk server/vk-ads-collect.mjs
rg -n "sync|backfill|daily|refresh" src/server/advertising/vk/mcpService.ts src/routes/admin/ads-vk* src/server/mcp/tools.ts
```

Expected: secret names appear only in config/env plumbing and tests with synthetic values; the only provider POST is the fixed OAuth token request; no ad mutation method or UI/MCP sync trigger exists. Do not search for, paste, or echo the old secret value.

- [ ] **Step 8: Run the complete project verification**

Run:

```bash
yarn db:check
yarn typecheck
yarn build
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn test
```

Expected: all commands exit 0; the full test count is at least the current 899 baseline plus the new VK Ads tests.

- [ ] **Step 9: Review the diff and commit**

Run: `git diff --check && git status --short && git diff --stat main...HEAD`

Expected: only the planned VK Ads, deployment, docs, migration, MCP, admin, schema, and backup files changed; no secret, generated build output, `output/`, or `tmp/` is staged.

```bash
git add scripts/run-vk-ads-collect.sh deploy/systemd/kordevteam-vk-ads-collect.service deploy/systemd/kordevteam-vk-ads-collect.timer tests/deploy/vk-ads-sync.test.mjs src/server/advertising/vk/end-to-end.test.ts deploy/docker-compose.team.yml docker-compose.yml deploy/env/operations.env.example deploy/README.md
git commit -m "feat: schedule secure VK Ads synchronization"
```
