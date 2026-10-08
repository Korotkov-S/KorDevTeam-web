# Publication lifecycle release — 8 October 2026

Functional revision `fd07dc1b0a553a8ac4a3f6632b5a7855ed7ea422` is merged, pushed and independently verified in production. This documentary commit follows that release; it does not claim a different revision was deployed.

## Implemented cycle

Both content repositories atomically record actual published article/case/service versions and application times in the existing SEO journal. First publication dates are retained. Withdrawal, deletion and slug replacement have truthful affected paths, without fabricated redirects or guessed historical versions. Ordinary drafts and FAQs create no independent public-page event. Failed journal/candidate writes and stale publication roll back the entire transaction.

An explicit primary phrase on a published indexable article creates only a missing, inactive candidate with unknown Wordstat. Existing normalized assignments, status and frequency are preserved. Telegram intake requires a consistent unique source triple; ordinary edits/restores cannot silently replace or remove it. New intake remains draft/non-indexable. Exact source uniqueness does not replace semantic duplicate review. Publication, indexability and query activation remain human decisions.

The existing page registry, indexing evidence, assigned-query monitoring, recommendation history, saved 7/14/28-day evaluation and compatible GEO evidence now have a proven publication-version link. This is operational measurement capability, not a claim of improved rankings, indexing or generic AI visibility.

## Release evidence

- [CI 37782403598](https://github.com/Korotkov-S/KorDevTeam-web/actions/runs/37782403598) and [protected deployment 37784779018](https://github.com/Korotkov-S/KorDevTeam-web/actions/runs/37784779018) succeeded for the exact functional revision.
- Web image: `ghcr.io/korotkov-s/kordevteam-web@sha256:0e3fcba406558a5c5223afa6a3a730adcd0be1be00e6517b79dd04e67320f89e`. Content image: `ghcr.io/korotkov-s/kordevteam-web@sha256:1d8a4d7f9bbb1c569d48d58732531eb05456b59920c30022a839569c9b45562a`.
- Content manifest remains `81ce53eeae6e9c4d319afe587a4adc9c3fdacf2a0df9254a08652491b15c4e7c`; owner-reviewed privacy source remains `cff47f3a18cff1e80d9ebf65c71a1261bcf1fe11cc88447bae716b2049147a55`.
- Independent SSH verified active blue, configured and actual image ID, OCI revision, container health, public readiness/slot header, canonical redirects and release boundary. Content plan/apply: 145 unchanged, zero insert/update/conflict/mismatch.
- Migration count 24; two Telegram unique indexes and one validated identity check exist. Three existing Telegram sources are complete, with zero duplicates or partial triples.
- Encrypted pre-release backup: `private/kordevteam-backups/2026-10-08T13-30-53-866Z-pre-release-d8f55c0f-392b-4e17-bedb-12f8c5b66669.tar.age`. Marked release-test lead: `1eb4d932-e5da-445b-b5b6-bd7fc286a2b2`.
- Before/after row hashes match for all 148 content entries, relations, queries, GEO prompts/entities and 68 raw observations. Journal 18, saved effects 108, recommendations 12 and history 11 also match complete row hashes; experiments remain zero. Complete MCP reads independently confirm unchanged exact versions of 48 articles, 23 cases and seven services, plus 109 active queries across 78 targets.
- Actual local full suite: 224 JavaScript passed, two existing skips, zero failures; 1,150 TypeScript/browser passed, zero skips/failures. Typecheck, build, migration check and diff check passed. One fresh reviewer found zero Critical/Important issues and one deferred Minor; no second review or unverified fix pass.
- Existing SEO and Telegram heartbeats were updated only after physical acceptance. Exact substantive prompt readbacks and original ACTIVE status, recurrence and target were verified. SEO prompt SHA-256: `b107ec9c5c75fdbc083b63372680123752463ccc7a8e6db97cd1588c00bdf749`; Telegram: `6e38c4b11509b2ca493a2d9539a3e7ebc3d961fb23a5ecacf7bd4e23c33e67ff`. Daily collection/source watermarks were retained.

No actual article publication/edit, active-core change, new provider/AI/indexing/paid-rank request, budget increase, timer change, additional monitor or chat occurred during acceptance. Original ledger, review, logs, immutable manifest, hash comparisons and safe verification helpers are recoverably archived in the local automation release-artifacts directory.

## Rulings I made, in order

1. Owner explicitly requested continuous stages without approval/merge pauses: execute the written design inline with tests, one fresh review and immutable release gates. Cost: architectural choices were not separately approved.
2. Reuse the clean feature checkout, installed locked dependencies and verified unchanged baseline. Cost: branch isolation rather than directory isolation; all task/full-suite checks still required.
3. Source reservation covers current draft/published articles, not deletion tombstones. Cost: deliberate human hard deletion frees the source; historical/semantic editorial dedup remains required.
4. Journal actual new versions/application times, preserving first publishedAt; log no-op republishing truthfully. Cost: unchanged republishing can invalidate older exact-version attribution, not imply improvement.
5. Only an explicit phrase on a published indexable article creates a missing candidate with null Wordstat; never retarget or activate existing phrases. Cost: other page kinds and conflicting assignments require human query selection.
6. Implementation task completion is separate from physical release completion. Cost: a task-done label alone proves neither deployment nor automation compatibility.
7. Reviewer set aside operational release behavior: independently verify immutable image, migration, data preservation and heartbeat readbacks. Cost: code review alone cannot detect live deployment faults; physical gates are mandatory.
8. Reviewer did not repeat prohibited tests/builds: retain observed author full-suite/type/build/schema evidence and require independent CI. Cost: local/runtime differences remain until isolated Node 22.22 CI passes.
9. Fast-forward the exact tested tree, retain the feature branch, and use mandatory CI rather than an identical local branch-name-only rerun. Cost: no separate local post-merge run; exact-SHA equality and full independent CI are required.
10. Commit/push post-release documentary proof on the retained feature branch, leaving main/production at the exact verified functional SHA. Cost: the proof is not itself in main; its named branch and recoverable archive preserve the evidence without creating a recursive deployment.

## Deferred minors

- The admin editor maps source duplicate/immutable-provenance errors to HTTP 409 but displays generic stale-version refresh guidance. A future copy change should distinguish these safe domain errors. Constraints and API boundaries still fail closed; no data-loss path was found.

Earlier stage limitations remain documented in their own release proofs: historical arrays can be optimized under evaluator locks, and the GEO queue's current/global scope label can be clearer. No blocking finding remains in this publication lifecycle plan.
