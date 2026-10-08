# Unified published-page SEO control

## Intent and execution

The owner authorized sequential implementation, merge, production deployment and verification without intermediate approval stops on 2026-10-08. This is the first independently deployable stage of the full SEO/GEO loop. Subsequent stages are effect evaluation, recommendation reconciliation, GEO visibility and Telegram lifecycle verification.

## Design

Use the existing PostgreSQL/Drizzle, authenticated SEO admin and collector build. Store immutable, idempotent indexing observations per public URL, source and checkedAt in a new append-only table. Import the existing secret-free audit report through a bounded CLI, not an unauthenticated HTTP endpoint. Store only explicitly selected public evidence. Reject malformed dates, external origins, inconsistent paths, duplicates with changed payload and mismatched published identity/version. Never turn a source failure into a negative indexing observation. Display the latest attempt separately from the last successful source result.

The full published article/case/service registry comes from current content_entries, not metrics or a fixed audit count. Canonical public paths use the same presentation function as the public site. Drafts are excluded and intentionally nonindexable entries are labelled. New/updated published pages remain visible as unchecked/stale. Page cards join active assigned keywords, dated Yandex control checks (including absent and not_found), free impression-based averages, recommendations and changes with links to their existing screens. Date/source/device/region filters must not silently change semantics or get lost on pagination. Google city filters remain unavailable.

The importer is a normal operational write of monitoring evidence only: no content, publication, robots, sitemap, core activation, paid API, budget or recrawl mutations. Local historical audit files are imported once after deploy and subsequent heartbeat audits use the same entrypoint. The database is the durable admin source, while the local file remains recovery evidence.

## Alternatives

Reading a Mac-local file in the web container is not portable. Re-running all official API reads inside each admin request would couple UI latency to provider quotas. Append-only normalized snapshots reuse the already approved daily audit and preserve provenance without either problem.

## Verification and release

Tests must demonstrate a page with no metrics/keywords is still present; a failed source preserves successful evidence; changed versions are stale; invalid/external input is rejected; reimport is idempotent and changed identical keys conflict; pagination retains filters. Run PostgreSQL integration tests, full suite, typecheck and production build. Review before merge. Use existing immutable CI image and protected deployment; compare deployed revision/health and read actual persisted page evidence. Do not publish content as part of this stage.
