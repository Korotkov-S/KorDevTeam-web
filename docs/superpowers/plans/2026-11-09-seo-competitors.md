# SEO Competitors Implementation Plan

> For agentic workers: use the executing-plans workflow to implement and verify each stage.

**Goal:** Reproduce the competitor workflow inside KorDevTeam's SEO admin using its existing search collection and public pages.

**Architecture:** Capture a bounded top 10 in the existing rank transaction. Add an admin-only report that selects a search snapshot, compares the target with selected URLs, and saves source-backed findings. Seed the initial history with the verified 7 November 2026 Moscow desktop capture for 38 keywords mapped to seven services. Preserve the two original CRM snapshot IDs.

**Tech Stack:** React Router, PostgreSQL and Drizzle, Cheerio, Node HTTPS.

**Spec:** The agreed SHTool workflow consists of a list of pages, an intent breakdown, a matrix, and separate recommendations. Use a B2B service catalog. Exclude online-store checks. Make the evidence status explicit. Use independent observations and recommendations for KorDevTeam.

## Global constraints

- Reuse existing Yandex operations without creating a new search plan or paid call.
- Keep original rank semantics and make legacy checks without a top list explicit.
- Treat redirects, remote HTML, and URLs as untrusted. Read public HTTPS pages with a deadline, byte cap, and pinned public DNS. No credentials or scripts from remote pages.
- Separate SERP timestamp and page observation time. Keep unavailable and unverified evidence distinct from not applicable.
- Keep SEO recommendations in the existing workflow as new proposals. Restrict access to the existing admin session and CSRF checks.

## Tasks

- [x] Capture rank response top 10, retain frozen query and target and validate rank behavior with existing provider tests. Generate additive schema migration.
- [x] Define the comparison catalog, check extracted evidence and partial results with fixtures, and persist immutable reports.
- [x] Add the admin route, snapshot filters, comparison, recommendation action, and export. Verify authentication, rendering and archive selection.
- [x] Run the build, typecheck, migration checks and targeted tests. Inspect a CRM report using saved November evidence.

## MCP workflow for the AI client

- [x] Exercise a read/write MCP client against the competitor service. Restrict reads to `seo:read` and writes to both SEO scopes.
- [x] Page through saved snapshots and reports. Compare selected ranks from one snapshot through the existing public-page reader. Use a client-generated operation UUID for safe retries.
- [x] Store the AI analysis separately from the measured matrix. Validate factor and position references against that report. Show the analysis, source cells, and limitations in the report and CSV.
- [x] Verify the MCP round trip, replay, scope checks, and PostgreSQL migrations. The client supplies the analysis. The server performs the checklist and does not call a model API.
