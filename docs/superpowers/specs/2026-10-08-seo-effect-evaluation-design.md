# SEO change measurement — stage 2

## Intent

Close the measurement part of the owner's loop: after a human-approved page change, preserve a baseline and evaluate comparable 7/14/28 complete-day windows. Show why a decision is deferred instead of interpreting missing/immature data as failure. This is monitoring only, never automatic content/core/budget changes.

## Architecture and alternatives

Use a pure evaluator, append-only PostgreSQL measurement snapshots, a bounded operational CLI and authenticated admin/MCP reads. Computing mutable verdicts only in the UI loses the original evidence; putting unstructured conclusions in recommendation text hides comparability. Separate snapshots preserve both. Each snapshot identifies change, source, checkpoint, policy, frozen keyword cohort, baseline/after periods, coverage, counts and source/index provenance. Hashes deduplicate identical evidence; new evidence appends, never overwrites.

Capture the assigned active keyword cohort on the first evaluation per change/source. Freeze the first complete baseline for each checkpoint, recording its actual capture time and explicitly marking retrospective reconstruction if captured after application. An incomplete baseline may later become complete; it must not become a permanent zero. Baseline excludes the source calendar day containing the change. After-window starts the following full source calendar day (Yandex Europe/Moscow, Google America/Los_Angeles). Checkpoints are 7, 14 and 28 days; 7 is an early signal, 14 intermediate and 28 an observational final window, never causal proof.

Use Russia only and desktop/mobile (Google also tablet), excluding device=all and city aggregates. Compare the same frozen query IDs. Primary signal is the equally weighted mean of per-query impression-weighted average positions, with every query requiring at least 100 impressions in each window. Report raw clicks/impressions/CTR separately with their denominators; query-data coverage is not total site traffic. Engineering policy minimum effect is one average position, not a search-engine promise. No keyword or zero impressions means insufficient_data, never outside top-100. Exact paid rankings remain separate and retain existing full-compatible-matrix rules.

Prove every date is covered by the union of successful collection windows; absence of metric rows alone is not missing coverage. Require a successful, fresh latest source attempt, and acquire the same source advisory lock to avoid reading a partially refreshed dataset. Require current published page/index evidence, indexed status, correct version/path and lastCrawlAt at/after application before a directional verdict. A later page change within the measured interval or current version mismatch without journal evidence makes it confounded. Removed/reassigned frozen queries make it incompatible; added queries do not silently enter the cohort. Other-type operational journal events are not evaluated as content experiments.

States: not_applicable, pending_period, pending_source, pending_coverage, pending_refresh, confounded, incompatible, insufficient_data, improved, declined, no_material_change. The UI displays the actual windows, raw counts, source freshness, policy and noncausal caveat. Existing changes are reconstructed honestly; no invented publication-time baseline.

## Delivery and safety

The CLI evaluates saved database evidence only, no provider APIs. The daily existing heartbeat runs it after index-evidence synchronization; an idempotent repeat is harmless. Admin reads never write snapshots. Expose page control and evaluation history through seo:read with pagination. No new monitor or paid collection. Full unit/PostgreSQL/UI/MCP tests, review, immutable release and actual production snapshot verification are required before stage 3.
