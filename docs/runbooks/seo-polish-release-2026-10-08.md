# SEO/GEO admin polish — release proof, 8 October 2026

## Scope and outcome

All five approved defects were corrected in three ordered releases. Functional main and production revision: `7429f90b89e8f8958af8596e3987339cd7015376`. This final proof is documentary and does not require another application deployment.

1. Paid rank copy describes weekly group rotation, not daily complete paid monitoring.
2. The positions screen compares every active query and target with saved Yandex Webmaster / Google Search Console period averages and a separately dated paid Yandex control in the same row. Comparison scope is Russia/desktop; the complete control matrix remains below. Missing checks are not outside top-100; source failures preserve cached data with warnings. Google has no paid exact control here.
3. GEO labels distinguish the current global operational queue from the filtered historical analytics period.
4. The content editor distinguishes a previously linked Telegram post, immutable provenance, an occupied slug and an actual stale version, while preserving submitted fields and sanitizing unknown errors.
5. The effect evaluator reads evidence relevant to each change and window instead of eagerly loading entire database histories. Frozen cohorts, first complete baselines, original millisecond comparison semantics, locks, source/index gates and append-only evidence remain intact. Exact PostgreSQL keyset cursors preserve microseconds and avoid repeated batches.

## Release checkpoints

| Stage | Revision | Successful CI | Successful protected deployment | Independent verification UTC |
| --- | --- | --- | --- | --- |
| Position/GEO presentation | `6c91ff5d71b636c04917f4231033aa9e220e9e8e` | `37792782041` | `37795561439` | 2026-10-08T14:52:17Z |
| Editor conflict messages | `bf71fc8c6c4ce56ef405b9f06c7e8e557eeafe09` | `37796097497` | `37798957379` | 2026-10-08T15:17:04.963Z |
| Relevant evidence reads | `7429f90b89e8f8958af8596e3987339cd7015376` | `37799493487` | `37802561647` | 2026-10-08T15:42:24.763Z |

Each later revision was merged/pushed only after the prior production checkpoint passed. The exact successful CI artifacts were used, without rebuilding a guessed production image.

Final web image: `ghcr.io/korotkov-s/kordevteam-web@sha256:e82c21aea07a06abf8738bb9536cc1410d803c525ba8ca7195988006175bd83d`.

Independent SSH verification required the sole exact current-slot marker, a regular non-symlink mode-0600 slot record, immutable image digest, matching container Config.Image and actual image ID, OCI revision matching checkout, healthy status, public readiness/slot identity, canonical redirects and release-boundary checks. Slot selection was dynamic, never fixed by color. Final active slot was green.

Every release content plan/apply reported 145 unchanged, zero insert/update/conflict/mismatch. Full content/core/GEO/journal/effect/recommendation state hashes matched the pre-polish baseline after every deployment and after final evaluation. Normal explicitly marked deployment test leads were persisted by the existing release gate; this is not a claim that every table in the entire database was untouched.

## Verification and review

- Stage 1 focused regression suite: 28/28. Full application suite: 1157/1157; server JavaScript: 224 passed, 2 existing skips, zero failures.
- Stage 2 route regressions: three expected RED failures, then 9/9 GREEN. Fresh independent review found no issues and independently passed 9/9.
- Stage 3: bounded-history regressions observed RED, plus native PostgreSQL microsecond cursor and source freshness regressions observed RED; all 17 effect tests GREEN after fixes. The 56-change batch/idempotence and frozen-baseline cases remain covered.
- Final full CI-equivalent application suite: 1166/1166, no skips/failures; server JavaScript: 224 passed, 2 existing skips, zero failures. Typecheck, build and diff checks passed. Remote complete CI succeeded for each released revision.
- Review caught source-health ambiguity and the database timestamp precision bug; both were covered by observed RED-to-GREEN regressions before release. No unresolved concrete review finding was carried into production.
- Strictly checked old and new production saved-DB evaluators both returned `{"inserted":0,"unchanged":108}`. Final pipeline exit code 0 at 2026-10-08T15:42:54.262Z.

Invalid test attempts without the complete CI fixture environment and interrupted pre-fix runs are preserved as diagnostic history, not acceptance evidence. The authoritative final log is `kordev-seo-polish-stage3-final-acceptance.log` in the private artifact directory below.

## Boundaries and limitations

No external provider collection, paid or AI sends, indexing submissions, public content changes, active-core changes, budget/schedule/account changes were performed for this task. Saved-data evaluation is not a fresh search measurement or evidence of position growth.

The production admin URL redirected to the existing login screen in the available browser session; no authenticated live dashboard visual check was performed and no new login or permissions were attempted. Local component/browser tests and production identity/health checks do not substitute for that visual check.

Relevant overlapping-run and later same-page evidence arrays can still grow because the existing result retains those records; some SQL scans and extra per-change queries remain. This is removal of eager whole-database application-memory loading, not a constant-memory/IO guarantee. Existing floating-point iteration order and read-committed snapshot limitations were not changed.

## Evidence location

Private secret-free release evidence and logs:
`/Users/alex/.codex/automations/seo/release-artifacts/2026-10-08-seo-polish/`.

Per-stage `release-manifest.json`, `verification.json`, `lifecycle.json`, `geo.json`; old/new evaluation JSON; pipeline log; scoped review record; RED/GREEN/full acceptance logs; execution ledger. Protected backup object identifiers and marked deployment lead evidence remain in private verification JSON, not this public repository document.
