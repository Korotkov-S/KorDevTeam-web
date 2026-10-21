# Content view counters — final review record

Branch: `codex/content-view-counters`, base `1def1fb824cab4e929d582fdfc77b39855bde673`.
Independent whole-branch review covered `1def1fb..2321c09`; verdict: with fixes, six Important, no Critical or Minor. One implementation fix pass follows, without a second review. Production, external provider configuration and delivery were not changed.

## Findings and verification

1. Retired async activation cleared a replacement's shared session. Removed disposal-owned clearing; actual consent withdrawal remains provider-owned. Delayed-old/current-owner regression failed before the fix and passed afterwards.
2. Backwards/queued timestamps rotated sessions. Negative deltas no longer imply expiry; activity timestamps are monotonic inside IndexedDB transactions. Real two-tab IndexedDB regression failed before the fix and passed, including the exact 30-minute boundary and server expiry.
3. BFCache restoration missed real openings and page hits. Persisted restoration now rereads consent, replaces the controller, invalidates stale receipts, checks the shared session and emits one page hit. Ordinary pageshow/visibility do not imitate navigation. Synthetic lifecycle/withdrawal tests failed before the fix; native Chromium BFCache confirms same-session deduplication, expired-session increment and withdrawn-consent suppression.
4. Explicit initial hits discarded referral attribution. Both providers now retain a safe external HTTP(S) origin, or a same-origin public pathname; credentials, private external paths, query and fragment are discarded. Source/referrer tests failed before the fix and passed. Queue assertions are not external provider delivery evidence.
5. A retired AnalyticsScripts instance tore down a new instance. Deferred teardown now checks a Document-wide owner. Keyed replacement regression failed before the fix and passed; existing StrictMode/withdrawal/late-script tests remain green.
6. Wheel/trackpad reading did not count as activity. Visible trusted wheel input now uses the existing shared throttle. Real browser trusted-wheel test failed before the fix and passed; synthetic wheel and programmatic scrolling do not renew activity.

Targeted final regression suite: **42 passed, 0 failed, 0 skipped**. The existing SPA navigation test now waits for the destination pathname before testing its counter; an equal count on the previous page cannot satisfy the assertion prematurely. Final Node22 whole suite exited 0: JavaScript **224 pass/0 fail/2 environment skips**; TypeScript **1335 pass/0 fail/0 skips** — combined **1559 passed, 0 failed, 2 skipped**. Typecheck, db:check and build passed. Local fixture crawl: 94 sitemap URLs, 15 internal URLs, no violations, zero receipts; 145 content-release entries unchanged.

Final privacy review text SHA-256: `0dbe1ac2c5f1a356fe65059fbb766b4dd064ad6804b62744419768bedd42a111` (owner approval pending). Local secret-free logs, policy text and desktop/mobile screenshots are retained at `/Users/alex/.codex/artifacts/content-view-counters-20261021-PFVBaY/`. This is local acceptance evidence, not a claim that GitHub CI, external providers or production rollout passed.

## Rulings I made

These are explicit implementation/boundary decisions, not claims that unperformed checks passed.

1. Added read-only `current()` to the store for generation validation and delayed flushes; neither a reply nor a timer may create a new session. Cost if wrong: revise one internal method.
2. Yandex uses `defer:true` plus one explicit initial pathname hit, following the official SPA contract, rather than an automatic query-bearing hit. Cost if wrong: revise first-hit wiring and verify actual provider receipt before rollout.
3. Repeated logical suites temporarily use fsync/synchronous_commit off only in the named disposable local fixture database. Initial repository tests ran durably; settings were restored and 11/11 rerun durably both before review and after the final full suite. No production settings changed or physical crash-safety claim made. Cost if wrong: rerun the whole suite with durable settings.
4. Provider receipt/goals remain a release gate: existing authorized Metrica account cannot see counter `105288175`; Mail was unavailable. No account, permissions or counter IDs changed. Cost if wrong: establish correct authorized access and verify an approved event before rollout.
5. Legal sufficiency and final privacy digest approval belong to the owner. Technical disclosure was checked, not legally accepted. Cost if wrong: revise policy/consent version before release.
6. Backup/rollback, a fresh CRM test lead, merge/push and deployment remain unexecuted. Review does not grant those permissions. Cost if wrong: a separate authorized integration/release cycle.
7. Linux systemd and optional hardened-content-image checks remain two environment skips. Cost if wrong: execute them in release CI with the required image/platform.
8. No power-loss durability claim: a durable repository run proves logical operations, not crash recovery. Cost if wrong: a dedicated database fault-injection exercise.
9. Browser-session counters and basic bot/rate filters do not prove unique humans or prevent all distributed abuse. Cost if wrong: assess additional abuse protection, without inventing historical counts.
10. Safari/Firefox and manual screen-reader checks remain unverified. Chromium and semantic tests are the actual evidence. Cost if wrong: execute that compatibility/accessibility matrix before enabling there.

## Deferred minors

None.

## Release boundary

Owner approval of final privacy text/digest, actual provider-side receipts, an explicit integration choice and required production/CRM-gate authority remain pending. No content/body/metadata/revision/core writes were made by the view-counter feature. Tests compare complete CMS/revision/relation/core hashes. The feature is disabled by default.
