# GEO compatible control release 8 October 2026

GEO reporting and experiment safety are deployed at revision ee4fc9e15895a998789b0b6b7fdd387a6af081c5. No new AI or indexing requests, content edits, core activation or experiment creation occurred.

## Release verification

CI37776192895 and protected deployment37778201792 succeeded. Independent SSH verified active green, healthy, the exact configured and actual image ID, OCI revision, public readiness and slot header, canonical redirects and release boundary. Web image: ghcr.io/korotkov-s/kordevteam-web@sha256:f718a1c21a07fb2a76d5e88bf3a260fb93d9c61775940dd93be03943c76b9bdb. Content image: ghcr.io/korotkov-s/kordevteam-web@sha256:ee4970a03438c45f0c5019a9c0fb91b5a4380c8afe5d58784096aa57c2234494. Content manifest81ce53eeae6e9c4d319afe587a4adc9c3fdacf2a0df9254a08652491b15c4e7c.

Encrypted pre-release backup: private/kordevteam-backups/2026-10-08T12-38-50-068Z-pre-release-4906d27c-5107-483e-ab37-457b5d2dbc17.tar.age. Release gate recorded marked test lead697429dc-0e47-46b7-af35-4dd3d7b7ad94. Content plan/apply145 unchanged, zero insert/update/conflict/mismatch. Migration count23. Before/after hashes of all148 content entries, relations, queries, prompts, entities and all68 raw observations match; experiments remain0. Active core remains109 across78 published monitored pages.

Exact-tree full npm test: JS224 passed/2 skipped/0 failed; TS/browser1128 passed/0 failed. Typecheck/build/dbcheck passed. One fresh whole-branch review accepted two Important findings; approved-definition substitution and final-day attribution gap each failed first then passed, followed by the complete suite. No second review.

## Saved production evidence

MCP read September11–October8 returned eight platform/category coverage cells and seven exact compatible cohorts. Each cohort has1/3 required snapshots; none supports an improvement verdict.

Alice: brand3/4 questions checked,9/9 mentions and5/9 citations; nonbrand9/34 checked,0/27 mentions/citations. Google nonbrand3/34 checked,0/9; ChatGPT nonbrand2/34 checked,0/6. Other brand groups and Bing have no checked questions, with null rates and denominator0, not negative observations. Broad coverage totals remain descriptive and can span conditions. Tracked-entity SoV is not market share.

Existing heartbeat remains ACTIVE with original recurrence and target. Readback exactly matched all substantive prompt bytes; app removed only a terminal newline. Prompt SHA256 ac7ee46749afd7323032fdd7a885b334af53f398b4e02c65c0a6d3fb51d38db7. The initial strict readback rejected that normalization; explicit trimEnd comparison resolved it without another update.

## Decisions and deferred findings

Task1 Ruling: add optional surface/sessionPersonalized repository filter types in Task1 rather than Task2 — required to test full-run-before-personalization projection now. Cost: external service/MCP/admin propagation remains intentionally Task2/3 and is not yet shipped.
Task2 Ruling: same-page cooldown applies to every implemented experiment, including completed/cancelled and official metrics; use absolute separation between recorded actual application timestamps under page advisory lock — changing prompt set/status/backdating must not evade the14-day boundary. Cost: an independently justified simultaneous official-metric experiment also waits14 days; no unauthorized prod experiment is created.
Task2 Ruling: require exact original full prompt plan for observational experiment cohorts and one unambiguous definition cohort — projecting a common subset cannot fabricate a fixed baseline. Cost: evidence split across different original run plans remains insufficient until comparable snapshots exist.
Task3 Ruling: queue remains independent current-cycle global coverage with selected platform/region list; do not filter queue by date/surface/personalization because that would conceal uncollected work — label queue vs analytics explicitly. Fetch all list pages and reject repeated cursors/cycle change. Cost: operational queue can show work outside the analytic interval; global summary is not the filtered list count.
Final: minor (deferred): current-cycle queue scope/global totals are not always explicitly labelled in admin; list remains operationally correct and analytics remain strictly scoped, but filtered/historical reports may look inconsistent. Copy-only clarification deferred as Minor; no collector/metric change is needed.
Final: Ruling: Share of Voice roster remains the currently confirmed tracked entities, not a frozen historical roster — explicit stage contract and UI label, no claim of market-wide share. Cost: adding/removing a confirmed entity can change descriptive SoV denominator; no causal comparison is claimed across roster changes.
Final: Ruling: reviewer did not judge external deployment/heartbeat compatibility — retain pending immutable release and independent actual production checks as a separate gate, never infer them from code review. Cost: tests alone do not prove the live release; release cannot be marked complete until verification evidence is recorded.
Final: Ruling: use conservative saved-text plus updated-after-candidate rejection instead of another schema snapshot field — existing prompt snapshot and creation time prove unchanged definitions without guessing legacy history; share locks fence concurrent edits. Cost: a nonsemantic prompt edit after candidate creation also requires a new candidate; official referral/crawler baselines remain independent.
Final: Ruling: preserve native feature branch for the next owner-authorized sequential stage and archive this plan's owned scratch only after release proof is captured, rather than delete its only uncommitted review/ledger evidence before deployment — no worktree was created, ordinary checkout remains user-owned. Cost: temporary scratch remains until physical release acceptance; release records must be committed before recoverable archive.
Task3 Ruling: separate implementation verification from Task3 release completion to permit the required whole-branch review before merge — release proof is recorded after deployed checks, never inferred from task-done. Cost: the task-done label alone is insufficient evidence of production completion; this explicit pending release line governs it.
Ruling: owner explicitly chose continuous staged native implementation, merge/deploy/check without pauses — waive separate spec/plan approval pauses, retain review/tests/release gates. Cost: architectural choices are not separately approved.
Ruling: continue existing named feature checkout with installed locked dependencies and exact unchanged stage3-tested baseline, not create another worktree or reinstall dependencies — preserve existing workflow and avoid unrelated state. Cost: branch isolation only, not a separate directory.
Ruling: reject runs if a current prompt was updated after run start — no trustworthy old definition snapshot exists. Cost: conservative loss of analytical eligibility even for a nonsemantic edit; raw evidence remains readable.
Ruling: three distinct full compatible run snapshots may be collected in the same week/day — user protocol requires independent complete snapshots, not three calendar weeks. Cost: no assertion of temporal independence or statistical significance.
Ruling: aggregate category coverage can span regions/surfaces and is descriptive only; decision readiness and experimental metrics remain in exact cohorts. Cost: broad coverage percentages are not trend/comparison estimates.

The original ledger and review artifacts are recoverably archived under the local automation release-artifacts directory after this proof is committed. Native feature branch is retained for the next authorized stage.
