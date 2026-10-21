# Article and case view counters

## Semantics and configuration

`CONTENT_VIEWS_ENABLED` defaults to false (hidden UI, no writes). Before enabling, apply additive migration `0025_content_views.sql`, set the exact HTTPS `CONTENT_VIEWS_TRUSTED_ORIGIN`, and a dedicated canonical-base64 `CONTENT_VIEWS_HASH_KEY` of at least 32 random bytes in the protected mode-0600 environment. Never reuse lead/admin keys; never put a real key into Git, logs or chat. Readiness probes the enabled schema/config; liveness remains independent. Pass these settings only to web containers.

One published article/case is counted once per browser session, shared by same-origin tabs in IndexedDB. Thirty minutes without genuine activity starts a new session; another browser/device can count again. This is not a unique-person measurement. Indexable=false published materials remain eligible. Cards, SSR, GET/HEAD, prefetch and previews never write. No historical prefill.

Consent version: `2026-10-21-content-views-v1`. The banner and `/privacy/` disclose first-party counts, random session ID, 30-minute inactivity, 48-hour protective retention after expiry, persistent anonymous totals, short-lived hashed-IP rate limits, and withdrawal. Legacy acceptance requires a new choice. Rejection across tabs stops recording and clears the local session. SSR numbers remain public. Owner review of the exact final privacy text and SHA-256 is a release gate.

## Storage, limits and failure behavior

Separate tables: `content_view_totals`, `content_view_sessions`, `content_view_receipts`, `content_view_rate_limits`. Identity is contentEntryId, not slug/version. Receipt uniqueness and an atomic transaction control increments. Raw tokens and IPs are not stored; HMAC domains differ. Counts serialize as decimal strings, including beyond JS safe integers. No content, revision, relation, SEO-core or publication-event writes.

Same-origin POST `/api/content-views/session` registers/touches; `/record` returns `{counted,views,target}`. Strict JSON limit 4KiB; current consent version, HTTPS, Fetch Metadata, bot/prefetch filters. Shared PostgreSQL limits: 60 registrations/10 minutes/IP, 600 writes/minute/IP and 120/minute/session. These reduce abuse, not proof of humanity. Client attempts have a five-second abort deadline and no network/rate retry loop. Only session_expired allows one atomic rotation/retry.

Enabled read failure shows “—”, never a fabricated zero; known SSR values remain readable after a failed write. Blocked IndexedDB skips writing rather than counting every reload. Opportunistic cleanup uses an advisory lock, at most once/minute: up to 200 sessions older than expiry+48h and 500 expired rate buckets. Receipts cascade; totals remain. No new timer/monitor.

## External analytics

Existing counters only: Yandex Metrica `105288175`, Top.Mail.Ru `3793508`. Both receive pathname-only page views and `article_open_unique` / `case_open_unique` on a new server receipt. Parameters exactly `{contentType,slug,path}`; no own token, entry UUID, contacts, query or fragment. Historic `project_open` remains a Yandex click goal, not a case view. Yandex defer:true plus one explicit initial hit prevents automatic query-bearing/duplicate initial views; subsequent SPA paths use hit. Mail uses pageView/reachGoal queues. Consent withdrawal removes vendors; blocked vendors never roll back a server count.

Official contracts: [Yandex SPA](https://yandex.ru/support/metrica/ru/code/counter-spa-setup), [Yandex goals](https://yandex.ru/support/metrica/ru/objects/reachgoal.html), [Mail JS API](https://top.mail.ru/help/ru/api/jsapi), [Mail SPA](https://top.mail.ru/help/ru/code/ajax).

Before calling the integration verified, inspect/configure both named JavaScript goals using existing authorized access and preserve an actual provider-side receipt for one owner-approved action. Unit queues and intercepted browser requests are NOT receipt evidence. Missing login/scope requires the owner, never a new account/permission bypass. First-party session counts and vendor page views are different metrics; blockers, dropped replies and provider delays can diverge. No promise of equal numbers.

## Rollout and rollback gates

Run typecheck, db:check, build, all tests with isolated kordev_test, real multi-tab/expiry tests, desktop1440×1100 and mobile390×844 visual checks. Compare full CMS/core hashes before/after, inspect zero-content-change release plan and use exact CI immutable artifacts, encrypted backup and inactive-slot health/gate/switch. Never restore old source text over current CMS content. Do not reuse the placeholder release's consumed one-lead authorization: obtain a fresh marked CRM-test-lead approval if the release gate requires one.

Until owner privacy approval, provider receipt evidence and required release permissions are available, leave production untouched. Disabling the flag stops new recording and hides the eye; it does not erase totals. Rolling back the image does not drop new tables, decrement counts or restore the shared database. Rotate a compromised key deliberately: it retires existing server hashes and can start new sessions, so document this discontinuity. No changes to budgets, core, indexability or indexing submissions.
