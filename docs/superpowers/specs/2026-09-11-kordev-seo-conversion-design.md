# KorDevTeam SEO and Conversion Redesign — Design Specification

**Date:** 2026-09-11

**Status:** approved for implementation planning

**Source brief:** `/Users/alex/Desktop/TZ_KORDEV_TEAM_SEO_AND_CONVERSION_2026-09-11.md`

## 1. Outcome

Rebuild `kordev.team` into a Russian-language commercial site whose primary conversion is a qualified lead, while preserving the current React/Vite component base, light/dark themes, and visual character. All indexable routes render useful HTML on the server, content publishes without rebuilding the application, and production releases switch atomically without interrupting visitors.

The three highest-priority offers are:

1. business-process integration and automation;
2. custom web/CRM development;
3. mobile application development.

The audience includes small, medium, and enterprise businesses in Russia.

## 2. Confirmed product decisions

- Keep the existing React component library and current visual direction; evolve it into a clearer commercial hierarchy.
- Preserve light and dark themes.
- Preserve visible animation for ordinary visitors, optimize its implementation, and disable movement for `prefers-reduced-motion`.
- Remove the English version completely: no language switch, English routes, English content files, English database rows, `hreflang`, or archived copy in the application repository.
- Use React Router Framework Mode on the existing React/Vite stack for SSR route modules, loaders, actions, and route metadata.
- Keep React 18, Vite 6, Node 22, and React Router 7 during the migration; do not combine the SSR migration with React Router 8/React 19/Vite 7 upgrades.
- Replace SQL.js/SQLite with PostgreSQL and Drizzle ORM migrations.
- Keep one administrator authenticated by login and password at `/admin/`.
- The administrator edits articles, cases, services, FAQ, shared pages, SEO fields, redirects, and media.
- Keep revision history for content, but deletion is hard deletion: deleting an entry also deletes its revisions and relations.
- Publishing takes effect immediately without a site rebuild.
- Store public media and lead attachments in Timeweb S3-compatible object storage. Public media may use the provider CDN; lead attachments stay private.
- No Sentry or other external monitoring in the first release. Use structured application logs with 30-day rotation.
- No staging subdomain. Validate the inactive blue/green slot through localhost/SSH health and smoke checks before the manual production switch.
- Build automatically after a push to `main`; switch production manually after checks.
- Keep at least three application releases and all referenced hashed assets for at least 30 days.
- Back up PostgreSQL daily, keep backups for 30 days, and create a snapshot before every production switch.
- DNS and certificates remain in Timeweb. Traefik performs canonical host redirects and the blue/green switch.

## 3. Target architecture

### 3.1 Request path

```text
Browser
  -> Timeweb DNS/TLS
  -> Traefik
     -> active KorDevTeam blue or green container
        -> Express runtime
           -> immutable static assets
           -> React Router SSR request handler
              -> PostgreSQL repositories
              -> Timeweb S3 media URLs
```

The same Node process serves SSR and server actions. There is no separate SPA fallback for indexable pages. Existing Express API behavior is migrated behind route actions or mounted before the React Router request handler until retired.

### 3.2 Rendering and freshness

- Public route loaders read published content from PostgreSQL.
- SSR produces the final `title`, description, canonical, robots directive, H1, JSON-LD, navigation, and body content before sending HTML.
- Hydration uses the same loader payload; it must not replace server SEO text with alternate client text.
- Public content may use a small in-process cache keyed by content kind/slug and publication version.
- Every publish, unpublish, update, or delete operation invalidates affected cache keys and sitemap state synchronously.
- HTML responses use `Cache-Control: no-cache`.
- Hashed JS/CSS assets use `Cache-Control: public, max-age=31536000, immutable`.
- Public media uses content-addressed object keys and long immutable caching.

### 3.3 Application boundaries

The code is organized into focused server modules:

- `src/server/db/`: PostgreSQL connection and Drizzle schema.
- `src/server/content/`: content repositories, publication rules, revisions, relationships, cache, and legacy import.
- `src/server/auth/`: administrator password verification and secure cookie sessions.
- `src/server/media/`: S3 object storage, image variants, and private attachment access.
- `src/server/leads/`: validation, persistence, delivery outbox, email adapter, and CRM adapter contract.
- `src/server/seo/`: canonical URLs, metadata, JSON-LD, robots, and sitemap generation.
- `src/server/analytics/`: consent-neutral server event rules only; browser vendor calls remain in `src/analytics/`.

Route modules assemble these services but do not contain SQL, S3 calls, SMTP calls, or vendor-specific CRM payload construction.

## 4. PostgreSQL content model

### 4.1 Core tables

`admin_users`

- UUID primary key;
- unique login;
- scrypt password digest and salt;
- active flag;
- created/updated timestamps.

`content_entries`

- UUID primary key;
- `kind`: `service`, `case`, `article`, `page`, or `faq`;
- unique canonical slug within kind;
- `status`: `draft` or `published`;
- title, excerpt, Markdown body;
- SEO title and description;
- optional manual canonical path, allowed only for migrations;
- robots/indexable flag;
- Open Graph media reference;
- structured `payload` JSONB for kind-specific fields;
- published and updated timestamps;
- monotonically increasing version.

`content_relations`

- source entry, target entry, relation type, and sort order;
- supports service-to-case, service-to-article, service-to-FAQ, and case-to-service links;
- foreign keys cascade on hard deletion.

`content_revisions`

- entry ID, version, full JSON snapshot, administrator ID, and creation time;
- cascades on hard deletion of the entry.

`media_assets`

- UUID, object key, public/private visibility, MIME type, byte size, checksum, dimensions, variants JSONB, alt text, creator, and timestamps.

`redirects`

- unique source path, destination path, HTTP status restricted to 301/410, enabled flag, and timestamps.

`site_settings`

- key/value JSONB records for organization data, contacts, business hours, social profiles, and form copy.

### 4.2 Service payload

Every service record supports the brief’s fields: `h1`, `lead`, `problems`, `solutions`, `integrations`, `technologies`, `processSteps`, `priceFrom`, `priceFactors`, `timeRange`, CTA copy/type, and structured result/guarantee blocks. Related cases, FAQ, and articles are stored in `content_relations`, not duplicated in JSON.

Unconfirmed prices, timelines, or performance claims remain in draft content and never appear in published loader results.

### 4.3 Migration

A repeatable migration command imports Russian posts/projects from SQLite and repository Markdown/JSON, normalizes slugs, records checksums, and produces a machine-readable report. It supports `--dry-run` and refuses to overwrite populated PostgreSQL tables unless an explicit resume/import batch is supplied.

English Markdown, locale files, generated English JSON, English database rows, and the language toggle are deleted. No archive is retained in the repository, per the owner’s explicit decision.

## 5. Public information architecture

Canonical HTML URLs use HTTPS, no `www`, and a trailing slash:

- `/`
- `/services/`
- `/services/business-process-automation/`
- `/services/crm-development/`
- `/services/web-services/`
- `/services/mobile-app-development/`
- `/services/integrations/`
- `/services/ai-automation/`
- `/cases/`
- `/cases/:slug/`
- `/blog/`
- `/blog/:slug/`
- `/journal/`
- `/journal/issue-0/`
- `/video/`
- `/requisites/`
- `/privacy/`
- `/admin/` and protected nested admin routes.

Legacy `/project/:id/` URLs receive individual 301 mappings to `/cases/:slug/` when a matching case exists. Content rejected during the audit receives either a precise redirect, `noindex`, or 410 according to the approved audit sheet. Query strings never alter canonical paths; approved UTM parameters survive the host/path redirect.

## 6. Commercial page composition

### 6.1 Home

The home route contains a result-led hero, linked service cards, Krasotula product proof, three evidence-backed cases, process, price/time orientation, guarantees and support, team/experience, permitted client proof, FAQ, lead form, and corporate contacts. It uses the approved H1 and server metadata from the brief.

### 6.2 Service template

All six service routes use one accessible component with unique content. The server renders breadcrumbs, H1, result summary, CTA, price explanation, problems, deliverables, integrations/technologies, process, two to four related cases, verified results, guarantees, FAQ, lead form, and related articles.

### 6.3 Cases and articles

Cases use a common narrative structure: problem, constraints, solution, architecture/integrations, delivery stages, team, permitted screenshots, verified results, testimonial, related service, and CTA. Articles remain Markdown-based in the editor but are stored in PostgreSQL and linked contextually to services and cases.

## 7. Administrator experience and security

- `/admin/` and all admin data actions return `X-Robots-Tag: noindex, nofollow`.
- Authentication uses a secure, HTTP-only, same-site cookie session and scrypt password hashes.
- Only one active administrator is expected, but the table shape does not make the login a hard-coded singleton.
- Login and write actions are rate-limited and CSRF-protected.
- The editor supports draft, preview, publish, unpublish, revision restore, and hard delete with an explicit confirmation.
- There is no separate administrator audit log. Content revisions record who made content changes.
- Media uploads validate magic bytes, MIME type, size, dimensions, and ownership before generating responsive variants.

## 8. Lead form and delivery

### 8.1 Fields

Required:

- name;
- at least one contact: phone or email;
- personal-data consent.

Optional:

- task description;
- company;
- requested service;
- budget;
- one or more attachments.

Hidden server-normalized context includes page URL, service slug, referrer, and approved UTM fields.

### 8.2 Validation and files

- Validate on client and server; server rules are authoritative.
- Accept PDF, DOCX, XLSX, JPG, and PNG, maximum 10 MiB per file.
- Validate both extension and content signature.
- Scan with a ClamAV sidecar before an attachment becomes deliverable.
- Use a honeypot and IP/contact rate limits; no CAPTCHA in the first release.
- Private attachment objects receive unpredictable keys and are never served from a public bucket/CDN.

### 8.3 Durable delivery

The form action writes the lead, attachment metadata, and two outbox jobs in one PostgreSQL transaction. The response reports success only after durable persistence, not after optimistic client submission.

Jobs deliver to:

1. `team@korotkov.dev` through configured SMTP;
2. Krasotula CRM through a `CrmLeadAdapter` interface.

The Krasotula team will provide the final API contract. Until then, the adapter returns a configured `not_ready` result and the email delivery remains operational. The worker retries transient errors with bounded exponential backoff and makes vendor calls idempotent. Lead and private attachment copies owned by the site are deleted after 30 days; CRM and email retain their delivered copies under their own controls.

## 9. Consent and analytics

- The consent banner is opt-in for analytics.
- Yandex.Metrika `105288175` and Top.Mail.Ru `3793508` are not downloaded or executed before analytics consent.
- Consent is versioned and stored locally; rejecting analytics leaves the site fully usable.
- Top.Mail.Ru receives page views only. Conversion events go to Yandex.Metrika only.
- Events are emitted from user actions, never component render: `form_open`, `form_start`, `form_submit_success`, `form_submit_error`, `service_cta_click`, `telegram_click`, `email_click`, `phone_click`, `project_open`, and `journal_issue_open`.
- `form_submit_success` fires exactly once per persisted lead response.

## 10. Legal and organization data

The public requisites page contains only:

- Individual Entrepreneur Alexander Evgenyevich Korotkov (Индивидуальный предприниматель Коротков Александр Евгеньевич);
- INN `519098647630`;
- OGRNIP `324330000002550`;
- `team@korotkov.dev`.

The private residential address and bank accounts found in the supplied contract are not published. Business hours are Monday–Friday, 09:00–18:00 Moscow time, and the form promises a reply within one business day.

The privacy policy is an implementation draft for owner/legal review before production. It describes the actual form fields, analytics vendors, CRM/email recipients, object storage, 30-day site retention, and contact for data-subject requests. No invented phone, office address, `team@kordev.team` mailbox, award, price, percentage, review, or case metric may be published.

## 11. SEO platform behavior

- A single metadata builder produces route metadata, Open Graph, Twitter cards, canonical URLs, and robots directives.
- JSON-LD supports Organization, WebSite, ProfessionalService, Service, BreadcrumbList, BlogPosting/Article, FAQPage, and CreativeWork as appropriate.
- Organization schema contains only confirmed public facts.
- `/sitemap.xml` is an index for `/sitemap-pages.xml` and `/sitemap-blog.xml`.
- Sitemaps contain only published, indexable, canonical 200 routes; `lastmod` comes from each record’s real update time.
- `robots.txt` points only to the sitemap index and excludes admin routes.
- A post-deploy crawler rejects redirecting sitemap URLs, missing/duplicate metadata, incorrect canonical URLs, multiple H1 elements, invalid JSON-LD, broken internal links, soft 404s, and technical error text.

## 12. Performance and accessibility

- Render all meaningful page content on the server; JavaScript enhances it.
- Do not gate indexable home sections behind `IntersectionObserver` rendering.
- Generate AVIF/WebP variants at 480, 768, and 1200 pixels where the source permits.
- Set `srcset`, `sizes`, width, and height. Only the LCP image may be eager/high priority; below-fold images are lazy.
- Do not preload images for invisible carousel slides.
- Respect reduced motion without changing the ordinary visitor’s visual design.
- Mobile p75 targets: LCP no more than 2.5 s, INP no more than 200 ms, CLS no more than 0.1.
- Keyboard navigation, focus visibility, labels, validation announcements, and contrast are release requirements.

## 13. Deployment and operations

The repository contains sanitized `compose` and Traefik configuration. Secrets remain in GitHub Environment/Repository secrets and VPS environment files.

The CI pipeline:

1. installs pinned dependencies;
2. runs unit/integration tests, SSR/hydration assertions, the SEO crawler, and the production build;
3. creates an immutable GHCR image tagged with the commit SHA;
4. uploads the image without switching production;
5. waits for manual approval for the production environment;
6. creates a pre-release PostgreSQL backup;
7. starts the inactive color, runs migrations under an advisory lock, and performs local health/smoke checks;
8. atomically switches Traefik to the healthy color;
9. performs public smoke checks and automatically switches back on failure.

Old containers/images and asset namespaces retain at least three releases and at least 30 days. Logs rotate daily and expire after 30 days. Daily PostgreSQL backups upload encrypted archives to Timeweb S3 and a restore drill is documented.

## 14. Error handling

- Public errors render a useful, non-technical error boundary with the correct HTTP status.
- Chunk load failures trigger at most one reload per release/browser session, then show a safe recovery message.
- Logs include request ID, route, release SHA, status, duration, and sanitized error code; they never include passwords, consent payloads, attachment contents, or full contact values.
- Delivery failures stay visible in the admin lead view and do not convert a failed persistence into a false success.

## 15. Verification and release gates

Required automated coverage:

- repository tests and route-level unit tests;
- PostgreSQL repository integration tests;
- legacy migration dry-run and repeatability tests;
- SSR HTML versus hydrated DOM SEO-field comparison;
- lead validation, anti-spam, file validation, antivirus, transaction, idempotency, retry, and retention tests;
- admin authorization and CSRF tests;
- sitemap/internal-link crawler;
- responsive and reduced-motion browser tests;
- Docker health, inactive-slot, switch, rollback, backup, and restore scripts.

P0 SEO failures, migration failures, unsuccessful lead persistence, or a failing inactive-slot smoke test block the production switch.

## 16. Delivery sequence

1. **Foundation:** React Router Framework Mode SSR, PostgreSQL/Drizzle, canonical routing, Russian-only cleanup, metadata/sitemap platform, and legacy import.
2. **Commercial content:** public service/case templates, home restructuring, content relationships, admin editor, revision history, and Timeweb S3 media.
3. **Conversion:** durable lead form, attachments/ClamAV, email delivery, CRM adapter boundary, consent manager, and Yandex events.
4. **Production:** blue/green Traefik release workflow, backups, retention, SEO crawler, performance/accessibility checks, content audit, and monitored launch.

The Krasotula CRM vendor contract is the only deferred external input. It does not block foundation, content, email lead delivery, or the adapter’s contract tests.
