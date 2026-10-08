# Publication Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, task-by-task.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, React Router, node:test, existing immutable deployment pipeline.

Goal: connect actual human publications to existing versioned SEO control and prevent duplicate/inconsistent Telegram intake.
Architecture: one transaction helper shared by existing admin/MCP and generic content writes, existing journal/query tables, one source-identity constraint migration. No new monitor/worker/provider calls.
**Spec:** docs/superpowers/specs/2026-10-08-publication-lifecycle-design.md. Stage4 release physically verified at ee4fc9e before implementation.

## Global constraints

- No production content/active-core mutations or automatic publishing. Telegram new material draft/indexablefalse, source public korotkovsStudio only.
- Exact source triple matching and concurrent uniqueness across draft/published; existing provenance cannot silently be removed/rewritten by ordinary saves/restores.
- Actual published version/application timestamp required; preserve first publishedAt, revisions, identities; no guessed historic backfill or static no-op deployment events.
- Missing explicit phrase remains visible gap; explicit article phrase only missing candidate/trackedfalse/nullWordstat, never retarget existing phrase or infer official frequency.
- Both write repositories share boundaries; no external side effect before commit; stale writes/failure leave no journal/candidate residue.
- Same full suite, single fresh branch review, immutable CI/deploy/independent unchanged-data verification, existing heartbeat only.

## Review focus

- Restore can bypass ordinary editor provenance and journal rules; tests must use real revision restoration and unchanged source identity.
- Concurrent duplicate source with different slugs must return a safe source conflict rather than create two drafts or rewrite original.
- Slug withdrawal and replacement require separate truthful public paths, with no invented redirect or historical-version reassignment.
- Republish a no-op increments version today; event must describe version publication rather than pretend semantic improvement and restart first-publication date.
- Concurrent manual candidate creation/assigned query must preserve its existing target/status/Wordstat, including another-page cannibalization risk.

## Task1: source identity boundary

Files: src/server/content/types.ts validation; new src/server/content/provenance.ts helper; src/server/db/schema.ts + migration0023/journal/schema/backup fixtures; src/server/admin/contentRepository.ts and src/server/content/repository.ts guards/errors; src/server/mcp/tools.ts safe map, src/routes/admin/content-http.server.ts409 map; targeted validation/DB/MCP tests.

Interfaces: assertTelegramTransition(before:ContentEntry|undefined,after:ContentEntry|undefined):void, safeContentWriteError(error:unknown):Error. Detect exact constraint SQLSTATE through bounded cause traversal, do not expose driver messages. payload all-none/matchingURL validation shares pure identity parser. Two expression unique indexes over current article source fields; migration fails on conflicting existing records, never repairs.

- [ ] Write pure partial/mismatch provenance and new draft indexability tests; real DB simultaneous duplicate/own-update/source-rewrite/restore tests for both repos plus safe MCP/HTTP error code. Observe real failures before code.
- [ ] Implement minimum validation, shared transition guard and schema constraints/indexes. Preserve generic drafts, published Telegram records and source-none records. Own unchanged provenance update allowed.
- [ ] Run `env TEST_DATABASE_URL=postgresql://kordev_ci:kordev_ci@127.0.0.1:54329/kordev_test node --import tsx --test --test-concurrency=1 src/server/content/provenance.test.ts src/server/admin/contentRepository.test.ts src/server/content/service.test.ts src/server/mcp/tools.test.ts src/server/db/schema.test.ts tests/deploy/backup.test.mjs`; expected0 failures, no skipped DB tests. Run `npm run typecheck` and `npm run db:check`; expected exit0. Commit. Full suite remains final release gate.

## Task2: atomic publication events/candidates

Files: new content/publicationLifecycle.ts + DB tests; admin/contentRepository.ts; content/repository.ts; content/service.test.ts and admin repository tests; source-aware helper from Task1; no independent API endpoint.

Interfaces: recordPublicationTransition(tx:ContentWriteTransaction,input:{before?:ContentEntry,after?:ContentEntry,actorId?:string,linksChanged?:boolean,mediaChanged?:boolean}):Promise<void>. Writes existing seoChanges plus optional missing seoQueries candidate. Uses entryPath and existing normalizeSeoQuery;500UTF8bytes phrase bound. Helper called inside both repositories after final relations/media writes and before return/delete (FKSETNULL preserves deleted-page event).

- [ ] Write failing initial published create/update/restore/withdrawal/slug/draft/FAQ/no-op journal tests with literal IDs/versions/paths and actual time distinct from preserved old publishedAt; concurrency stale-one-winner and forced journal insert failure rollback real rows/revisions/relations/candidates.
- [ ] Write missing explicit primary phrase candidate false/null frequency and existing normalized phrase preservation tests (including conflicting target/active/status/frequency) and simultaneous manual candidate lock behavior. No source-less phrase invention.
- [ ] Implement smallest shared transactional helper; exactly one event per affected public path/new version, old URL technical withdrawal and new URL event on slug move. Actor existing admin identity or null, never invent MCP identity. Candidate only current published/indexable explicit article phrase under shared existing advisory key. Preserve static/import path exceptions, no backfill.
- [ ] Run `env TEST_DATABASE_URL=postgresql://kordev_ci:kordev_ci@127.0.0.1:54329/kordev_test node --import tsx --test --test-concurrency=1 src/server/content/publicationLifecycle.test.ts src/server/admin/contentRepository.test.ts src/server/content/service.test.ts src/server/content/cache.test.ts src/server/mcp/tools.test.ts src/server/seo-monitoring/effectsRepository.test.ts src/server/seo-monitoring/pageControlRepository.test.ts`; expected0 failures, no skipped DB tests. Run `npm run typecheck`, `npm run build`, `npm run db:check`; expected exit0. Commit.

## Task3: documentation, full acceptance and release

Files: runbook, operations protocol/Telegram instructions, release proof, existing heartbeat after physical acceptance.

- [ ] Document visible gap vs pending candidate vs active control, and human indexability/publication/activation steps. Semantic duplicate review remains mandatory, exact source uniqueness is not semantic proof. Explain events are not improved rankings and requests are not guaranteed indexing.
- [ ] Run full npm test/typecheck/build/dbcheck, one fresh whole-branch reviewer; one Important RED→GREEN pass and complete suite, defer Minor with record.
- [ ] Fast-forward/push exact verified tree; immutable successful CI artifact/protected backup/markedlead deploy; independent active image/revision/health and unchanged actual content/core/GEO checks; read existing registry/journal (no test production publication). Update existing heartbeat instructions preservingcadence/limits. Commit release proof and archive only owned scratch recoverably.
