# Content View Counters and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать реальные просмотры кейсов и статей у глазика, считать материал один раз за браузерный сеанс и обязательно подключить события к действующей аналитике.

**Architecture:** PostgreSQL хранит агрегаты отдельно от CMS, активные сессии и уникальные квитанции просмотра. Отдельный same-origin API принимает запись только от браузерного контроллера после согласия; SSR читает числа пакетно и ничего не записывает. IndexedDB синхронизирует сеанс между вкладками; единый адаптер отправляет page views и уникальные открытия в существующие Яндекс.Метрику и Top.Mail.Ru.

**Tech Stack:** Existing TypeScript/React 18/React Router 7, Express, PostgreSQL 16, Drizzle, IndexedDB, lucide-react; node:test/tsx/JSDOM and existing Puppeteer test runtime. Новые production-зависимости не нужны.

**Spec:** `docs/superpowers/specs/2026-10-21-content-view-counters-design.md` — утверждена владельцем в чате 21 октября 2026.

**Implementation checkpoint (21 October):** Tasks 1–5 implemented in this isolated branch. Task 6 local acceptance: Node 22 full suite 1550 pass, 0 fail, 2 environment skips (Linux systemd and optional actual content-release image); typecheck/db:check/build and local crawl (94 sitemap + 15 internal URLs, zero view receipts) passed. Independent final review is next. Provider-side receipt, owner approval of final privacy text/digest, integration choice and any production release remain pending; nothing deployed.

## Global Constraints

- Один материал — один просмотр за браузерный сеанс; новый сеанс после **30 минут бездействия**. Обновление и соседние вкладки не увеличивают число.
- Учёт только после восстановления и принятия актуального согласия; отказ/отзыв, в том числе в другой вкладке, прекращает учёт. Пропущенную историю не восстанавливать.
- Глазик на карточках и внутри `article`/`case`; опубликованные неиндексируемые материалы не исключать только из-за `indexable=false`. Черновики, preview, админка и ошибки не учитываются.
- GET/HEAD, SSR, loaders, prefetch и prerender не записывают просмотры. Запись требует видимой активированной страницы после завершённой навигации.
- Хранение связано с `contentEntryId`. Не менять тексты, версии, даты, связи, media, canonical, sitemap, indexability, ядро и SEO-журнал.
- Сеанс общий для вкладок одного origin, не уникальный человек. При недоступности хранилища запись пропускается, а публичное число остаётся доступно.
- Активность передаётся не чаще **одного раза в минуту** и только после новых действий/навигации, не от самого таймера. Истёкшая сессия не воскрешается.
- Истёкшие сессии/квитанции удаляются после **48-часового защитного периода**, агрегаты сохраняются; без нового самостоятельного монитора.
- Яндекс.Метрика **105288175**, Top.Mail.Ru **3793508**. Новые цели **`article_open_unique`**, **`case_open_unique`**. Прежний `project_open` остаётся событием клика.
- Провайдеру не передавать собственный session token, контакты, query string или fragment. Успех клиентской очереди не равен получению события провайдером.
- Только отдельная тестовая PostgreSQL `kordev_test`, никогда production. Не печатать env/секреты. Операции production и кабинетами не выполнять в ходе кодирования.
- Перед релизом отдельно утверждаются новый текст политики/digest и новая помеченная CRM-заявка, если её требует gate: прежнее разовое разрешение уже использовано.

## Review Focus

1. Две вкладки одновременно создают или меняют сеанс: один общий token, не двойное увеличение. Реальные IndexedDB-тесты — Task 3; конкурентный PostgreSQL — Task 1.
2. Поздний ответ после отзыва согласия/ухода со страницы: не восстанавливает session/UI и не отправляет цель от старого поколения. Task 3 и Task 5.
3. Предзагрузка и прямой вход дают разные жизненные циклы: первый ничего не пишет, второй учитывается даже без клика по карточке. Task 2 и Task 5.
4. Ошибка чтения/очень большое число: «—» не превращается в 0, счёт выше `Number.MAX_SAFE_INTEGER` не округляется, текст остаётся доступен. Task 1 и Task 5.
5. Провайдер заблокирован, согласие принято поздно или отозвано между переходами: сайт и серверный агрегат работают, нет двойного первого hit/ретроспективной отправки. Task 4 и Task 6.

---

## File map and shared decisions

- New server unit: `src/server/content-views/{contracts,config,security,repository,http,read}.ts`, corresponding `.test.ts` files. `repository.ts` owns transactions/session lifetime/cleanup; `http.ts` owns bounded request handling; `read.ts` owns fail-soft batched SSR reads.
- Schema: append exports in `src/server/db/schema.ts`; generate additive `drizzle/0025_content_views.sql` and `drizzle/meta/` using the current generator. Recheck migration head before generation; never overwrite another migration.
- New browser unit: `src/lib/contentViews/{contracts,sessionStore,controller}.ts` and tests, plus `src/contexts/ContentViewsContext.tsx`. No whole-app rewrite.
- Reuse `src/lib/analytics.ts` and `src/components/AnalyticsScripts.tsx`; new `src/components/public/ViewCount.tsx` and `src/components/ContentViewTracker.tsx`.
- SSR integration: `src/routes/{home,catalog,content-page,blog-index,blog-category,blog-post,case}.tsx`; presentation types/functions and public cards/detail pages listed in Task 5.
- Runtime: export router from `src/entry.server.tsx`, mount it in `server/api-app.js` through `server/runtime.mjs` **before generic CORS, 25 MiB parsers and request/error logging**, following the lead-router boundary pattern.
- Configuration: `CONTENT_VIEWS_ENABLED` defaults false; `CONTENT_VIEWS_TRUSTED_ORIGIN` is an exact HTTPS origin in production; `CONTENT_VIEWS_HASH_KEY` is a dedicated canonical base64 key of at least 32 random bytes when enabled. Wire only web services, not lead-worker/SEO jobs. Missing enabled config fails readiness, not liveness. Disabled feature performs no writes and does not break old callers.
- Requests contain only random tokens, accepted consent version and an entry UUID. Client token is 32 cryptographically random bytes in base64url. Server stores HMAC-SHA256 with separate `session:`/`rate-ip:` domains, never the raw token/IP. Trusted IP comes from Express proxy configuration, not a client-supplied header.
- Limits, shared in PostgreSQL across blue/green: 60 session registrations / 10 minutes per IP key; 600 API writes / minute per IP key; 120 writes / minute per session. IP keys expire after their rate window; cleanup is bounded. Return 429/Retry-After, no retry loop. These are base abuse limits, not proof of a human.
- Cleanup: at most 200 sessions whose `expiresAt < now-48h` plus at most 500 expired rate buckets per eligible POST; database advisory try-lock and at most one sweep per minute. Cascading session receipt removal never decreases totals. No timer/service/scheduler creation.
- Counts cross server/browser boundaries as nonnegative decimal **strings**, not floating-point numbers; `null` means unavailable. Missing total for an existing published material is `"0"`.
- Feature-disabled UI hides the new element; enabled+unavailable UI shows «—». Readiness verifies the enabled schema/config before enabling the feature. Initial rollout has no seeded historical totals.

## Task 1: Atomic totals, session lifetime and bounded retention

**Files:** Create `src/server/content-views/contracts.ts`, `repository.ts`, `repository.test.ts`; modify `src/server/db/schema.ts`, generated migration/meta; extend `src/server/db/schema.test.ts` if needed.

**Interfaces:**
- `ViewTarget = { entryId:string; kind:"article"|"case"; slug:string; path:string }`.
- `ViewReceipt = { counted:boolean; views:string; target:ViewTarget }`.
- `createContentViewsRepository(db, {now:()=>Date})` returns `registerSession(sessionHash:string):Promise<{expiresAt:string}>`, `touchSession(sessionHash:string):Promise<{expiresAt:string}>`, `recordView(sessionHash:string,entryId:string):Promise<ViewReceipt>`, `readCounts(entryIds:readonly string[]):Promise<Record<string,string>>`, `consumeRateLimit(input:{key:string;bucketStart:Date;windowSeconds:number;limit:number}):Promise<boolean>`, `cleanup():Promise<{sessions:number;rateBuckets:number}>`.
- `registerSession` may insert an unseen hash, but rejects an existing expired hash with `session_expired`; `touchSession` never inserts. Both use server time; exactly `now >= expiresAt` is expired. Record requires an existing unexpired session and rechecks publication/kind inside the transaction.

- [ ] **1. Write failing repository/schema tests** using injected time and dedicated PostgreSQL. Core assertions:

```ts
assert.equal((await repo.recordView(sessionHash, articleId)).counted, true);
assert.equal((await repo.recordView(sessionHash, articleId)).counted, false);
assert.equal((await repo.readCounts([articleId]))[articleId], "1");
assert.equal((await repo.recordView(sessionHash, caseId)).views, "1");
```

Add named cases: `20 concurrent same-session writes increase once`; `different sessions increase independently`; `30 minutes expires and touch cannot revive`; `draft/unpublished/wrong-kind cannot count`; `slug/version changes keep totals`; `48h cleanup keeps aggregates`; `large bigint round-trips exactly`; `all content/revision/relation/core rows remain unchanged`; `concurrent rate buckets enforce limits`. Snapshot absence of unrelated mutations, not just row counts.
- [ ] **2. Run red:** `npx tsx --test --test-concurrency=1 src/server/content-views/repository.test.ts` with `TEST_DATABASE_URL` for disposable `kordev_test`. Expect missing module/schema failures, not misconfigured DB failures.
- [ ] **3. Implement minimal schema/repository.** Tables `content_view_totals` (entry FK, nonnegative bigint), `content_view_sessions` (hash PK, created/lastActivity/expires), `content_view_receipts` (session FK + entry FK composite PK), `content_view_rate_limits` (key + bucket PK, count, expiry). Lock session then entry in consistent order; receipt insert `ON CONFLICT DO NOTHING` is the sole increment condition; total uses atomic SQL increment and RETURNING. Rate/cleanup state is operational, not CMS state. No prefill of totals or content writes.
- [ ] **4. Run green:** `npx tsx --test --test-concurrency=1 src/server/content-views/repository.test.ts`, `npx tsx --test src/server/db/schema.test.ts` and `npm run db:check`. Expect all required PostgreSQL cases actually executed. Verify empty DB migrations and repeat migrations using existing production migration test helpers against the disposable DB only.
- [ ] **5. Commit:** `feat(views): add atomic session-based view repository` — include only this task's module, schema, migration/meta and tests.

## Task 2: Safe same-origin API, runtime wiring and configuration

**Files:** Create `src/server/content-views/{config,security,http}.ts` and tests; modify `src/entry.server.tsx`, `server/{api-app.js,runtime.mjs}`, `deploy/docker-compose.team.yml`, `deploy/env/operations.env.example`, `docker-compose.yml`, `.github/workflows/docker-build.yml`, `tests/ssr/support/runtime.ts`; create `tests/ssr/contentViews.test.ts`.

**Interfaces:** Consumes Task 1 repository. `readContentViewsConfig(env):{enabled:boolean;trustedOrigin:URL;hashKey:Buffer|null}`; `createContentViewsRouter(overrides?:{repository;config;clock;log}):Router`; export through built `entry.module.createContentViewsRouter()`. Logs only request ID, safe error code/status/duration, never token, body, URL query or IP.

- `POST /api/content-views/session` JSON `{operation:"register"|"touch",sessionToken:string,consentVersion:string}` → `{expiresAt:string}`.
- `POST /api/content-views/record` JSON `{sessionToken:string,entryId:string,consentVersion:string}` → Task 1 `ViewReceipt`. Target kind/slug/path are resolved by server, not accepted from caller.
- Errors `{error:{code}}`: 400 malformed, 403 origin/consent/bot/prefetch, 404 unavailable target, 405 method, 409 `session_expired`, 413 size, 415 media type, 426 insecure production, 429 rate limited, 503 disabled/config/database unavailable. All responses no-store/nosniff; GET/HEAD/unknown paths cannot fall through into another handler.

- [ ] **1. Write failing config/security/HTTP tests.** Pin 4 KiB JSON limit, strict unknown-field rejection, token format, actual consent version, enabled/disabled behavior, same-origin Origin+`Sec-Fetch-Site`, production HTTPS and spoofed proxy header rejection. Test GET/HEAD/prefetch/prerender and common search/social bot UAs produce zero writes; stream a >4 KiB chunked body; errors/logs must not contain sent token/IP/password sentinel. Test trusted test-loopback origin only under NODE_ENV=test; production accepts HTTPS only.
- [ ] **2. Run red:** `npx tsx --test --test-concurrency=1 src/server/content-views/config.test.ts src/server/content-views/security.test.ts src/server/content-views/http.test.ts tests/ssr/contentViews.test.ts`.
- [ ] **3. Implement router/config and mount before generic parsers/loggers.** Own `express.json({limit:4096})` and safe terminal error handling. Apply IP/session limits before recording and registration limit only to registrations; hash inputs with dedicated domains. Reuse trusted Express IP/proxy behavior, not admin session privileges. Feature config remains lazy when disabled. Add valid **fixture-only** values in CI/rehearsal/test runtime, and enabled config/schema readiness checks; do not edit protected production env while coding.
- [ ] **4. Build runtime and run green:** `npm run build` then the red command and `node --test tests/deploy/migrations.test.mjs`. Use `startTestRuntime()` with dedicated PostgreSQL; assert an actual HTTP GET/HEAD/prefetch produces no receipt, while an eligible POST increases once. Exercise real runtime wiring, not just router injection. Check existing lead/VK routes and liveness still work.
- [ ] **5. Commit:** `feat(views): add consent-aware protected view API` with this task's paths only.

## Task 3: Shared browser session, activity and consent revocation

**Files:** Create `src/lib/contentViews/{contracts,sessionStore,controller}.ts`, corresponding unit tests, `src/contexts/ContentViewsContext.tsx`, `tests/visual/contentViewSessions.test.ts`; modify `src/contexts/ConsentContext.tsx`, `src/lib/consent.ts`, `src/components/public/ConsentBanner.tsx`, `src/routes/legal.tsx`, `src/root.tsx` and existing consent tests.

**Interfaces:**
- Browser `contracts.ts` uses type-only imports for Task 1 result/target types; it must not bundle database/config or other server runtime modules.
- `LocalViewSession = {token:string;generation:number;lastActivityAt:number;lastSentAt:number}` stored as one IndexedDB record in database `kordev-content-views`, version 1, store `session`, key `current`.
- `createViewSessionStore()` returns `getOrCreate(nowMs:number):Promise<LocalViewSession|null>`, `rotate(expectedToken:string,nowMs:number):Promise<LocalViewSession|null>`, `noteActivity(nowMs:number):Promise<LocalViewSession|null>`, `claimActivitySend(expectedToken:string,nowMs:number):Promise<boolean>`, `clear():Promise<void>`. All read/modify/write decisions use single read-write transactions; no network await inside a transaction. Rotation compares token and reuses a generation already created by another tab.
- `createContentViewsController({store,transport,clock,isConsentCurrent})` returns `activate():Promise<void>`, `activity():void`, `record(entryId:string):Promise<ViewReceipt|null>`, `dispose():void`. Transport uses Task 2, same-origin/no-store, AbortController and 5-second timeout. One normal attempt; only `session_expired` permits one CAS-rotation/register/retry. No network/429/503 loops. Late generation/consent responses are ignored.
- `ContentViewsProvider` exposes `{enabled:boolean;record(entryId:string):Promise<ViewReceipt|null>}` through `useContentViews()`. Mounted only inside public ConsentProvider. Session token is never exposed through loader JSON or provider analytics payload.

- [ ] **1. Write failing state/controller/consent tests.** Assert no storage/network before consent restoration or after reject; blocked IDB returns null without throwing; refreshing preserves token; `rotate(old)` from two callers yields one new token; expiry at 1,800,000 ms; pending send/reply cannot restore cleared state. Consent storage events from another tab must update local decision, including removal/version mismatch → unknown. Test trusted pointer/key activity while visible and committed public navigation; synthetic/untrusted events, hidden tab and timer alone do not keep alive.
- [ ] **2. Run red:** `npx tsx --test --test-concurrency=1 src/lib/contentViews/sessionStore.test.ts src/lib/contentViews/controller.test.ts src/contexts/ConsentContext.test.tsx`. Create the named consent test file if absent, reusing existing JSDOM setup. Tests may inject store/clock/network, but cross-tab guarantees require the real browser step below.
- [ ] **3. Implement IndexedDB adapter, controller and provider.** On accepted consent register/touch current generation; activity marks lastActivity and one shared `claimActivitySend` permits at most one request per minute across tabs. Coalesce the last unsent genuine activity, but scheduled work without new activity never renews. At server expiry rotate once; refusal/retirement never reopens old token. Add one global visible-activity listener group and cleanup. Reset stores/in-flight work on consent generation change/unmount; no raw input values collected.
- [ ] **4. Update consent version to `2026-10-21-content-views-v1`.** Import the same constant into policy instead of maintaining a second independent literal. Banner explains first-party view counting plus Яндекс.Метрика/Top.Mail.Ru; policy explains random session, 30-minute inactivity, 48-hour expiry retention, permanent anonymous aggregates and refusal. Keep accept/reject equally available. Do not change article/case content sources.
- [ ] **5. Run green, including real cross-tab IndexedDB:** build runtime, run unit command, existing `AnalyticsScripts`/`ConsentBanner` tests, and `npx tsx --test --test-concurrency=1 tests/visual/contentViewSessions.test.ts`. Use two pages of the **same browser context/origin** and a second isolated context for a different session. Assert simultaneous first initialization and concurrent server-expiry rotations produce one active token and one receipt per material; local clock tests cannot replace the server clock assertion. Verify decline in tab B aborts tab A's delayed request/goal and no identifier reappears.
- [ ] **6. Commit:** `feat(views): coordinate consent-gated sessions across tabs`.

## Task 4: Required analytics on page transitions and unique opens

**Files:** Modify `src/lib/analytics.ts`, `src/lib/analytics.test.ts`, `src/components/AnalyticsScripts.tsx`, `src/components/AnalyticsScripts.test.tsx`; create `src/lib/contentViews/analytics.ts`, `analytics.test.ts`.

**Interfaces:** `trackPublicPageView(input:{path:string;referrerPath?:string}):void` dispatches to initialized consented vendor queues. `trackUniqueContentOpen(receipt:ViewReceipt):void` uses server `target` and only `counted:true`; it dispatches `article_open_unique`/`case_open_unique` to **both** providers. New goal params exactly `{contentType:"article"|"case",slug:string,path:string}`. Existing `track()` event behavior remains compatible; do not silently make all old Yandex events new Mail goals.

- [ ] **1. Write failing adapter/component tests.** Assert consented Yandex `hit` and Mail `pageView` for one committed SPA navigation; no second initial hit after vendor init/hydration/StrictMode; late consent sends current page only; back/forward records page hits; query/hash changes on the same canonical material do not fabricate another material opening. New goals dispatched once for counted receipt, none for false/null and no token/query/contacts. Test missing/throwing vendor and consent revoked before callback; existing `project_open` remains a click event.
- [ ] **2. Run red:** `npx tsx --test --test-concurrency=1 src/lib/analytics.test.ts src/lib/contentViews/analytics.test.ts src/components/AnalyticsScripts.test.tsx`.
- [ ] **3. Implement route-aware adapter.** Existing vendor initialization owns first hit; router bridge owns subsequent committed public-path hits after restored acceptance. Track last acknowledged initial path/consent generation explicitly, not a component mount boolean. Normalize to canonical pathname; exclude admin/preview/errors. Use official `ym(id,"hit",path)` / `_tmr.push({id,type:"pageView",url:path})` and `reachGoal` contracts from spec references. Preserve provider teardown. Never roll back server count or require vendor success to show content.
- [ ] **4. Run green** with the red command plus all current analytics/consent tests. Assert public APIs do not regress existing form/CTA analytics. Receiving a queued call is a unit assertion only, not a claim that a production goal arrived.
- [ ] **5. Commit:** `feat(analytics): track public navigation and unique material opens`.

## Task 5: Batched SSR counts, shared eye component and real-open tracking

**Files:** Create `src/server/content-views/read.ts`, `read.test.ts`, `src/components/public/ViewCount.tsx`, `ViewCount.test.tsx`, `src/components/ContentViewTracker.tsx`, `ContentViewTracker.test.tsx`; modify `src/server/content/{types,presentation,commercialPresentation}.ts`, `src/components/{BlogCard.tsx,public/CaseCard.tsx,public/ContentCard.tsx,home/HomeCaseMosaic.tsx}`, `src/pages/{BlogPostPage,CommercialCasePage}.tsx`, and all seven routes from File map; update relevant existing presentation/page tests.

**Interfaces:**
- `readPublishedViewCounts(entryIds:readonly string[]):Promise<Record<string,string|null>>` performs one published article/case aggregate query; on read failure returns null per requested published ID and logs only a safe code. No write/cleanup/session work on reads.
- Presentation types gain optional `viewCount?:string|null`. Unprovided hides the feature for fixtures/disabled mode; explicit `"0"` shows zero, explicit null shows dash. Existing pure presentation functions accept optional count arguments, never import DB. IDs are used in loaders, not stored in CMS payload.
- `ViewCount({value:string|null,className?:string})` uses `Eye aria-hidden`, `<span aria-label="…">` and `Intl.NumberFormat("ru-RU")` with `BigInt`; no `aria-live` announcements on every unrelated render.
- `ContentViewTracker({entryId:string;onCount:(views:string)=>void})` uses Task 3 `record` and Task 4 `trackUniqueContentOpen`. It tracks only mounted eligible route content after visibility/activation; ignores stale results and aborts through controller disposal. No network write inside card or loader.

- [ ] **1. Write failing tests** for 0/1/2/5/11/21 Russian labels, unavailable dash and `"9007199254740993"` exact digits; SSR markup; all cards/details including home and related content; read failure does not turn article into 500. Spy on DB calls for one batch per loader, including related materials. GET/HEAD/prefetch must keep repository state unchanged. Add `ContentViewTracker` tests for direct link, StrictMode, delayed visibility, late response after a different route, and consent revocation.
- [ ] **2. Run red:** `npx tsx --test --test-concurrency=1 src/server/content-views/read.test.ts src/components/public/ViewCount.test.tsx src/components/ContentViewTracker.test.tsx` plus existing Blog/Page/presentation tests touched by the change.
- [ ] **3. Implement batched loader enrichment and eye UI.** Each loader collects relevant published IDs before one read, then passes counts into pure presentation functions; cover homepage mosaic/blog cards, catalog cases, blog categories, article related cards, case related cards and service related cases/articles. Keep dynamic counts outside all CMS/publish/release checksums. Root loader exposes enabled boolean only, no config secret. Details receive entry identity from loader and keep local displayed value in sync with successful current-page receipts. Preserve existing placeholder `object-contain p-6` and real-cover `object-cover` classes.
- [ ] **4. Run green** with red command and `npx tsx --test --test-concurrency=1 src/components/Blog.test.tsx src/pages/BlogPostPage.test.tsx src/pages/CommercialCasePage.test.tsx src/server/content/presentation.test.ts src/server/content/commercialPresentation.test.ts`. Assert published identity/version/canonical/body remain exactly as fixtures supplied; do not relax unrelated assertions to make new UI pass.
- [ ] **5. Commit:** `feat(ui): show recorded views on case and article cards and pages`.

## Task 6: End-to-end acceptance, provider setup and release evidence

**Files:** Create `tests/visual/contentViews.test.ts`, `docs/runbooks/content-view-counters.md`; modify only test fixtures/CI environment needed to exercise the feature. Keep all implementation paths from Tasks 1–5 under review; no production mutation in this task's automated tests.

- [ ] **1. Add failing E2E acceptance cases** using existing `startTestRuntime`, `resetTestDatabase`, published article/case fixtures and a browser context with network interception for vendor scripts. Intercepted vendor payloads test adapters, not receipt by real providers. Cases: direct article→reload→second same-context tab stays1; different material counts1; different context counts2; hidden tab waits; catalog hover prefetch adds0; back/forward adds0 within same session; declined and old-version consent adds0. Race first generation and server expiry; blocked IndexedDB; denied third-party script; stale HTTP reply after decline; 429 and 503 stay bounded and readable.
- [ ] **2. Run red then implement only missing integration glue**, not new product scope. Add 390×844 and 1440×1100 screenshots, no horizontal overflow, accessible eye labels and unchanged cover modes. Compare whole content/revisions/relations/core fixtures before/after counting. Repeated migration is safe; empty database does not invent historical views.
- [ ] **3. Run acceptance green:** `npm run typecheck`, `npm run db:check`, `npm run build`, targeted new tests, then **full `npm test`** with dedicated DB and the repo's fixture-only runtime environment. No production URLs/credentials in test env. Verify required browser/DB tests actually ran; record pass/fail/skip and fix failures before review. Run existing built-runtime SEO crawl through the CI fixture database as part of normal CI, not SEO-provider collection.
- [ ] **4. Write runbook** with schema/config names, one-origin session semantics, consent version, failure/retention limits, goal names/IDs, regular page views vs session counts, provider receipt evidence, rollout/disable and safe rollback behavior. Old image rollback does not drop new tables or restore the shared DB. New key goes into protected mode-0600 env only when preparing approved rollout; no key value in docs/logs.
- [ ] **5. Independently review the whole branch** after green tests, addressing Critical/Important findings. Review five focus cases, exact policy text, no body/source/core changes, bounded reads/writes, retention and counter semantics. Commit `test(views): verify view counters and analytics lifecycle` with test/runbook adjustments.
- [ ] **6. Separate pre-release acceptance:** inspect existing Yandex/Mail goals and configure the two JavaScript goals only with existing authorized access. If account access/scopes are missing, report safe blocker and ask owner action; do not create new accounts or permissions. Require proof that an approved real/test action reaches each vendor before calling that integration verified; distinguish debug/queued/requested from received. No fake provider observations, bulk production views or historical prefill.
- [ ] **7. Production handoff, only after owner decisions:** owner reviews final policy text/digest and authorizes one new marked CRM lead if gate requires it. Use successful main CI's exact immutable web/content artifacts, encrypted backup, fresh zero-content-change plan and inactive-slot gate/switch. Record old/new slots, image IDs/OCI revision/health, content/core hashes, view migration, visual desktop/mobile result and one lead delivery receipt. If no fresh gate authorization or provider access, leave production untouched and report that boundary. No release workaround, content overwrite, new SEO/GEO collection or separate monitor.

## Self-review / handoff gate

- [x] Match each spec section to Tasks 1–6; confirm all Interfaces names and error/result shapes are consistent. Data/retention → 1–2; sessions/consent → 3; providers → 4; UI/SSR → 5; receipt evidence/release → 6.
- [x] Check five Review Focus tests are specified in the owning task and include real browser/DB races, not just in-memory mocks. They are planned tests, not claimed executed tests.
- [x] Check plan does not add a second analytics account, change content, reuse admin/lead secrets or expand scopes.
- [x] Confirm user has reviewed this plan and selected execution method before invoking implementation skills. Owner selected 1 (inline).

Recommended execution: **Native in the current isolated session**, sequential tasks with test/commit checkpoints, then one independent whole-branch review. The tasks share session/consent/API contracts closely, so keeping one implementation context avoids repeated handoffs; independent review remains required before merge.
