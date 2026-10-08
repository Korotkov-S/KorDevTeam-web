# Publication lifecycle stage 5

## Intent and limits

Owner wants the closed cycle for every published article/case/service: current published inventory and technical/index evidence, assigned query coverage, measured history, evidence-backed recommendations, human-reviewed changes and7/14/28 effects. Existing stages supply inventory/index reads, exact query control, evaluations and recommendation reconciliation. Remaining missing link: CMS publication does not atomically create a proven versioned event. Telegram intake must stay draft/indexable=false and retain consistent deduplicated source provenance.

Chosen approach: shared transaction helper called from both admin/MCP and generic content repositories. Alternative async outbox adds a new worker/delay/recovery for writes already in one DB; cron inference cannot prove exact publication time/version. Use existing seoChanges, seoQueries, sitemaps entryPath and canonical registry; no second collector. Owner authorized native sequential delivery without approval pauses, retaining tests/review/immutable deploy. Stage4 is physically verified at ee4fc9e. This stage preserves the same native sequential authority and release gates.

## Source provenance and dedup

When any article Telegram provenance field is supplied, require all three, exact contentOrigin and matching positive decimal ID/public sourceURL. No personal Telegram/auth/scraping. Two expression unique indexes protect current article postID and sourceURL across published and draft rows, including concurrent writes/restore. Migration validates existing data; never merges/deletes/repairs duplicates automatically. Actual production preflight:3 complete sources,0 duplicates.

Once provenance exists, ordinary edits/restore may not drop or replace it. New source can be assigned once to a previously non-Telegram entry only when complete and unclaimed. This is not historical tombstone storage: deliberate hard deletion outside automation can remove a source reservation; automation itself never deletes. Exact dedup is structural, semantic cannibalization remains required editorial review using live inventory/core; no automated similarity score is represented as proof.

New Telegram draft creation requires indexable=false. Existing published Telegram entries remain unchanged/indexable as approved; publication requires explicit human flow and explicit indexability selection. Generic non-Telegram draft behavior unchanged. Safe source-conflict/provenance-immutable codes map to409 and content-validation to422; expose no SQL/source content in errors. Both write repositories enforce same rules; no bypass via revision restore.

## Proven publication events

Within the content transaction, after exact new version is obtained and relations/media written, record affected public article/case/service versions in existing seoChanges. Draft-only changes and FAQs create no public page event. Initial publish/republish/published update/restored publication record actual application time (not preserved first publishedAt), exact contentEntryId/contentVersion and public entryPath. Preserve first publication dates and immutable revisions.

Transition to draft and removal/slug change records old URL withdrawal as technical event. Slug change additionally records new public URL/version; never fabricate a301. Hard delete if explicitly invoked outside automation records old-page technical event before FK SETNULL, history retained. No-op republish currently increments version; log truthful republished-version event rather than claim content improvement. Field/relation/media differences choose truthful content/metadata/structure/interlinking/technical classification; when multiple classes change record a concise combined summary with one event per affected path/version. Existing manual journal remains compatible; stale expectedVersion and transactional failure create no events.

No retroactive backfill of guessed historical versions, no duplicate rows for unchanged immutable static release. Historical import remains explicit offline exception, not today's publication. Effects keep exact ID/version guard; a newer publication invalidates an older version's prospective claim rather than inventing attribution. Actor attribution uses existing authorized admin identity; no unverified MCP token origin is invented where current signature lacks it.

## Query integration and inventory

For an actually published indexable article with explicit primarySeoQuery, normalize through existing normalization. Under the same advisory key as manual candidate creation, insert only missing query as candidate/trackedfalse, target current public path, Wordstatnull/unclassified, priority0/kindother/manualorigin. Do not overwrite/retarget/activate/archive existing normalized query even if assigned elsewhere; current page remains a visible coverage gap pending owner review. Do not turn payload wordstatFrequencyStatus into independently verified official data. Other page kinds with no explicit query remain in registry and display gaps; agent can propose candidates from facts under existing instructions.

Sitemaps/public list invalidate through existing cache flow after transaction commits. Daily audit's full paginated registry automatically picks new/updated published pages; no Google/Yandex submission is needed or performed by this release. Human must approve indexability and candidate activation; that boundary is explicit, not a supposedly complete unpaid exact-rank loop.

## Verification and release

Pure validation/source identity tests; real DB concurrent source duplicate, own update/restore immutability, API safe-code tests; atomic initial/update/restore/withdrawal/slug/no-op/draft-only journal tests across both repositories; injected journal failure rolls back entire content/revision/relations state; stale publish one-winner tests; candidate dedup preserves existing target/status/frequency and no automatic activation; public registry/sitemap cache shows new approved page and excludes draft. Full schema/backup/typecheck/build/dbcheck/npm suite; one fresh whole-branch reviewer, Important RED→GREEN single pass; protected immutable deploy/backup/markedlead and independent exact-image/content/core/GEO-graph verification. No production content writes or new provider/AI/indexing/rank sends required for acceptance.
