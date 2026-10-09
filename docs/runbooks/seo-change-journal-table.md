# SEO change journal: table and dedicated event details

## Reading the journal

`/admin/seo/changes/` shows one actual recorded change per row, with separate saved 7/14/28-day checkpoints. Source selection is Yandex Webmaster or Google Search Console; these are average positions from actual impressions, not paid exact rank checks. Observation does not establish causality.

Search matches description or URL literally. Type, saved-measurement state, page and event-date filters execute before pagination. Event dates use the Moscow calendar. State filtering means **any latest checkpoint of the selected source** has that state, not necessarily the row's summary state. The summary prefers the most mature checkpoint that is not waiting for the calendar period. Unmeasured, incomplete and operational records are not negative position results.

Click the row or its page/summary link for `/admin/seo/changes/:id/`. The return link preserves the origin journal filters, source, cursor and row anchor, including when the detail source changes. Unknown IDs have a safe not-found view. Legacy `effectChangeId` history links remain supported independently of the table's latest measurements.

Proposals are a separate tab, not completed changes. The manual record form is collapsed and records already-performed work; it neither publishes a page nor confirms an unknown historical version.

## Evidence in details

- Saved event, application time, author identifier and confirmed content version when known.
- Selected-source average measurements and frozen query identifiers, with first baseline, source-calendar windows, sampling and index/refresh gates.
- Separately dated paid Yandex snapshots for the page's **current** assigned keys and regions/devices. Missing is not outside the checked top-100. These cells are not a comparison of complete compatible weekly snapshots and do not calculate a change-effect delta. There is no paid exact Google control.
- Current publication/indexing card and append-only evaluation history, including raw saved evidence.

The journal does not store a complete before/after text diff. Unknown old versions are not reconstructed from today's publication. Archived query names absent from the current rank model remain identified by their saved historical IDs.

## Read-only boundary and scale

Opening either page reads saved database records only. It does not collect provider data, evaluate effects, submit indexing requests, change content/core, or alter budget/schedules. Existing explicit recommendation/form actions retain their authorization and CSRF boundaries.

The table reads 25 changes and at most 75 selected-source checkpoint records using a bounded 100-record batch, rather than a global truncated effects page. Detail history has an independent cursor. Detail paid controls currently reuse the existing whole-site `getRankControl` read model and filter the page in the view; replacing this with a page-scoped internal read is a non-blocking future optimization, not a constant-IO claim.

Desktop and mobile component screenshots use explicitly labeled synthetic fixtures; they are not evidence of production search positions or an authenticated production browser review.

## Acceptance, 9 October 2026

Local complete `npm test` with the disposable PostgreSQL database and CI fixture configuration passed: application 1195/1195, server JavaScript 224 passed / 2 existing skips / 0 failed. Typecheck, build and diff checks passed. Four fixture screenshots (journal/details, 1440/390 px) were inspected; the table scrolls internally on mobile without body overflow. Independent review rechecked the four corrected findings and passed 31 non-DB tests.

An earlier invalid full run raced the build's removal of `build/server/index.js`, failing `admin browser flow previews, publishes, unpublishes, restores and deletes without rebuild` and `admin security boundary enforces headers, csrf, expiry and safe returns` with `ERR_MODULE_NOT_FOUND`. The authoritative complete run was repeated after the build, with zero failures; the failed log is retained as diagnostic evidence.

Secret-free local artifacts and final deployment evidence are retained separately under `/Users/alex/.codex/automations/seo/release-artifacts/2026-10-09-change-journal/`. This acceptance section does not by itself confirm production deployment.
