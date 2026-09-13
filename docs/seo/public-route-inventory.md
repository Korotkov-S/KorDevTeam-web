# Public canonical route inventory

`/sitemap.xml` is the authoritative sitemap index and returns XML directly with
HTTP 200 and `Cache-Control: no-cache`. It lists exactly `/sitemap-pages.xml`
and `/sitemap-blog.xml`. Robots, the crawler and release smoke checks use this
entry point. `/sitemap-index.xml` remains a direct-200 compatibility alias with
the same XML; it is not a page sitemap entry and introduces no redirect chain.

## Code-owned pages

All 12 routes below return meaningful public HTML, remain `index, follow`, and
belong to the pages sitemap. No page copy or indexability was changed merely
to add an existing route to the sitemap.

| Canonical path | Content purpose | Checked-in lastmod (UTC) | Content commit |
| --- | --- | --- | --- |
| `/` | Team, services, project and article summaries | `2026-09-12T04:08:04.000Z` | `089c33c` |
| `/blog/` | Article catalog | `2026-09-12T04:08:04.000Z` | `089c33c` |
| `/services/` | Service catalog and contact CTA | `2026-09-12T04:31:38.000Z` | `d60b7d1` |
| `/cases/` | Published project catalog | `2026-09-12T04:31:38.000Z` | `d60b7d1` |
| `/journal/` | Journal archive | `2026-09-11T19:08:36.000Z` | `91b3fd3` |
| `/journal/issue-0/` | Issue description, contents and PDF access | `2026-09-11T19:08:36.000Z` | `91b3fd3` |
| `/video/` | Team presentation recording and introductory copy | `2026-09-11T19:08:36.000Z` | `91b3fd3` |
| `/under-metup/video-1/` | First meetup recording, program and speakers | `2026-09-11T19:08:36.000Z` | `91b3fd3` |
| `/under-metup/video-2/` | Second meetup recording, program and speakers | `2026-09-11T19:08:36.000Z` | `91b3fd3` |
| `/under-metup/video-3/` | Third meetup recording and program | `2026-09-11T19:08:36.000Z` | `91b3fd3` |
| `/requisites/` | Confirmed public operator details | `2026-09-12T04:31:38.000Z` | `d60b7d1` |
| `/privacy/` | Data-processing policy draft for owner/legal review | `2026-09-12T04:31:38.000Z` | `d60b7d1` |

The recordings are editorial destinations with distinct titles and substantive
programs, rather than player-only utilities. The journal issue has its own
description and contents. They remain indexable and are now discoverable from
the sitemap. No thin `/under-metup/` landing is invented: no such static page
exists. With no published generic page at that slug, it returns 404 with
`noindex, follow`; unknown meetup detail slugs do likewise.

## ContentService routes and exclusions

| Route | Sitemap rule |
| --- | --- |
| `/blog/:slug/` | Published + indexable articles, blog sitemap only |
| `/cases/:slug/` | Published + indexable cases, pages sitemap only |
| `/services/:slug/` | Published + indexable services, pages sitemap only |
| `/:slug/` | Published + indexable generic pages, pages sitemap only, except paths owned by fixed routes |
| `/project/:slug/` | Legacy redirect to canonical case; excluded |
| `/blog/?page=…` | Query variants canonicalize metadata to `/blog/`; no duplicate sitemap locations |
| Draft/missing/failed documents | Missing drafts return 404; errors carry `noindex`; excluded |
| Published `indexable=false` records | May be publicly readable with `noindex`; excluded |
| FAQ records, admin/API/assets, XML/text crawl resources | Not canonical public page destinations; excluded |

No unpublished priority service record is created. Dynamic records use exact
ContentService `updatedAt` values; sitemap queries do not read repositories or
raw SQL. Each child sitemap supports at most 50,000 unique URLs. Overflow fails
closed via the existing safe 503 resource response instead of silently dropping
records or emitting an invalid oversized sitemap.

## Timestamp evidence and maintenance

The committed dates reflect actual page source history, not the earlier design
specification or the date of this sitemap fix:

- `git log -1 --format='%H %cI' -- src/components/Blog.tsx` identifies
  `089c33c9f6e17da3106d31fec6f17a248a21f3bd`, `2026-09-12T07:08:04+03:00`:
  visible article dates changed on both home and blog catalog pages.
- `git log -1 --format='%H %cI' -- src/routes/static-page.tsx` identifies
  `91b3fd3e00a90e472a7b813dc41c96ef596ddcef`, `2026-09-11T22:08:36+03:00`:
  the journal/video/meetup SSR route content and metadata were introduced.
  The journal issue source `src/data/journalIssues.ts` predates this change
  (`1385573`, `2026-08-21T11:47:15+03:00`).
- `git log -1 --format='%H %cI' -- src/routes/catalog.tsx` and the equivalent
  command for `src/routes/legal.tsx` identify
  `d60b7d19c5fa2cccf315090e29d46d7e15056442`, `2026-09-12T07:31:38+03:00`:
  those four pages were first authored in that commit.

Update the affected checked-in date when that page's rendered content changes.
Do not use runtime clocks, deployment/build timestamps or file mtimes. Keep the
exact inventory/date test synchronized with reviewed content changes and the
route manifest; existing-content sitemap additions do not reset lastmod.
