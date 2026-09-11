# KorDevTeam P0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crawler-fragile SPA/SQLite foundation with Russian-only React Router SSR backed by PostgreSQL, canonical routing, dynamic SEO output, and an atomic blue/green production path.

**Architecture:** React Router 7 Framework Mode compiles client and server bundles from the existing `src` tree. A small Express runtime serves immutable client assets, mounts retained API routes during migration, applies canonical redirects, and delegates document/data requests to React Router. PostgreSQL with Drizzle becomes the content source of truth; a repeatable importer migrates the existing Russian content.

**Tech Stack:** Node 22, React 18, React Router 7.9.4 Framework Mode, Vite 6.3.5, Express 5, PostgreSQL 16, Drizzle ORM/Kit, TypeScript, Node test runner through `tsx`, Docker, Traefik, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-kordev-seo-conversion-design.md`

## Global Constraints

- Keep React 18, Vite 6.3.5, Node 22, and React Router 7.9.4 during this migration.
- Public indexable pages must contain final content and metadata before hydration.
- Canonical HTML URLs are HTTPS, non-`www`, and have a trailing slash.
- The site is Russian-only; delete all English UI/content/runtime behavior.
- Publishing must not require an application rebuild.
- HTML uses `Cache-Control: no-cache`; hashed assets use one-year immutable caching.
- Preserve light/dark themes and the current visual direction.
- Preserve ordinary animations and honor `prefers-reduced-motion`.
- Production is switched manually only after inactive-slot checks pass.
- Do not add unconfirmed prices, metrics, reviews, phone numbers, or addresses.

---

## File structure locked by this plan

Create:

- `react-router.config.ts` — Framework Mode and SSR configuration.
- `vite.config.ts` — React Router/Vite/Tailwind build configuration.
- `src/routes.ts` — route manifest.
- `src/root.tsx` — document shell, providers, error boundary, and hydration-safe layout.
- `src/routes/home.tsx`, `src/routes/blog-index.tsx`, `src/routes/blog-post.tsx`, `src/routes/case.tsx`, `src/routes/static-page.tsx` — SSR route modules.
- `src/routes/sitemap-index.xml.ts`, `src/routes/sitemap-pages.xml.ts`, `src/routes/sitemap-blog.xml.ts`, `src/routes/robots.txt.ts` — dynamic crawl files.
- `src/server/http/canonical.ts`, `src/server/http/cacheHeaders.ts` — request normalization and caching.
- `src/server/seo/metadata.ts`, `src/server/seo/schema.ts`, `src/server/seo/sitemaps.ts` — single SEO source.
- `src/server/db/client.ts`, `src/server/db/schema.ts`, `src/server/db/testDatabase.ts` — PostgreSQL/Drizzle layer.
- `src/server/content/types.ts`, `src/server/content/repository.ts`, `src/server/content/cache.ts`, `src/server/content/service.ts` — content boundary.
- `scripts/migrate-content-to-postgres.ts`, `scripts/verify-content-migration.ts` — repeatable migration.
- `server/api-app.js` — retained Express API router factory during migration.
- `server/runtime.mjs` — production static/SSR runtime.
- `tests/ssr/support/runtime.ts`, `tests/ssr/support/seoSnapshot.ts`, `tests/ssr/seoParity.test.ts`, `tests/seo/crawler.test.ts`, `tests/migration/contentMigration.test.ts` — P0 tests.
- `deploy/postgres/init/001-test-database.sql` — local-only creation of the integration-test database.
- `deploy/docker-compose.team.yml`, `deploy/traefik/kordevteam-dynamic.yml` — sanitized deployment topology.
- `scripts/deploy-slot.sh`, `scripts/switch-slot.sh`, `scripts/rollback-slot.sh`, `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`, `scripts/prune-releases.sh` — VPS operations.

Modify:

- `package.json`, `yarn.lock`, `.nvmrc`, `.gitignore`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/docker-build.yml`.
- Existing reusable components under `src/components/`, `src/pages/`, and `src/contexts/` only as required for server safety and new route-module props.

Delete after equivalent SSR routes pass:

- `src/App.tsx`, `src/main.tsx`, `vite.config.mjs`.
- `src/components/LanguageToggle.tsx`, `src/locales/en.json`.
- every `src/blog/*.en.md`, `public/blog/*.en.md`, and `public/content/*.en.json` file.
- obsolete static generation scripts once no production command calls them: `scripts/generate-blog-pages.mjs` and `scripts/generate-content-index.mjs`.

Do not delete the SQLite database until the PostgreSQL import report has been reviewed and the production restore drill has passed.

---

### Task 1: Pin the Framework Mode toolchain and boot an SSR document

**Files:**

- Modify: `package.json`
- Modify: `.nvmrc`
- Create: `react-router.config.ts`
- Create: `vite.config.ts`
- Create: `src/routes.ts`
- Create: `src/root.tsx`
- Create: `src/routes/home.tsx`
- Create: `server/api-app.js`
- Create: `server/runtime.mjs`
- Create: `tests/ssr/support/runtime.ts`
- Test: `tests/ssr/frameworkBoot.test.ts`

**Interfaces:**

- Produces: `createApiApp(): express.Router` from `server/api-app.js`.
- Produces: React Router server build in `build/server/index.js` and client assets in `build/client`.
- Produces: `GET /api/health` JSON and SSR `GET /` HTML from one process.

- [ ] **Step 1: Add a failing SSR boot test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { startTestRuntime } from "./support/runtime";

test("one runtime serves health and server-rendered home", async (t) => {
  const runtime = await startTestRuntime();
  t.after(runtime.close);
  const health = await fetch(`${runtime.origin}/api/health`).then((r) => r.json());
  assert.equal(health.status, "ok");
  const response = await fetch(`${runtime.origin}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h1[^>]*>Разрабатываем CRM, веб-сервисы и автоматизируем бизнес-процессы<\/h1>/);
  assert.match(html, /<script[^>]+type="module"/);
});
```

- [ ] **Step 2: Run the test and confirm the missing runtime failure**

Run: `yarn tsx --test tests/ssr/frameworkBoot.test.ts`

Expected: FAIL because `tests/ssr/support/runtime.ts` and the Framework Mode server build do not exist.

- [ ] **Step 3: Install and pin compatible dependencies**

Update dependencies with these exact compatibility targets:

```json
{
  "dependencies": {
    "@react-router/express": "7.9.4",
    "react-router": "7.9.4",
    "react-router-dom": "7.9.4"
  },
  "devDependencies": {
    "@react-router/dev": "7.9.4",
    "tsx": "^4.20.6",
    "typescript": "^5.9.2"
  },
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "node server/runtime.mjs",
    "typecheck": "react-router typegen && tsc --noEmit",
    "test": "node --test tests/*.test.mjs server/utils/*.test.js && tsx --test tests/**/*.test.ts src/**/*.test.ts"
  }
}
```

Set `.nvmrc` to `v22.22.0`. Run `yarn install` so `yarn.lock` records the pins.

- [ ] **Step 4: Add Framework Mode configuration and route manifest**

```ts
// react-router.config.ts
import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  buildDirectory: "build",
  ssr: true,
} satisfies Config;
```

```ts
// src/routes.ts
import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("blog/", "routes/blog-index.tsx"),
  route("blog/:slug/", "routes/blog-post.tsx"),
  route("cases/:slug/", "routes/case.tsx"),
  route("video/", "routes/static-page.tsx", { id: "video" }),
  route("journal/", "routes/static-page.tsx", { id: "journal" }),
  route("journal/issue-0/", "routes/static-page.tsx", { id: "journal-issue-0" }),
] satisfies RouteConfig;
```

Use the existing Tailwind aliases in `vite.config.ts`, replacing the React plugin entry with `reactRouter()` from `@react-router/dev/vite`. Do not change CSS tokens in this task.

- [ ] **Step 5: Create the SSR-safe document and home route**

`src/root.tsx` must export `Layout`, default `App`, and `ErrorBoundary`. It links `src/styles/index.css`, sets `<html lang="ru">`, wraps the outlet with `ThemeProvider`, and renders the existing header/footer without browser globals during server render.

```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head><Meta /><Links /></head>
      <body><ThemeProvider>{children}</ThemeProvider><ScrollRestoration /><Scripts /></body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
```

`src/routes/home.tsx` initially renders the approved H1 and the existing `Hero` component without client-only deferred sections.

- [ ] **Step 6: Extract retained APIs and create the production runtime**

Move the existing API middleware/router registration and `GET /api/health` into `server/api-app.js`. Keep request parsing limits and route paths unchanged.

```js
// server/runtime.mjs
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createApiApp } = require("./api-app.js");
const app = express();
app.disable("x-powered-by");
app.use(createApiApp());
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { index: false, maxAge: 0 }));
app.use(createRequestHandler({ build: () => import("../build/server/index.js") }));
app.listen(Number(process.env.PORT || 3001));
```

Make `server/index.js` a temporary compatibility launcher that imports `./runtime.mjs`, or update every runtime command to use `server/runtime.mjs` before deleting it.

- [ ] **Step 7: Build and make the SSR test pass**

Run: `yarn typecheck && yarn build && yarn tsx --test tests/ssr/frameworkBoot.test.ts`

Expected: all commands PASS; HTML returned by `/` contains the H1 before client JavaScript runs.

- [ ] **Step 8: Commit the framework boot slice**

```bash
git add package.json yarn.lock .nvmrc react-router.config.ts vite.config.ts src/routes.ts src/root.tsx src/routes/home.tsx server/api-app.js server/runtime.mjs tests/ssr
git commit -m "feat(ssr): boot React Router framework runtime"
```

---

### Task 2: Introduce PostgreSQL and the versioned content schema

**Files:**

- Modify: `package.json`
- Create: `drizzle.config.ts`
- Create: `src/server/db/client.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/testDatabase.ts`
- Create: `drizzle/0000_content_foundation.sql`
- Create: `deploy/postgres/init/001-test-database.sql`
- Modify: `docker-compose.yml`
- Test: `src/server/db/schema.test.ts`

**Interfaces:**

- Produces: `createDb(databaseUrl: string): NodePgDatabase<typeof schema>` and `getDb(): NodePgDatabase<typeof schema>`.
- Produces: Drizzle exports `adminUsers`, `contentEntries`, `contentRelations`, `contentRevisions`, `mediaAssets`, `redirects`, and `siteSettings`.
- Produces: `resetTestDatabase(databaseUrl: string): Promise<void>`.

- [ ] **Step 1: Write a failing schema integration test**

```ts
test("content entry hard delete cascades revisions and relations", async () => {
  const db = createDb(TEST_DATABASE_URL);
  const [service] = await db.insert(contentEntries).values(serviceFixture).returning();
  const [article] = await db.insert(contentEntries).values(articleFixture).returning();
  await db.insert(contentRevisions).values({ entryId: service.id, version: 1, snapshot: service });
  await db.insert(contentRelations).values({ sourceId: service.id, targetId: article.id, type: "related_article", sortOrder: 0 });
  await db.delete(contentEntries).where(eq(contentEntries.id, service.id));
  assert.equal((await db.select().from(contentRevisions)).length, 0);
  assert.equal((await db.select().from(contentRelations)).length, 0);
});
```

- [ ] **Step 2: Run the test and confirm the missing schema failure**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/db/schema.test.ts`

Expected: FAIL because the database module does not exist.

- [ ] **Step 3: Add PostgreSQL dependencies and commands**

Add `drizzle-orm`, `pg`, and `zod` as runtime dependencies; add `drizzle-kit` and `@types/pg` as development dependencies. Add scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:check": "drizzle-kit check"
}
```

- [ ] **Step 4: Define the schema with database constraints**

Use PostgreSQL enums for `content_kind`, `content_status`, `relation_type`, and `media_visibility`. Use UUID primary keys, timezone-aware timestamps, a positive `version`, unique `(kind, slug)`, a slug check of `^[a-z0-9]+(?:-[a-z0-9]+)*$`, and cascading foreign keys for revisions and relations.

```ts
export const contentEntries = pgTable("content_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: contentKind("kind").notNull(),
  slug: varchar("slug", { length: 160 }).notNull(),
  status: contentStatus("status").notNull().default("draft"),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  bodyMd: text("body_md").notNull().default(""),
  seoTitle: varchar("seo_title", { length: 180 }).notNull().default(""),
  seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
  manualCanonicalPath: varchar("manual_canonical_path", { length: 300 }),
  indexable: boolean("indexable").notNull().default(true),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("content_entries_kind_slug_uq").on(table.kind, table.slug),
  check("content_entries_version_positive", sql`${table.version} > 0`),
  check("content_entries_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
]);
```

Implement the other locked tables exactly as described in the design spec. The first migration enables `pgcrypto` for UUID generation and creates every enum, table, index, and constraint.

- [ ] **Step 5: Add local PostgreSQL services**

In `docker-compose.yml`, add PostgreSQL 16 with a health check, a named data volume, and separate `kordev`/`kordev_test` databases created by an initialization SQL script. Pass `DATABASE_URL` to the app. Do not expose production credentials in the compose file; local values are development-only.

- [ ] **Step 6: Generate/check migrations and pass the integration test**

Run:

```bash
docker compose up -d postgres
yarn db:check
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn db:migrate
TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/db/schema.test.ts
```

Expected: migration check PASS, migration applies once, and the cascade test PASS.

- [ ] **Step 7: Commit the database foundation**

```bash
git add package.json yarn.lock drizzle.config.ts drizzle src/server/db docker-compose.yml
git commit -m "feat(content): add PostgreSQL content schema"
```

---

### Task 3: Build the publication repository, revisions, and cache invalidation

**Files:**

- Create: `src/server/content/types.ts`
- Create: `src/server/content/repository.ts`
- Create: `src/server/content/cache.ts`
- Create: `src/server/content/service.ts`
- Test: `src/server/content/service.test.ts`

**Interfaces:**

- Produces: `getPublishedEntry(kind, slug): Promise<ContentEntry | null>`.
- Produces: `listPublishedEntries(kind): Promise<ContentEntry[]>`.
- Produces: `saveDraft(command, actorId): Promise<ContentEntry>`.
- Produces: `publishEntry(id, expectedVersion, actorId): Promise<ContentEntry>`.
- Produces: `unpublishEntry(id, expectedVersion, actorId): Promise<ContentEntry>`.
- Produces: `restoreRevision(entryId, revisionVersion, expectedVersion, actorId): Promise<ContentEntry>`.
- Produces: `hardDeleteEntry(id, expectedVersion): Promise<boolean>`.

- [ ] **Step 1: Write failing publication tests**

```ts
test("draft is invisible and publish is immediately visible", async () => {
  const draft = await service.saveDraft(validServiceDraft, adminId);
  assert.equal(await service.getPublishedEntry("service", draft.slug), null);
  const published = await service.publishEntry(draft.id, draft.version, adminId);
  assert.equal((await service.getPublishedEntry("service", draft.slug))?.version, published.version);
});

test("stale editor cannot overwrite a newer version", async () => {
  const draft = await service.saveDraft(validServiceDraft, adminId);
  await service.saveDraft({ ...validServiceDraft, id: draft.id, expectedVersion: draft.version }, adminId);
  await assert.rejects(
    service.saveDraft({ ...validServiceDraft, id: draft.id, expectedVersion: draft.version }, adminId),
    /content_version_conflict/,
  );
});
```

- [ ] **Step 2: Run the tests and confirm repository failures**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/content/service.test.ts`

Expected: FAIL because content service exports are missing.

- [ ] **Step 3: Implement validated content commands**

Define discriminated Zod schemas for all content kinds. A service payload must validate every array and CTA field from the design spec. A publish command rejects empty H1, SEO title, SEO description, or required service sections. Draft saves allow incompleteness.

```ts
export type ContentService = {
  getPublishedEntry(kind: ContentKind, slug: string): Promise<ContentEntry | null>;
  listPublishedEntries(kind: ContentKind): Promise<ContentEntry[]>;
  saveDraft(command: SaveContentCommand, actorId: string): Promise<ContentEntry>;
  publishEntry(id: string, expectedVersion: number, actorId: string): Promise<ContentEntry>;
  unpublishEntry(id: string, expectedVersion: number, actorId: string): Promise<ContentEntry>;
  restoreRevision(entryId: string, revisionVersion: number, expectedVersion: number, actorId: string): Promise<ContentEntry>;
  hardDeleteEntry(id: string, expectedVersion: number): Promise<boolean>;
};
```

- [ ] **Step 4: Implement transactional revisions and optimistic locking**

Every update transaction inserts the pre-change full snapshot into `content_revisions`, updates only where `id` and `version` match, increments `version`, and checks one returned row. Publish sets `publishedAt` on first publication. Hard delete uses the FK cascade and never changes status to a deleted state.

- [ ] **Step 5: Implement bounded cache and synchronous invalidation**

Use a dependency-free map with an upper bound of 500 records and a 60-second TTL. Cache only published reads. After a successful write transaction, invalidate `entry:{kind}:{slug}`, `list:{kind}`, relationship lists that reference the entry, and `sitemaps`. Never cache errors or drafts.

- [ ] **Step 6: Pass publication tests and add a concurrent update test**

Run: `TEST_DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev_test yarn tsx --test src/server/content/service.test.ts`

Expected: all publication, revision, cache, hard-delete, and optimistic-lock tests PASS.

- [ ] **Step 7: Commit the content boundary**

```bash
git add src/server/content
git commit -m "feat(content): add versioned publication service"
```

---

### Task 4: Migrate Russian legacy content and delete English runtime/content

**Files:**

- Create: `scripts/migrate-content-to-postgres.ts`
- Create: `scripts/verify-content-migration.ts`
- Create: `tests/migration/contentMigration.test.ts`
- Modify: `src/i18n.ts`
- Modify: every component importing `LanguageToggle`
- Delete: `src/components/LanguageToggle.tsx`
- Delete: `src/locales/en.json`
- Delete: all `*.en.md` and `*.en.json` content files

**Interfaces:**

- Produces: `yarn content:migrate --dry-run` JSON report with counts, collisions, invalid records, and checksums.
- Produces: `yarn content:verify` comparison report and non-zero exit on mismatch.

- [ ] **Step 1: Write importer fixture tests**

```ts
test("legacy import includes Russian records and excludes English records", async () => {
  const result = await importLegacyContent({ fixtureRoot, dryRun: true });
  assert.deepEqual(result.counts, { articles: 2, cases: 1 });
  assert.equal(result.records.some((record) => record.source.endsWith(".en.md")), false);
  assert.equal(result.collisions.length, 0);
});

test("second import of the same batch is idempotent", async () => {
  const first = await importLegacyContent({ fixtureRoot, batchId: "fixture-1" });
  const second = await importLegacyContent({ fixtureRoot, batchId: "fixture-1" });
  assert.equal(second.inserted, 0);
  assert.equal(second.unchanged, first.inserted);
});
```

- [ ] **Step 2: Confirm the importer test fails**

Run: `yarn tsx --test tests/migration/contentMigration.test.ts`

Expected: FAIL because the migration module is absent.

- [ ] **Step 3: Implement dry-run, import, and verification commands**

Read the SQL.js database without mutating it, read Russian Markdown/JSON fallbacks, normalize project IDs to case slugs, and compute SHA-256 over canonical source data. Print JSON to stdout and diagnostics to stderr. Exit 2 for collisions/invalid records and 1 for connection/runtime errors.

Add scripts:

```json
{
  "content:migrate": "tsx scripts/migrate-content-to-postgres.ts",
  "content:verify": "tsx scripts/verify-content-migration.ts"
}
```

- [ ] **Step 4: Make the runtime Russian-only**

Replace language detection with a single Russian bundle:

```ts
export const i18nReady = i18n.use(initReactI18next).init({
  lng: "ru",
  fallbackLng: "ru",
  supportedLngs: ["ru"],
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
```

Remove the language toggle from header/mobile navigation and delete all English files. Update legacy bootstrap code to query/import only `ru` until it is retired.

- [ ] **Step 5: Run a real dry-run and review its report**

Run:

```bash
DATABASE_URL=postgresql://kordev:kordev@localhost:5433/kordev yarn content:migrate --dry-run
```

Expected: exit 0, no collisions, no English sources, and non-zero Russian article/case counts. Save the reviewed output outside the repository or as a CI artifact, not as mutable source data.

- [ ] **Step 6: Pass migration and existing presentation tests**

Run: `yarn tsx --test tests/migration/contentMigration.test.ts && yarn test:blog && node --test tests/projectPresentation.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit migration and English deletion**

```bash
git add package.json scripts/migrate-content-to-postgres.ts scripts/verify-content-migration.ts tests/migration src/i18n.ts src/components src/pages src/blog public/blog public/content
git commit -m "feat(content): migrate Russian content and remove English"
```

---

### Task 5: Render canonical SSR routes and hydration-stable SEO

**Files:**

- Create: `src/server/http/canonical.ts`
- Create: `src/server/http/cacheHeaders.ts`
- Create: `src/server/seo/metadata.ts`
- Create: `src/server/seo/schema.ts`
- Create: `src/routes/blog-index.tsx`
- Create: `src/routes/blog-post.tsx`
- Create: `src/routes/case.tsx`
- Create: `src/routes/static-page.tsx`
- Modify: `src/routes/home.tsx`
- Modify: `server/runtime.mjs`
- Modify: reusable files in `src/components/`
- Create: `tests/ssr/support/seoSnapshot.ts`
- Test: `tests/ssr/seoParity.test.ts`
- Test: `src/server/http/canonical.test.ts`

**Interfaces:**

- Produces: `canonicalizeRequest(request): URL | null`, returning the one-hop redirect target or `null`.
- Produces: `buildRouteMeta(input): MetaDescriptor[]`.
- Produces: `buildStructuredData(input): JsonLdNode[]`.

- [ ] **Step 1: Add failing canonical and SEO parity tests**

```ts
test("canonical redirect is one hop and keeps approved tracking parameters", () => {
  const target = canonicalizeUrl("http://www.kordev.team/blog/example?utm_source=test&deploy=bad");
  assert.equal(target, "https://kordev.team/blog/example/?utm_source=test");
});

test("server and hydrated SEO fields match", async () => {
  const page = await loadPage("/blog/business-automation/");
  assert.deepEqual(page.server.title, page.hydrated.title);
  assert.deepEqual(page.server.description, page.hydrated.description);
  assert.deepEqual(page.server.canonical, page.hydrated.canonical);
  assert.deepEqual(page.server.h1, page.hydrated.h1);
  assert.equal(page.server.lang, "ru");
});
```

- [ ] **Step 2: Confirm both tests fail under the SPA behavior**

Run: `yarn tsx --test src/server/http/canonical.test.ts tests/ssr/seoParity.test.ts`

Expected: FAIL because canonical middleware and SSR metadata builder do not exist.

- [ ] **Step 3: Implement one-hop canonical redirects**

Normalize only GET/HEAD HTML requests. Preserve the path and allow `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `yclid`, and `gclid`; remove known deploy/cache-bust parameters. Exclude `/api/`, asset paths, and non-HTML files. Register middleware before static files and the React Router handler.

- [ ] **Step 4: Implement the metadata and JSON-LD builders**

`buildRouteMeta` always emits title, description, self-canonical, Open Graph, Twitter card, and robots. It derives canonical from the matched route path unless a migration-only canonical override passes an allowlist validator. `buildStructuredData` never emits empty address/phone/rating/price fields.

```ts
export type RouteSeoInput = {
  pathname: string;
  title: string;
  description: string;
  indexable: boolean;
  ogImage?: string;
  kind: "home" | "service" | "case" | "article" | "page";
  breadcrumbs?: Array<{ name: string; pathname: string }>;
  updatedAt?: string;
};
```

- [ ] **Step 5: Convert existing pages to route loaders**

Each dynamic route loader uses `ContentService`, returns 404 when no published record exists, and sets `Cache-Control: no-cache`. Route modules export `meta` based only on loader data. Keep reusable presentational components but pass them loader data instead of fetching content after mount.

Remove `DeferredSection` from `HomePage`; retain `content-visibility: auto` CSS if desired, but always render its children into server HTML. Guard every `window`, `document`, `Image`, `localStorage`, and `IntersectionObserver` access behind an effect or environment check.

- [ ] **Step 6: Add a safe route error boundary and one-shot chunk recovery**

The root boundary shows Russian recovery copy and no raw exception. A client script recognizes confirmed dynamic import/chunk errors, compares `sessionStorage.kordevChunkReloadRelease` with the embedded release SHA, reloads once, and logs a sanitized event. It never reloads twice for the same release.

- [ ] **Step 7: Pass parity, canonical, and no-JavaScript assertions**

Run: `yarn build && yarn tsx --test src/server/http/canonical.test.ts tests/ssr/seoParity.test.ts`

Expected: PASS for `/`, one article, one case, `/video/`, and `/journal/`; all meaningful HTML is present with JavaScript disabled.

- [ ] **Step 8: Commit canonical SSR routes**

```bash
git add src/routes src/server/http src/server/seo src/components src/pages server/runtime.mjs tests/ssr
git commit -m "feat(seo): render canonical routes on the server"
```

---

### Task 6: Generate live sitemaps and enforce crawl invariants

**Files:**

- Create: `src/server/seo/sitemaps.ts`
- Create: `src/routes/sitemap-index.xml.ts`
- Create: `src/routes/sitemap-pages.xml.ts`
- Create: `src/routes/sitemap-blog.xml.ts`
- Create: `src/routes/robots.txt.ts`
- Create: `scripts/seo-crawl.ts`
- Create: `tests/seo/crawler.test.ts`
- Modify: `src/routes.ts`
- Delete: `public/sitemap.xml`
- Delete: `public/sitemap-blog.xml`
- Delete: `public/robots.txt`

**Interfaces:**

- Produces: `buildSitemapIndex()`, `buildPagesSitemap(entries)`, `buildBlogSitemap(entries)`, and `buildRobotsText()`.
- Produces: `yarn seo:crawl --origin <url>` with non-zero exit for P0 violations.

- [ ] **Step 1: Write failing sitemap tests**

```ts
test("sitemaps contain disjoint canonical 200 URLs with real lastmod", async () => {
  const pages = await parseSitemap(`${origin}/sitemap-pages.xml`);
  const blog = await parseSitemap(`${origin}/sitemap-blog.xml`);
  assert.equal(intersection(pages.urls, blog.urls).length, 0);
  for (const item of [...pages.items, ...blog.items]) {
    assert.match(item.loc, /^https:\/\/kordev\.team\/.*\/$/);
    assert.match(item.lastmod, /^\d{4}-\d{2}-\d{2}T/);
  }
});
```

- [ ] **Step 2: Confirm the static sitemap test fails**

Run: `yarn tsx --test tests/seo/crawler.test.ts`

Expected: FAIL because the current static sitemap files overlap and use deploy-time dates.

- [ ] **Step 3: Implement dynamic XML/text resource routes**

Query only published/indexable records. Pages sitemap includes home, services, cases, journal, video, requisites, and privacy; blog sitemap includes articles only. Escape all XML values and emit ISO timestamps from `updatedAt`. The sitemap index lists exactly the two child sitemaps. Robots disallows `/admin/` and points to the index.

- [ ] **Step 4: Implement the crawl command**

For every sitemap URL, fetch without following redirects and assert status 200, one H1, non-empty unique title/description, matching 200 self-canonical, Russian lang, valid JSON-LD, and no technical error phrases. Crawl internal links and reject 3xx/4xx destinations. Emit a JSON summary and exit 1 for violations.

Add:

```json
{
  "seo:crawl": "tsx scripts/seo-crawl.ts"
}
```

- [ ] **Step 5: Delete static crawl files and pass tests**

Run: `yarn build && yarn start` in one terminal, then `yarn seo:crawl --origin http://127.0.0.1:3001` in another.

Expected: all sitemap URLs return 200 without redirects; no duplicates or SEO parity failures.

- [ ] **Step 6: Commit dynamic crawl infrastructure**

```bash
git add package.json src/routes.ts src/routes/sitemap* src/routes/robots* src/server/seo/sitemaps.ts scripts/seo-crawl.ts tests/seo public/sitemap.xml public/sitemap-blog.xml public/robots.txt
git commit -m "feat(seo): generate and validate live sitemaps"
```

---

### Task 7: Build the production image and atomic blue/green release scripts

**Files:**

- Modify: `Dockerfile`
- Modify: `server/api-app.js`
- Modify: `docker-compose.yml`
- Create: `deploy/docker-compose.team.yml`
- Create: `deploy/traefik/kordevteam-dynamic.yml`
- Create: `scripts/deploy-slot.sh`
- Create: `scripts/switch-slot.sh`
- Create: `scripts/rollback-slot.sh`
- Create: `scripts/backup-postgres.sh`
- Create: `scripts/restore-postgres.sh`
- Create: `scripts/prune-releases.sh`
- Test: `tests/deploy/scripts.test.mjs`

**Interfaces:**

- Produces: `deploy-slot.sh <blue|green> <immutable-image-ref>`.
- Produces: `switch-slot.sh <blue|green>` using an atomic config rename.
- Produces: `rollback-slot.sh` restoring the previously recorded active color.
- Produces: encrypted backup archive plus SHA-256 manifest uploaded to Timeweb S3.

- [ ] **Step 1: Add static tests for destructive-operation guards**

```js
test("deployment scripts reject invalid slots and mutable image tags", () => {
  assert.notEqual(run("scripts/deploy-slot.sh", ["purple", "ghcr.io/x/site:latest"]).status, 0);
  assert.notEqual(run("scripts/deploy-slot.sh", ["blue", "ghcr.io/x/site:latest"]).status, 0);
});

test("pruning keeps three releases and never targets an unresolved path", () => {
  const script = readFileSync("scripts/prune-releases.sh", "utf8");
  assert.match(script, /KEEP_RELEASES:-3/);
  assert.match(script, /RETENTION_DAYS:-30/);
  assert.doesNotMatch(script, /rm -rf \$[A-Z_]+/);
});
```

- [ ] **Step 2: Confirm deploy tests fail**

Run: `node --test tests/deploy/scripts.test.mjs`

Expected: FAIL because the guarded scripts do not exist.

- [ ] **Step 3: Add readiness checks and update the image for SSR and PostgreSQL**

Add `GET /api/health/ready` to `server/api-app.js`; it runs `SELECT 1` through the shared database client and returns 503 with `{ "status": "not_ready" }` on failure without exposing configuration. Build with Node 22.22, run `yarn build`, and copy `build/client`, `build/server`, `server`, migrations, and production dependencies. Run as a non-root user. The container health check calls this readiness route.

- [ ] **Step 4: Define blue and green services**

Both services use the same immutable SHA image, database, and S3 configuration but distinct container names and internal ports. Only the selected Traefik service receives public traffic. PostgreSQL is not duplicated between colors. Include log rotation:

```yaml
logging:
  driver: json-file
  options:
    max-size: 20m
    max-file: "30"
```

No secrets or real host credentials are committed.

- [ ] **Step 5: Implement guarded deploy/switch/rollback scripts**

`deploy-slot.sh` accepts only `blue` or `green` and only image references containing `@sha256:` or a 40-character commit tag. It pulls/starts the inactive slot, applies migrations under a PostgreSQL advisory lock, and polls localhost readiness and representative SSR pages. It never edits the active route.

`switch-slot.sh` writes a complete temporary Traefik dynamic file, validates the target slot health again, atomically renames the file, records previous/current slots, and performs public smoke checks. If checks fail, call `rollback-slot.sh` automatically.

- [ ] **Step 6: Implement backup, restore verification, and pruning**

`backup-postgres.sh` uses `pg_dump --format=custom`, creates a SHA-256 manifest, encrypts with the configured age recipient, and uploads to a private Timeweb S3 prefix. `restore-postgres.sh` requires an explicit backup object key and a non-production target database, verifies checksum, restores, and runs content-count checks. `prune-releases.sh` receives an explicit release directory, resolves it, rejects `/`, home, or workspace roots, and removes only items older than 30 days while retaining at least three.

- [ ] **Step 7: Pass script tests and a local inactive-slot rehearsal**

Run:

```bash
node --test tests/deploy/scripts.test.mjs
docker compose build
docker compose up -d postgres kordevteam-blue
curl --fail http://127.0.0.1:8081/api/health/ready
```

Expected: tests PASS, the image runs as non-root, and readiness returns 200.

- [ ] **Step 8: Commit deployment topology**

```bash
git add Dockerfile docker-compose.yml deploy scripts/deploy-slot.sh scripts/switch-slot.sh scripts/rollback-slot.sh scripts/backup-postgres.sh scripts/restore-postgres.sh scripts/prune-releases.sh tests/deploy
git commit -m "feat(deploy): add guarded blue green releases"
```

---

### Task 8: Gate image publication and production switching in GitHub Actions

**Files:**

- Modify: `.github/workflows/docker-build.yml`
- Create: `.github/workflows/restore-drill.yml`
- Create: `docs/operations/production-release.md`
- Test: local workflow lint plus repository test suite

**Interfaces:**

- Produces: automatic `build-and-push` job on `main`.
- Produces: manual/protected `deploy-production` job using the `production` GitHub environment.
- Produces: monthly restore-drill workflow and documented operator steps.

- [ ] **Step 1: Split CI from production deployment**

The build job must run `yarn install --immutable`, `yarn typecheck`, `yarn test`, `yarn build`, and the built-site SEO crawler before pushing. Tag the image with the full commit SHA and emit its digest as a job output. Never deploy `latest`.

- [ ] **Step 2: Add the protected production job**

```yaml
deploy-production:
  needs: build-and-push
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  environment: production
  concurrency:
    group: kordevteam-production
    cancel-in-progress: false
```

The repository’s `production` environment is configured in GitHub with the owner as required reviewer when the repository plan supports it. If required reviewers are unavailable for the repository plan, the workflow uses `workflow_dispatch` with an exact image digest input; document this fallback explicitly.

- [ ] **Step 3: Deploy the inactive slot by digest**

The SSH command sends only the immutable image reference and invokes repository-controlled scripts already installed on the VPS: pre-release backup, detect inactive color, deploy/check inactive slot, atomic switch, public smoke test, prune. Remove the current unconditional `docker compose up -d` production restart.

- [ ] **Step 4: Add monthly restore drill**

The drill downloads the newest backup into a disposable PostgreSQL container, restores it, verifies schema migrations and published-record counts, then destroys only the explicitly named disposable volume. It uploads the verification report as a workflow artifact.

- [ ] **Step 5: Document manual approval, rollback, and evidence**

`docs/operations/production-release.md` includes exact commands to identify current/inactive color, inspect health, approve/reject, switch, roll back, locate backup manifests, and verify public canonical redirects. It lists required secrets by name without values.

- [ ] **Step 6: Run the full P0 verification**

Run:

```bash
yarn install --immutable
yarn typecheck
yarn test
yarn build
docker compose build
```

Expected: every command exits 0. Then run the local crawler against the built runtime and require zero P0 errors.

- [ ] **Step 7: Commit the CI release gate**

```bash
git add .github/workflows/docker-build.yml .github/workflows/restore-drill.yml docs/operations/production-release.md
git commit -m "ci: require approval for atomic production deploy"
```

---

## P0 completion checkpoint

Do not begin the commercial-content plan until all of these are evidenced:

- final H1/title/description/canonical are present in raw server HTML and unchanged after hydration;
- Russian-only content migration report has no collisions or missing source records;
- all sitemap URLs return direct 200 responses and internal links avoid redirects;
- a draft/publish operation is immediately reflected without rebuilding;
- inactive blue/green slot passes readiness and representative SSR smoke tests;
- production switch remains manual;
- PostgreSQL backup restore drill succeeds;
- the previous production image and asset namespace remain available for rollback.

After this checkpoint, create separate implementation plans for:

1. commercial service/case/home templates plus administrator editing and Timeweb media;
2. durable lead form, email outbox, ClamAV, consent, analytics, and the Krasotula adapter contract;
3. content audit, redirect decisions, final performance/accessibility hardening, and launch monitoring.
