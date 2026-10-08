# Recommendation reconciliation — stage 3

## Intent

Keep the owner's decision queue truthful after monitoring, implementation and index changes. Updating a recommendation must preserve its previous wording, evidence and status. A resolved coverage gap must not remain a new task; a partly completed or still unconfirmed problem must not be marked implemented. No public page, active keyword, budget or provider submission changes.

## Architecture and alternatives

Add append-only recommendation audit events alongside the existing current recommendation row. Replacing rows without history loses evidence; creating a new card for each audit floods the queue. Use one stable existing recommendation ID, a transactional update guarded by expectedUpdatedAt, and before/after JSON snapshots with reason, time and authenticated actor (admin or MCP). The operational bounded reconciliation CLI identifies itself explicitly, not as a human. Existing create/deduplicated-refresh and status transitions also append history in the same transaction. Original cards are not deleted or rewritten in place without an event.

Expose a validated revise operation under existing seo:write (plus seo:read), and paginated history under seo:read. Revision accepts full title/rationale/evidence/confidence, optional requested status, required expectedUpdatedAt and reason. It cannot change issue identity/page/query/fingerprint. Existing status-transition rules remain; current status may be retained. For a new card whose issue is now resolved externally, use dismissed with an explicit resolved reason, not a fictitious implementation attributed to the card. Replaying identical current content is a no-op; stale concurrency fails closed. A batch is all-or-nothing and bounded to 100 revisions / 1MiB stdin. No hidden provider or publishing calls.

The admin Changes screen exposes the current updatedAt, revision reason and a paginated before/after history link. Reads do not reconcile or write. New automation evidence should revise a matching current logical issue after reading it, rather than create a duplicate; this stage does not guess a new global deduplication identity for old heterogeneous evidence. Update the existing heartbeat to read saved effect checkpoints, current page/keys and recommendation history: a new eligible issue produces an evidence-backed proposed action with source, cohort, windows, counts, uncertainty, minimum expected effect and human approval boundary. Deferred/immature/low-sample states do not justify text or metadata changes. No automatic approval, implementation or second monitor.

## Initial reconciliation and safety

Build a reviewed proposal from the saved Oct8 audit, approved core and actual deployed change/evaluation records. Close only provably resolved cards (49 candidates activated with owner approval, full 78-page keyword coverage, web-services confirmed in Yandex). Refresh aggregate canonical/Yandex counts and exact pending URL membership. Keep canonical conflicts and unknown index states open; keep price-intent requirements partly completed where evidence does not establish the whole recommendation. Update implemented noindex/interlinking cards with actual completion evidence without claiming ranking effect. Keep the source snapshot date and limitations explicit. Verify updated rows plus preserved history and replay on production after immutable release.

Full PostgreSQL rollback/concurrency/history/idempotence tests, authenticated UI/MCP authorization tests, complete suite, one independent review, merge/deploy/verification are release gates. Old recommendation evidence is untrusted data and never operating instructions.
