# Approved SEO execution — release evidence, 2026-10-09

All timestamps below are UTC. Secret-free local receipts are retained under `/Users/alex/.codex/automations/seo/release-artifacts/2026-10-09-approved-execution/`.

## Application and acceptance

Application commit: `87cae5e7dcfaf156701f9e1394800802199e554d`; fast-forward merge from `b54b415554647a16373ff477468b998b10790bec`. Working branch `codex/seo-full-cycle` is preserved at the owner's request. This document is release evidence only, not additional application code.

The dedicated local CI-equivalent database suite completed before push: JavaScript224 passed,2 existing skips,0 failures; TypeScript1259 passed,0 skips,0 failures. The same full suite passed again on merged main (TypeScript534154ms). Sequential typecheck, build, db:check and diff-check exited0. Real rendered approval-diff screenshots were inspected at390/1440px; this was a synthetic stress test, not an authenticated production UI assertion.

One independent whole-branch review found four Important issues, no Critical or Minor issues. One RED→GREEN fix pass addressed duplicate Markdown media references, current official GEO baseline revalidation, accepted-approval cancellation, and explicit consideration-only acceptance of unusable plans. Full-suite regression acceptance followed. Old migration downgrade/backup fixtures were extended for0024 without weakening assertions or altering earlier working migrations.

## Release gates

CI: [37932752208](https://github.com/Korotkov-S/KorDevTeam-web/actions/runs/37932752208), exact application commit, success. On the Node22 CI runner, JavaScript225 passed/1 skipped/0 failed and TypeScript1259 passed/0 skipped/0 failed (728618ms). The skip count differs from the local host; actual counts are recorded separately. Runtime smoke, typecheck, build, migration/content-release preparation, crawler and multi-arch image validation passed.

Verified immutable manifest:

- Web: `ghcr.io/korotkov-s/kordevteam-web@sha256:16191d560247b7f9d1e724a30f5bd6d7f1a61b3134bd4a6f16af76a9daac14c5`.
- Content: `ghcr.io/korotkov-s/kordevteam-web@sha256:c75135b49f0130cb9b44dbb7c532143d9b9dac8131686cd36648152878858a8b`.
- Unchanged approved content manifest: `81ce53eeae6e9c4d319afe587a4adc9c3fdacf2a0df9254a08652491b15c4e7c`.

Deployment: [37935427401](https://github.com/Korotkov-S/KorDevTeam-web/actions/runs/37935427401), exact application commit, success. Independent strict verification at2026-10-09T13:18Z confirmed the sole active slot `green`, regular non-symlink0600 slot record, manifest digest, Config.Image/image ID, OCI revision/current checkout and healthy state. The slot was discovered dynamically, not hardcoded.

The encrypted pre-release backup was recorded at13:15:54.810Z; the existing marked lead gate completed at13:16:28.887Z. Content release reported145 unchanged,0 inserted,0 updated,0 conflicts and0 verification mismatches. No test publication or consent was created.

## Read-only production baseline

Baseline captured at2026-10-09T11:00:10.991Z and independently repeated at12:29:31.914Z and13:04:25.474Z with identical data hashes/counts and production revision. All SQL was in a read-only transaction, after strict active-slot/immutable-image/OCI-revision/health validation. Protected environment/credentials were never printed.

| Saved data | Rows before release |
| --- | ---: |
| content entries / revisions |149 /56|
| content relations / media refs |121 /0|
| semantic queries / active tracked |284 /109|
| daily metrics / exact rank checks |352 /4059|
| GEO observations / citations |86 /657|
| recommendations / recommendation history |12 /15|
| migrations |24|

Post-release comparison at13:18:44.417Z confirmed all listed data hashes/counts unchanged, active keys109 unchanged, and only the expected schema additions: migrations24→25 and the new execution table. Exact0024 SQL hash matched the migration journal; execution rows0 and non-null legacy plans0. The existing12 recommendations and15 history rows were unchanged.

Public smoke at13:18:47.591Z checked actual saved published rows: service `/services/business-process-automation/` version1; case `/cases/nagrada/` version1; article `/blog/krasotulya-telegram-105/` version2. All three returned200 with unique matching SSR entry/version identity, title/H1/description/canonical/robots. This is a three-kind smoke, not a fresh whole-site indexing audit. Guest admin list/detail routes redirected to login with no-store/noindex; no authenticated production visual check is claimed.

No content approval/publication, paid search, provider collection, indexing submission, token creation or scope upgrade is authorized as a release smoke test. The existing workflow's explicitly marked lead gate is the sole test-write exception.

## MCP and existing heartbeat

Existing authorization verified via read-only tools/list at2026-10-09T12:48:25.414Z:44 pre-release tools. Native read-only recommendation listing also succeeded. The release verifier was corrected to consume the actual SDK SSE transport (`200`, `text/event-stream`, `no-cache`), rather than incorrectly requiring plain JSON/no-store. This changed only the local verification helper, not application code, permissions or credentials.

Post-release discovery and read-only work/get verified at13:18:42.113Z with the existing token: all four new methods visible, strict apply schema, executionPlan revision supported and required scopes already available. Queue0; an actual legacy-card read returned blocked/`seo_execution_approval_required`, correctly without fabricated authority. No apply/complete call, new token or scope upgrade was used.

The current chat's native MCP tool metadata is still cached without the four new methods. The owner needs to refresh the existing `kordev_site` connection. No alternate HTTP execution path is enabled; if a future run still has the old schema it must report the blocker once and continue independent monitoring.

The existing `seo` heartbeat was updated only through automation_update and read back at13:20:15.511Z. Its complete original prompt was preserved, with one appended narrow execution section. Status ACTIVE, kind heartbeat, target chat `01a0d177-0f83-7381-9e8b-b4abc91e118c`, existing09:00/09:30/11:00/11:30 schedule and all other settings were unchanged. The app trimmed only the final newline; exact normalized text was verified. Saved prompt SHA-256: `8d84df52ffee329d429db1427d57f4c2a482039587b340216bdd804957b56d1b`. No additional monitor/chat or provider collection was started.

## Limits and decisions

`accepted` alone is not publication permission. Legacy cards need a compatible exact proposal and explicit human approval. `implemented` requires server-confirmed public verification; it does not mean search indexing, position growth or factual truth. Future prose remains subject to editorial review. Production smoke tests deliberately do not create a test approval/publication.

Rulings, in order (each includes the cost if wrong):

1. Correct task-heading formatting to satisfy the task-start helper; document-only cost.
2. Keep only the new0024 SQL delta despite the older Drizzle snapshot; migration-failure risk covered by fresh/upgrade tests.
3. Extract the existing GEO transaction body for atomic CMS+GEO linkage; GEO-regression risk covered by repository tests and final review.
4. Run the single final review inside Task7 before release, then add operational evidence; only evidence, no unreviewed application bytes, comes afterward.
5. Require direct production/MCP/heartbeat evidence where the reviewer declined judgment; otherwise release/client compatibility must remain unverified.
6. Use actual sequential full-suite and exact-SHA CI evidence rather than the reviewer's unrun-suite inference; integration regressions block merge/release.
7. Keep factual accuracy with editorial agent/owner review, since exact approval is not a truth detector; inaccurate prose could otherwise be approved despite technical guards.

Deferred minors: none.
