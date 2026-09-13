/**
 * Content dates, not release dates. Update the affected entry when its source
 * content changes, using that content change's git commit timestamp (ISO UTC).
 * Never derive these values from build time, file mtime or the running clock.
 * Route inventory and git evidence: docs/seo/public-route-inventory.md.
 * Home/blog visible article dates last changed in src/components/Blog.tsx:
 * 089c33c9f6e17da3106d31fec6f17a248a21f3bd (2026-09-12T07:08:04+03:00).
 * Journal/video/meetup SSR content/metadata: src/routes/static-page.tsx,
 * 91b3fd3e00a90e472a7b813dc41c96ef596ddcef (2026-09-11T22:08:36+03:00).
 * Catalog/legal pages first authored in src/routes/catalog.tsx and legal.tsx:
 * d60b7d19c5fa2cccf315090e29d46d7e15056442 (2026-09-12T07:31:38+03:00).
 * Adding existing pages to the sitemap does not change their content dates.
 */
export const staticContentDates: Readonly<Record<string, string>> = {
  "/": "2026-09-12T04:08:04.000Z",
  "/blog/": "2026-09-12T04:08:04.000Z",
  "/services/": "2026-09-12T04:31:38.000Z",
  "/cases/": "2026-09-12T04:31:38.000Z",
  "/journal/": "2026-09-11T19:08:36.000Z",
  "/journal/issue-0/": "2026-09-11T19:08:36.000Z",
  "/video/": "2026-09-11T19:08:36.000Z",
  "/under-metup/video-1/": "2026-09-11T19:08:36.000Z",
  "/under-metup/video-2/": "2026-09-11T19:08:36.000Z",
  "/under-metup/video-3/": "2026-09-11T19:08:36.000Z",
  "/requisites/": "2026-09-12T04:31:38.000Z",
  "/privacy/": "2026-09-12T04:31:38.000Z",
};
