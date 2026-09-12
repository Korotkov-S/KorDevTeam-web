/**
 * Content dates, not release dates. Update the affected entry when its source
 * content changes, using that content change's git commit timestamp (ISO UTC).
 * Never derive these values from build time, file mtime or the running clock.
 * Existing views: 91b3fd3e00a90e472a7b813dc41c96ef596ddcef,
 * 2026-09-11T22:08:36+03:00 (src/routes/home.tsx and src/pages views).
 * Catalog/legal copy: approved design spec a89f844cd002136ca8fa833b45fbffa148b6279f,
 * 2026-09-11T12:43:14+03:00 (docs/superpowers/specs/2026-09-11-kordev-seo-conversion-design.md).
 */
export const staticContentDates: Readonly<Record<string, string>> = {
  "/": "2026-09-11T19:08:36.000Z",
  "/services/": "2026-09-11T09:43:14.000Z",
  "/cases/": "2026-09-11T09:43:14.000Z",
  "/journal/": "2026-09-11T19:08:36.000Z",
  "/video/": "2026-09-11T19:08:36.000Z",
  "/requisites/": "2026-09-11T09:43:14.000Z",
  "/privacy/": "2026-09-11T09:43:14.000Z",
};
