# SEO Sections and Yandex Metrica Design

## Goal

Turn the single overloaded SEO admin screen into six focused working pages and add official Yandex Metrica organic-traffic data to the SEO database. There is no printable or PDF report.

## Navigation

The SEO area keeps `/admin/seo/` as its entry point and adds a persistent secondary navigation:

1. **Сводка** — `/admin/seo/`
2. **Позиции** — `/admin/seo/positions/`
3. **Трафик и запросы** — `/admin/seo/traffic/`
4. **Страницы** — `/admin/seo/pages/`
5. **Семантика** — `/admin/seo/semantics/`
6. **Изменения** — `/admin/seo/changes/`

Each page loads only the data it needs. Dates are displayed as `dd.mm.yyyy`. Source freshness is always explicit.

## Page responsibilities

### Сводка

- Data-source health and freshness for Yandex Webmaster, Google Search Console, Yandex Metrica, and Yandex Search rank checks.
- Tracked keyword count and cumulative Top-3, Top-10, Top-30, outside Top-100, and no-data counts.
- Daily and seven-day improved/declined counts.
- Search clicks, impressions, CTR, and average position for the chosen source and period.
- Organic users, visits, bounce rate, page depth, and average visit duration from Yandex Metrica.
- New recommendations requiring a decision.

### Позиции

- Exact Yandex Search positions, kept distinct from average positions reported by Webmaster/Search Console.
- Keyword × city × desktop/mobile matrix.
- One-day and seven-day movement.
- Detailed checks with found URL and date.

### Трафик и запросы

- Search demand: impressions, clicks, CTR, and average position from Yandex Webmaster or Google Search Console.
- Organic behavior: users, new users, visits, pageviews, bounce rate, page depth, and duration from Yandex Metrica.
- Explicit device and city tables with units.
- Actual search queries that already received impressions or clicks.

### Страницы

- Landing-page aggregate from Webmaster/Search Console: impressions, clicks, CTR, average position, and number of observed queries.
- Organic landing-page behavior from Metrica: users, visits, bounce rate, depth, and duration.
- Assigned semantic keywords count and target-page mismatch evidence where available.

### Семантика

- Active semantic core and candidates.
- Separate columns for query, target page, Wordstat/month, frequency band, intent, priority, status, and action.
- Inline help for ambiguous fields.

### Изменения

- SEO change journal.
- Evidence-backed AI recommendations and their status workflow.
- No automatic content publication or metadata change.

## Yandex Metrica ingestion

### Configuration

- `SEO_YANDEX_METRIKA_ENABLED`
- `YANDEX_METRIKA_OAUTH_TOKEN`
- `YANDEX_METRIKA_COUNTER_ID`

Secrets remain server-side and never appear in admin responses, logs, MCP payloads, or error text.

### API

Use the official Reporting API `GET https://api-metrika.yandex.net/stat/v1/data` with OAuth authorization, `lang=ru`, daily dimension `ym:s:date`, last-click attribution, and the filter:

`ym:s:trafficSource=='organic' AND ym:s:isRobot=='No'`

Collect these metrics:

- `ym:s:visits`
- `ym:s:users`
- `ym:s:pageviews`
- `ym:s:bounceRate`
- `ym:s:pageDepth`
- `ym:s:avgVisitDurationSeconds`

Collect new users with a second matched report adding `ym:s:isNewUser=='Yes'`; merge by date and dimension. Do not infer missing new-user values.

Collect four slices:

- `overall`: date only, key `all`;
- `device`: date + `ym:s:deviceCategory`;
- `region`: date + `ym:s:regionCity` for the configured major-city set;
- `page`: date + `ym:s:startURLPath` for organic landing pages.

The collector refreshes the most recent 14 complete days ending yesterday. Metrica percentages are normalized to ratios in the database. Empty rows mean no data, never zero position or an error.

### Storage

Add `yandex_metrika` to `seo_source` and create `seo_traffic_metrics` with:

- observation date;
- source;
- slice type;
- dimension key and label;
- optional page path;
- users and new users;
- visits and pageviews;
- bounce-rate ratio;
- page depth;
- average visit-duration seconds;
- import timestamp.

The unique key is `(observation_date, source, slice, dimension_key)`. Upserts make daily collection idempotent.

## Failure handling

- 401/403: safe non-retryable authentication error.
- 429/5xx: bounded retry.
- Invalid or sampled/truncated response: fail closed with a safe code; do not silently store partial analytics.
- One source failing does not erase data from other sources.
- The UI shows stale/unavailable state instead of manufacturing zeros.

## Out of scope

- PDF or print report.
- Public/client report links.
- GA4.
- Live SERP scraping.
- Automatic content or metadata changes.
- Metrica goals and CRM conversion attribution in this change; the schema can be extended after the corresponding goal IDs are approved.

