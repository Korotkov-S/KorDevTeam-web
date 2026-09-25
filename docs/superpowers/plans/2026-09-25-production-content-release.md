# Production Content Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выпускать код и полный управляемый контент KorDevTeam из одного commit через два immutable OCI-образа, одну атомарную PostgreSQL-транзакцию и проверяемый production release gate.

**Architecture:** Детерминированный manifest собирается из 46 актуальных статей, 23 кейсов, 7 услуг, их FAQ и связей. Content-release CLI строит план, блокирует неизвестные правки, применяет весь набор под одним advisory lock, фиксирует ownership-состояние и независимо проверяет результат; отдельный минимальный Docker image запускает CLI перед blue/green-переключением.

**Tech Stack:** TypeScript 5.9, Node.js 22.22, PostgreSQL 16, Drizzle ORM 0.45, Zod 4, esbuild, Docker Compose, GitHub Actions, Bash, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-25-production-content-release-design.md`

## Global Constraints

- Web и content-release images должны быть собраны из одного полного 40-символьного Git SHA и приниматься production только по `@sha256:` digest.
- Content manifest должен быть детерминированным каноническим JSON с SHA-256; время сборки не входит в checksum.
- Apply выполняет статьи → кейсы → услуги/FAQ → связи в одной PostgreSQL-транзакции под одним transaction-level advisory lock.
- Неизвестная правка из админки/MCP, конкурентное изменение, `unowned-conflict` или `orphaned-owned` запрещают любую запись.
- Первая версия не удаляет и не снимает контент с публикации автоматически.
- Записи вне source-controlled manifest, лиды, пользователи, MCP-токены, медиа, SEO-данные, редиректы и настройки не изменяются.
- Повторный apply одного manifest не создаёт ревизий и не увеличивает версии.
- Общая PostgreSQL требует backward-compatible schema/content: старый активный runtime обязан читать уже применённый контент.
- Content-release container работает от UID 1000, с read-only root filesystem, без публичных портов, без egress и только с `DATABASE_URL`, `RELEASE_SHA`, `CONTENT_MANIFEST_SHA256`.
- Ошибка content plan/apply/verify или candidate smoke запрещает slot switch; автоматический restore общей production-базы не выполняется.

## Review Focus

- Существующий неуправляемый slug с отличающимся текстом должен дать `unowned-conflict` и оставить все строки неизменными — закрепить integration-тестом Task 5.
- Правка статьи или связи через админку/MCP между plan и apply должна дать `content_release_plan_changed` и откатить весь batch — закрепить integration-тестом Task 5.
- Исчезновение ранее управляемого slug из нового manifest должно дать `orphaned-owned`, а не удалить/скрыть запись — закрепить тестом planner в Task 5.
- Relation-only drift услуги должен обнаруживаться и plan, и verify — закрепить тестами checksum/verify в Tasks 3 и 5.
- Перестановка исходных файлов и повторный apply должны сохранять manifest checksum и не создавать ревизии — закрепить тестами Tasks 3 и 5.

---

## File Structure

Новые production-компоненты:

- `src/server/content-release/types.ts` — стабильные типы manifest, plan, reports и error codes.
- `src/server/content-release/manifest.ts` — загрузка всех источников, нормализация, сортировка и checksum.
- `src/server/content-release/state.ts` — чтение и запись `content_release_runs/items` внутри переданной транзакции.
- `src/server/content-release/planner.ts` — классификация `insert/update/unchanged/conflict/unowned-conflict/orphaned-owned` без записи.
- `src/server/content-release/orchestrator.ts` — глобальный lock, повторный plan, атомарный apply и verify.
- `scripts/content-release.ts` — CLI `manifest|plan|apply|verify` с JSON stdout и безопасными кодами ошибок.
- `scripts/build-content-release.mjs` — esbuild bundle CLI без TypeScript runtime в финальном image.
- `tests/content-release/contentRelease.integration.test.ts` — clean DB, rollback, conflict, idempotence и verify.
- `tests/content-release/contentReleaseCli.test.ts` — аргументы CLI, checksum binding и безопасные отчёты.
- `drizzle/0006_content_release.sql` и Drizzle metadata — release journal и per-entry ownership.

Существующие файлы с изменённой ответственностью:

- `src/server/content/articleSources.ts` — загрузка всего каталога, даты и transaction-aware apply.
- `src/server/portfolio/importer.ts` — apply в переданной транзакции с прежней wrapper-функцией.
- `src/server/content/commercialServices.ts` — apply в переданной транзакции с прежней wrapper-функцией.
- `src/server/content/repository.ts` — экспорт общего типа `ContentTransaction`.
- `src/server/db/schema.ts` — две release-таблицы.
- `Dockerfile` — `content-release-build` и минимальный `content-release` target.
- `deploy/docker-compose.team.yml` — закрытый одноразовый `content-release` service.
- `scripts/deploy-slot.sh` — backup → schema migrate → content plan/apply/verify → candidate runtime.
- `scripts/bootstrap-production-content.sh` — тот же новый CLI для пустой базы.
- `scripts/release-boundary.mjs` и `scripts/release-gate.sh` — evidence включает content image/checksum.
- `.github/workflows/docker-build.yml` — сборка, проверка и публикация двух images и release manifest.
- `docs/operations/production-release.md`, `deploy/README.md` — точные команды выпуска и восстановления.

---

### Task 1: Release journal schema and ownership state

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/schema.test.ts`
- Create: `drizzle/0006_content_release.sql`
- Create: `drizzle/meta/0006_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: существующие `contentKind`, `contentEntries`, PostgreSQL UUID/check constraints.
- Produces: `contentReleaseRuns`, `contentReleaseItems`; эти exports используют Tasks 5–6.

- [ ] **Step 1: Write the failing schema test**

Добавить imports таблиц и тест, который фиксирует FK, уникальность и SHA/version constraints:

```ts
databaseTest("content release state binds one owned entry to one committed manifest", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [entry] = await db.insert(contentEntries).values({
    kind: "article", slug: "release-owned", title: "Release owned",
  }).returning();
  const [run] = await db.insert(contentReleaseRuns).values({
    releaseSha: "a".repeat(40), manifestChecksum: "b".repeat(64),
    insertedCount: 1, updatedCount: 0, unchangedCount: 0,
  }).returning();
  await db.insert(contentReleaseItems).values({
    entryId: entry.id, kind: "article", slug: entry.slug, releaseId: run.id,
    sourceChecksum: "c".repeat(64), databaseChecksum: "d".repeat(64), databaseVersion: 1,
  });
  await assertConstraintViolation(() => db.insert(contentReleaseItems).values({
    entryId: entry.id, kind: "article", slug: entry.slug, releaseId: run.id,
    sourceChecksum: "e".repeat(64), databaseChecksum: "f".repeat(64), databaseVersion: 1,
  }));
  await db.delete(contentEntries).where(eq(contentEntries.id, entry.id));
  assert.equal((await db.select().from(contentReleaseItems)).length, 0);
  assert.equal((await db.select().from(contentReleaseRuns)).length, 1);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing exports fail**

Run:

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" yarn tsx --test src/server/db/schema.test.ts
```

Expected: TypeScript/import failure for `contentReleaseRuns` and `contentReleaseItems`.

- [ ] **Step 3: Add the two Drizzle tables**

Use these fields and constraints in `src/server/db/schema.ts`:

```ts
export const contentReleaseRuns = pgTable("content_release_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  releaseSha: varchar("release_sha", { length: 40 }).notNull(),
  manifestChecksum: varchar("manifest_checksum", { length: 64 }).notNull(),
  insertedCount: integer("inserted_count").notNull(),
  updatedCount: integer("updated_count").notNull(),
  unchangedCount: integer("unchanged_count").notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("content_release_runs_sha_manifest_uq").on(table.releaseSha, table.manifestChecksum),
  check("content_release_runs_sha_format", sql`${table.releaseSha} ~ '^[0-9a-f]{40}$'`),
  check("content_release_runs_manifest_sha256", sql`${table.manifestChecksum} ~ '^[0-9a-f]{64}$'`),
  check("content_release_runs_counts_non_negative", sql`${table.insertedCount} >= 0 AND ${table.updatedCount} >= 0 AND ${table.unchangedCount} >= 0`),
]);

export const contentReleaseItems = pgTable("content_release_items", {
  entryId: uuid("entry_id").primaryKey().references(() => contentEntries.id, { onDelete: "cascade" }),
  kind: contentKind("kind").notNull(),
  slug: varchar("slug", { length: 160 }).notNull(),
  releaseId: uuid("release_id").notNull().references(() => contentReleaseRuns.id, { onDelete: "restrict" }),
  sourceChecksum: varchar("source_checksum", { length: 64 }).notNull(),
  databaseChecksum: varchar("database_checksum", { length: 64 }).notNull(),
  databaseVersion: integer("database_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("content_release_items_kind_slug_uq").on(table.kind, table.slug),
  check("content_release_items_source_sha256", sql`${table.sourceChecksum} ~ '^[0-9a-f]{64}$'`),
  check("content_release_items_database_sha256", sql`${table.databaseChecksum} ~ '^[0-9a-f]{64}$'`),
  check("content_release_items_version_positive", sql`${table.databaseVersion} > 0`),
]);
```

Export both tables in the schema object at the bottom of the file.

- [ ] **Step 4: Generate and inspect migration 0006**

Run:

```bash
yarn drizzle-kit generate --name content_release
```

Expected: `drizzle/0006_content_release.sql`, snapshot and journal entry create exactly the two tables, both unique indexes, checks and foreign keys; no unrelated ALTER/DROP statements.

- [ ] **Step 5: Run schema tests and migration checks**

Run:

```bash
yarn db:check
TEST_DATABASE_URL="$TEST_DATABASE_URL" yarn tsx --test src/server/db/schema.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the schema unit**

```bash
git add src/server/db/schema.ts src/server/db/schema.test.ts drizzle/0006_content_release.sql drizzle/meta
git commit -m "feat(content): add release ownership schema"
```

---

### Task 2: Complete article source catalog and transaction-aware domain writers

**Files:**
- Modify: `src/server/content/repository.ts`
- Modify: `src/server/content/articleSources.ts`
- Modify: `src/server/content/articleSources.test.ts`
- Modify: `src/server/portfolio/importer.ts`
- Modify: `src/server/portfolio/importer.test.ts`
- Modify: `src/server/content/commercialServices.ts`
- Modify: `src/server/content/commercialServices.test.ts`

**Interfaces:**
- Consumes: `ContentDatabase`, existing parsers and domain checks.
- Produces: `ContentTransaction`, `ContentReader`, `loadAllArticleSources(root?)`, `applyArticleSourcesInTransaction(tx, sources, options)`, `applyPortfolioImportInTransaction(tx, plan)`, `applyCommercialServiceSourcesInTransaction(tx, sources)`.

- [ ] **Step 1: Write failing tests for full article loading and transaction reuse**

Add assertions:

```ts
test("all article sources include stable publication dates and every Russian catalog slug", async () => {
  const sources = await loadAllArticleSources();
  assert.equal(sources.length, 46);
  assert.equal(new Set(sources.map(source => source.slug)).size, 46);
  assert.ok(sources.every(source => source.publishedAt?.toISOString().endsWith("Z")));
  assert.ok(sources.every(source => source.updatedAt?.toISOString().endsWith("Z")));
});
```

For each writer test, wrap its new inner function in one outer `db.transaction`, throw after the writer returns, and assert the database remains unchanged after rejection. This proves the inner function does not commit independently.

- [ ] **Step 2: Run the three focused suites and confirm missing APIs fail**

```bash
yarn tsx --test src/server/content/articleSources.test.ts src/server/portfolio/importer.test.ts src/server/content/commercialServices.test.ts
```

Expected: missing export/type failures.

- [ ] **Step 3: Export the shared transaction type**

Change `src/server/content/repository.ts`:

```ts
export type ContentDatabase = ReturnType<typeof createDb>;
export type ContentTransaction = Parameters<Parameters<ContentDatabase["transaction"]>[0]>[0];
export type ContentReader = Pick<ContentDatabase, "select">;
```

Replace the private `Transaction` alias with `ContentTransaction` in that file.

- [ ] **Step 4: Load the complete article catalog with normalized dates**

Extend `ArticleSource` with `publishedAt: Date` and `updatedAt: Date`. Parse Russian `date` and `updatedDate` through existing `parseBlogDate`, reject invalid dates with `article_source_invalid`, and add:

```ts
export async function loadAllArticleSources(root = process.cwd()): Promise<ArticleSource[]> {
  const metadata = await readMetadata(root);
  return loadArticleSources(metadata.map(item => item.slug), root);
}
```

Keep `loadArticleSources(slugs, root)` for the current one-article CLI.

- [ ] **Step 5: Split each writer into inner operation and lock-owning wrapper**

Use these exact signatures:

```ts
export async function applyArticleSourcesInTransaction(
  tx: ContentTransaction,
  sources: readonly ArticleSource[],
  options: { insertMissing: boolean } = { insertMissing: false },
): Promise<{ inserted: number; updated: number; unchanged: number }>;

export async function applyPortfolioImportInTransaction(
  tx: ContentTransaction,
  plan: readonly PortfolioImportItem[],
): Promise<PortfolioImportResult>;

export async function applyCommercialServiceSourcesInTransaction(
  tx: ContentTransaction,
  sources: readonly CommercialServiceSource[],
): Promise<{ inserted: number; updated: number; unchanged: number }>;
```

The existing exported wrappers retain their locks and delegate:

```ts
return db.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(706007)`);
  return applyArticleSourcesInTransaction(tx, sources);
});
```

Portfolio keeps lock `706026`; services keep `706006`. Only the future orchestrator calls inner functions directly.

Change `planPortfolioImport` to accept `ContentReader`; both the top-level database and an existing transaction satisfy that read-only interface.

- [ ] **Step 6: Define article insertion semantics for a clean database**

When `insertMissing` is true, insert a draft with source fields and historical `createdAt/updatedAt`, create revision version 1, then publish it as version 2 with `publishedAt`. When false, preserve `article_source_target_missing`. Existing exact content is `unchanged`; updates preserve `publishedAt` and create one revision.

- [ ] **Step 7: Run focused suites and typecheck**

```bash
yarn tsx --test src/server/content/articleSources.test.ts src/server/portfolio/importer.test.ts src/server/content/commercialServices.test.ts
yarn typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit the transaction seams**

```bash
git add src/server/content/repository.ts src/server/content/articleSources.ts src/server/content/articleSources.test.ts src/server/portfolio/importer.ts src/server/portfolio/importer.test.ts src/server/content/commercialServices.ts src/server/content/commercialServices.test.ts
git commit -m "refactor(content): support one release transaction"
```

---

### Task 3: Deterministic current-content manifest

**Files:**
- Create: `src/server/content-release/types.ts`
- Create: `src/server/content-release/manifest.ts`
- Create: `src/server/content-release/manifest.test.ts`
- Modify: `src/server/content/articleSources.ts`

**Interfaces:**
- Consumes: `loadAllArticleSources`, `loadPortfolioSources`, `loadCommercialServiceSources`, `toPortfolioCommand`, `parseContentCommand`, `canonicalJson`, `checksum`.
- Produces: `loadContentReleaseBundle(root?)`, `buildContentReleaseManifest(root?)`, `contentReleaseManifestJson(manifest)`, `contentReleaseItemKey(kind, slug)` and manifest/report types used by every later task.

- [ ] **Step 1: Write failing manifest tests**

```ts
test("current sources produce a stable complete manifest", async () => {
  const first = await buildContentReleaseManifest();
  const second = await buildContentReleaseManifest();
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.counts, { article: 46, case: 23, service: 7, faq: 69 });
  assert.deepEqual(first.items.map(item => item.key), [...first.items.map(item => item.key)].sort());
  assert.equal(new Set(first.items.map(item => item.key)).size, first.items.length);
});

test("service relation order changes the managed database checksum", async () => {
  const manifest = await buildContentReleaseManifest();
  const service = manifest.items.find(item => item.kind === "service")!;
  const reversed = { ...service, relations: [...service.relations].reverse() };
  assert.notEqual(contentReleaseItemChecksum(service), contentReleaseItemChecksum(reversed));
});
```

The checked-in `content/services.ru.json` currently contains exactly 69 FAQ records; a source change must deliberately update this assertion and the reviewed manifest checksum.

- [ ] **Step 2: Run the manifest test and confirm the module is missing**

```bash
yarn tsx --test src/server/content-release/manifest.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Define exact manifest types**

```ts
export type ManagedContentKind = "article" | "case" | "service" | "faq";
export type ContentReleaseRelation = {
  type: "related_case" | "related_article" | "related_faq";
  targetKey: `${ManagedContentKind}:${string}`;
  sortOrder: number;
};
export type ContentReleaseItem = {
  key: `${ManagedContentKind}:${string}`;
  kind: ManagedContentKind;
  slug: string;
  aliases: string[];
  command: ValidatedContentCommand;
  publishedAt: string | null;
  updatedAt: string | null;
  relations: ContentReleaseRelation[];
  sourceChecksum: string;
};
export type ContentReleaseManifest = {
  schemaVersion: 1;
  counts: Record<ManagedContentKind, number>;
  items: ContentReleaseItem[];
  checksum: string;
};
export type ContentReleaseBundle = {
  manifest: ContentReleaseManifest;
  articleSources: ArticleSource[];
  portfolioSources: PortfolioCaseSource[];
  serviceSources: CommercialServiceSource[];
};
```

`loadContentReleaseBundle(root)` loads each source exactly once and derives `manifest` from those in-memory arrays. `buildContentReleaseManifest(root)` is a convenience wrapper returning `(await loadContentReleaseBundle(root)).manifest`.

- [ ] **Step 4: Build the final desired set, not the legacy intermediate set**

`buildContentReleaseManifest` must:

1. load all article sources and create published article commands with dates;
2. load all portfolio JSON and include `legacySlugs` as aliases;
3. load services and FAQ as separate entries;
4. encode each service relation by target key and sort order;
5. validate every relation target exists in the manifest;
6. reject duplicate keys and aliases;
7. sort items by key and relations by `(type, sortOrder, targetKey)`;
8. compute each `sourceChecksum` from command, timestamps, aliases and relations;
9. compute overall checksum from `{schemaVersion, counts, items}` without the outer checksum field.

- [ ] **Step 5: Pin canonical JSON output**

```ts
export function contentReleaseManifestJson(manifest: ContentReleaseManifest): string {
  return `${canonicalJson(manifest)}\n`;
}
```

Add a test that copies fixture source files into two temporary roots in opposite creation order and asserts identical JSON and checksum.

- [ ] **Step 6: Run source, manifest and portfolio validation tests**

```bash
yarn tsx --test src/server/content-release/manifest.test.ts src/server/content/articleSources.test.ts tests/portfolio/portfolioSource.test.ts src/server/content/commercialServices.test.ts
```

Expected: all pass with counts read from real sources.

- [ ] **Step 7: Commit the manifest unit**

```bash
git add src/server/content-release src/server/content/articleSources.ts
git commit -m "feat(content): generate deterministic release manifest"
```

---

### Task 4: Database-state checksums and release planner

**Files:**
- Create: `src/server/content-release/state.ts`
- Create: `src/server/content-release/planner.ts`
- Create: `src/server/content-release/planner.test.ts`
- Modify: `src/server/content-release/types.ts`

**Interfaces:**
- Consumes: Task 1 tables and Task 3 manifest.
- Produces: `databaseItemChecksum(tx, entry, manifestItem)`, `planContentRelease(tx, manifest, options?)`, `recordReleaseState(tx, input)`.

- [ ] **Step 1: Write failing classification tests**

Use an in-memory planner fixture for the pure classifier and PostgreSQL for checksum/ownership:

```ts
assert.equal(classifyContentReleaseItem({ desired, current: null, owned: null }), "insert");
assert.equal(classifyContentReleaseItem({ desired, current: exact, owned: null }), "unchanged");
assert.equal(classifyContentReleaseItem({ desired, current: changed, owned: null }), "unowned-conflict");
assert.equal(classifyContentReleaseItem({ desired, current: exactNext, owned: ownedPrevious }), "update");
assert.equal(classifyContentReleaseItem({ desired, current: adminEdited, owned: ownedPrevious }), "conflict");
```

Add a case where ownership contains `article:removed-from-source` but manifest does not; expect one `orphaned-owned` item and `blocked: true`.

- [ ] **Step 2: Run the focused test and confirm missing APIs fail**

```bash
yarn tsx --test src/server/content-release/planner.test.ts
```

Expected: missing exports.

- [ ] **Step 3: Define the plan contract**

```ts
export type ContentReleaseAction =
  | "insert" | "update" | "unchanged"
  | "conflict" | "unowned-conflict" | "orphaned-owned";
export type ContentReleasePlanItem = {
  key: string;
  action: ContentReleaseAction;
  entryId: string | null;
  expectedVersion: number | null;
  expectedDatabaseChecksum: string | null;
  desiredSourceChecksum: string | null;
};
export type ContentReleasePlan = {
  manifestChecksum: string;
  blocked: boolean;
  counts: Record<ContentReleaseAction, number>;
  items: ContentReleasePlanItem[];
  planChecksum: string;
};
```

- [ ] **Step 4: Include managed relations in the database checksum**

Normalize only release-owned fields:

```ts
const state = {
  kind: entry.kind,
  slug: entry.slug,
  status: entry.status,
  title: entry.title,
  excerpt: entry.excerpt,
  bodyMd: entry.bodyMd,
  seoTitle: entry.seoTitle,
  seoDescription: entry.seoDescription,
  indexable: entry.indexable,
  ogMediaId: entry.ogMediaId,
  payload: entry.payload,
  relations: managedRelations,
};
```

Exclude `createdAt`, `updatedAt`, `publishedAt`, revision IDs and unrelated incoming relations; verify separately that status `published` always has a non-null `publishedAt`. Map relation targets back to stable `kind:slug` keys rather than UUIDs, and preserve service relation order.

- [ ] **Step 5: Implement strict adoption and ownership comparison**

Planner rules:

- no row/no ownership → `insert`;
- exact row/no ownership → `unchanged` adoption;
- differing row/no ownership → `unowned-conflict`;
- row and ownership match recorded version/checksum, desired differs → `update`;
- row and ownership match, desired same → `unchanged`;
- row missing or current version/checksum differs from ownership → `conflict`;
- ownership key missing from manifest → `orphaned-owned`.

Resolve case aliases only when there is exactly one candidate; multiple canonical/alias rows are a blocking conflict.

- [ ] **Step 6: Write ownership only after successful content writes**

`recordReleaseState` inserts one `content_release_runs` row or reuses the row with the same `(releaseSha, manifestChecksum)`, then upserts every managed item with final entry ID, source checksum, database checksum and version. An identical ownership row remains untouched so a repeated apply has no database writes. It never deletes ownership rows; an absent desired key must already have blocked the plan.

- [ ] **Step 7: Run planner tests**

```bash
yarn tsx --test src/server/content-release/planner.test.ts
```

Expected: all six actions, relation drift and alias collision pass.

- [ ] **Step 8: Commit the planner**

```bash
git add src/server/content-release/state.ts src/server/content-release/planner.ts src/server/content-release/planner.test.ts src/server/content-release/types.ts
git commit -m "feat(content): plan releases without overwriting edits"
```

---

### Task 5: Atomic apply and independent verify

**Files:**
- Create: `src/server/content-release/orchestrator.ts`
- Create: `tests/content-release/contentRelease.integration.test.ts`
- Modify: `src/server/content-release/types.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `planRelease(db, manifest)`, `applyRelease(db, bundle, approval)`, `verifyRelease(db, manifest)`.

- [ ] **Step 1: Write the clean-database and idempotence integration test**

```ts
databaseTest("content release publishes the full manifest once and is idempotent", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const bundle = await loadContentReleaseBundle();
  const manifest = bundle.manifest;
  const firstPlan = await planRelease(db, manifest);
  assert.equal(firstPlan.blocked, false);
  const first = await applyRelease(db, bundle, {
    releaseSha: "a".repeat(40), manifestChecksum: manifest.checksum, planChecksum: firstPlan.planChecksum,
  });
  const revisionCount = (await db.select().from(contentRevisions)).length;
  const secondPlan = await planRelease(db, manifest);
  const second = await applyRelease(db, bundle, {
    releaseSha: "a".repeat(40), manifestChecksum: manifest.checksum, planChecksum: secondPlan.planChecksum,
  });
  assert.equal(first.inserted, manifest.items.length);
  assert.equal(second.updated, 0);
  assert.equal((await db.select().from(contentRevisions)).length, revisionCount);
  assert.equal((await verifyRelease(db, manifest)).ok, true);
});
```

- [ ] **Step 2: Add failing safety tests before implementation**

Add four integration tests:

1. existing differing unmanaged article → `content_release_blocked`, zero changes;
2. mutate article version after plan → `content_release_plan_changed`, zero changes;
3. inject failure after portfolio writes through a test-only dependency hook → articles/cases/services/release tables all roll back;
4. reorder one service relation directly in DB → verify reports that service key and returns `ok:false`.

- [ ] **Step 3: Run integration tests and confirm missing orchestrator fails**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" yarn tsx --test tests/content-release/contentRelease.integration.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement one locked transaction**

Use advisory key `706027` and this approval contract:

```ts
export type ApplyReleaseApproval = {
  releaseSha: string;
  manifestChecksum: string;
  planChecksum: string;
};
```

`applyRelease` validates all three values, then:

```ts
return db.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(706027)`);
  const lockedPlan = await planContentRelease(tx, manifest, { forUpdate: true });
  if (lockedPlan.blocked) throw new Error("content_release_blocked");
  if (lockedPlan.planChecksum !== approval.planChecksum) throw new Error("content_release_plan_changed");
  await applyArticleSourcesInTransaction(tx, articleSources, { insertMissing: true });
  const portfolioPlan = await planPortfolioImport(tx, portfolioSources);
  await applyPortfolioImportInTransaction(tx, portfolioPlan);
  await applyCommercialServiceSourcesInTransaction(tx, serviceSources);
  const result = {
    inserted: lockedPlan.counts.insert,
    updated: lockedPlan.counts.update,
    unchanged: lockedPlan.counts.unchanged,
  };
  const verification = await verifyReleaseInTransaction(tx, manifest);
  if (!verification.ok) throw new Error("content_release_post_apply_mismatch");
  await recordReleaseState(tx, {
    releaseSha: approval.releaseSha,
    manifest,
    verification,
    counts: result,
  });
  return result;
});
```

Pass loaded source groups alongside the manifest from one `loadContentReleaseBundle()` result so apply cannot reload files with another checksum.

The commercial-service inner writer compares the current ordered managed relations before deleting anything; when entries and relations are exact, it performs no relation delete/insert. This makes the second apply a true no-op, not merely an unchanged revision count.

- [ ] **Step 5: Make verify independent and read-only**

`verifyRelease` rebuilds database checksums and checks:

- every manifest key exists once and is published;
- aliases do not remain as duplicate rows;
- every source checksum matches ownership;
- database checksum/version matches ownership;
- every managed service relation and sort order matches;
- no owned key is absent from manifest;
- latest run SHA/checksum identifies the manifest.

It returns only keys, action/error codes, counts and checksums; no full body text.

- [ ] **Step 6: Run integration tests twice**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" yarn tsx --test tests/content-release/contentRelease.integration.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" yarn tsx --test tests/content-release/contentRelease.integration.test.ts
```

Expected: both runs pass, proving reset and idempotence are reliable.

- [ ] **Step 7: Commit the atomic release engine**

```bash
git add src/server/content-release/orchestrator.ts src/server/content-release/types.ts tests/content-release/contentRelease.integration.test.ts
git commit -m "feat(content): apply release atomically"
```

---

### Task 6: Content-release CLI and compiled bundle

**Files:**
- Create: `scripts/content-release.ts`
- Create: `scripts/build-content-release.mjs`
- Create: `tests/content-release/contentReleaseCli.test.ts`
- Modify: `package.json`
- Modify: `yarn.lock`

**Interfaces:**
- Consumes: `loadContentReleaseBundle`, `planRelease`, `applyRelease`, `verifyRelease`.
- Produces: CLI `manifest|plan|apply|verify`; `build/content-release/content-release.mjs`.

- [ ] **Step 1: Write failing CLI parser and safety tests**

Pin this parser:

```ts
assert.deepEqual(parseContentReleaseArgs(["manifest"]), { command: "manifest" });
assert.deepEqual(parseContentReleaseArgs([
  "apply", "--release-sha", "a".repeat(40),
  "--manifest-sha256", "b".repeat(64), "--plan-sha256", "c".repeat(64),
]), {
  command: "apply", releaseSha: "a".repeat(40),
  manifestChecksum: "b".repeat(64), planChecksum: "c".repeat(64),
});
for (const args of [["apply"], ["unknown"], ["plan", "--extra"]]) {
  assert.throws(() => parseContentReleaseArgs(args), /content_release_invalid_arguments/);
}
```

Add a spawned-process test asserting failures never print `DATABASE_URL`, article body text or stack traces.

- [ ] **Step 2: Run the CLI test and confirm missing module failure**

```bash
yarn tsx --test tests/content-release/contentReleaseCli.test.ts
```

Expected: missing CLI exports.

- [ ] **Step 3: Implement the four command outputs**

Output shapes:

```ts
type ManifestReport = { ok: true; command: "manifest"; releaseSha: string; manifestChecksum: string; counts: Record<string, number> };
type PlanReport = { ok: true; command: "plan"; manifestChecksum: string; planChecksum: string; blocked: boolean; counts: Record<string, number>; items: Array<{ key: string; action: string }> };
type ApplyReport = { ok: true; command: "apply"; releaseSha: string; manifestChecksum: string; planChecksum: string; counts: Record<string, number> };
type VerifyReport = { ok: boolean; command: "verify"; releaseSha: string; manifestChecksum: string; mismatches: Array<{ key: string; code: string }> };
```

JSON goes to stdout. A single summary line goes to stderr. Known errors map to `content_release_*`; unexpected errors become `content_release_runtime_error` without stack/configuration.

- [ ] **Step 4: Bind CLI to baked release identity**

Require `RELEASE_SHA` to be exactly 40 lowercase hex characters for every command. `apply --release-sha` must equal `RELEASE_SHA`; `--manifest-sha256` must equal the freshly generated manifest checksum; `--plan-sha256` must equal the locked re-plan.

- [ ] **Step 5: Add the esbuild command**

Add direct dev dependency `esbuild` at the version already selected by the locked Vite toolchain and scripts:

```json
{
  "content:release": "tsx scripts/content-release.ts",
  "build:content-release": "node scripts/build-content-release.mjs"
}
```

`scripts/build-content-release.mjs` invokes esbuild with:

```ts
await build({
  entryPoints: ["scripts/content-release.ts"],
  outfile: "build/content-release/content-release.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: false,
});
```

- [ ] **Step 6: Test deterministic manifest in separate processes and build the bundle**

```bash
first="$(RELEASE_SHA=$(git rev-parse HEAD) yarn -s content:release manifest)"
second="$(RELEASE_SHA=$(git rev-parse HEAD) yarn -s content:release manifest)"
test "$first" = "$second"
yarn build:content-release
test -s build/content-release/content-release.mjs
yarn tsx --test tests/content-release/contentReleaseCli.test.ts
```

Expected: identical JSON, bundle exists, tests pass.

- [ ] **Step 7: Commit the CLI**

```bash
git add scripts/content-release.ts scripts/build-content-release.mjs tests/content-release/contentReleaseCli.test.ts package.json yarn.lock
git commit -m "feat(content): add release CLI"
```

---

### Task 7: Hardened content image and first-install path

**Files:**
- Modify: `Dockerfile`
- Modify: `deploy/docker-compose.team.yml`
- Create: `scripts/build-content-release.sh`
- Modify: `scripts/bootstrap-production-content.sh`
- Modify: `scripts/bootstrap-content-check.mjs`
- Delete: `scripts/build-content-migration.sh`
- Modify: `tests/deploy/bootstrap.test.mjs`
- Modify: `tests/deploy/image.test.mjs`
- Modify: `tests/deploy/toolingRuntime.test.mjs`

**Interfaces:**
- Consumes: compiled CLI from Task 6 and manifest checksum.
- Produces: Docker target `content-release`, Compose service `content-release`, full-current bootstrap.

- [ ] **Step 1: Update deployment tests first**

Require Compose to resolve:

```js
assert.equal(services["content-release"].image, contentImage);
assert.deepEqual(services["content-release"].networks, ["backend"]);
assert.equal(services["content-release"].read_only, true);
assert.equal(services["content-release"].user, "1000:1000");
assert.equal(services["content-release"].ports, undefined);
assert.equal(services["content-release"].environment.DATABASE_URL, services["kordevteam-blue"].environment.DATABASE_URL);
assert.deepEqual(Object.keys(services["content-release"].environment).sort(), [
  "CONTENT_MANIFEST_SHA256", "DATABASE_URL", "RELEASE_SHA",
]);
```

Change bootstrap stubs to expect `content-release plan/apply/verify`, manifest-derived counts, and no `46/8` literal.

- [ ] **Step 2: Run deploy tests and confirm current topology fails**

```bash
node --test tests/deploy/bootstrap.test.mjs tests/deploy/image.test.mjs tests/deploy/toolingRuntime.test.mjs
```

Expected: failures referencing missing `content-release` target/service.

- [ ] **Step 3: Add build and runtime Docker stages**

`content-release-build` runs `yarn build:content-release`. Final `content-release` starts from `node:22.22.0-alpine`, copies production `node_modules`, the compiled bundle and only these source inputs:

```text
public/content/blog.ru.json
public/blog/*.md
content/portfolio/cases/*.json
content/services.ru.json
```

It sets OCI revision/source labels, validates 40-char `RELEASE_SHA`, uses `USER node`, and defaults to:

```dockerfile
CMD ["node", "/app/content-release.mjs", "manifest"]
```

Remove the old `content-migration` target after bootstrap tests use the new target.

- [ ] **Step 4: Replace the Compose service**

Define `content-release` with profile `content-release`, `user: "1000:1000"`, backend-only network, `read_only: true`, `tmpfs: ["/tmp:size=32m,noexec,nosuid"]`, `cap_drop: [ALL]`, `no-new-privileges:true`, and only the three required environment variables.

- [ ] **Step 5: Rewrite bootstrap around manifest/plan/apply/verify**

Keep clean-checkout, exact image labels, private report directory and empty-database protections. The flow becomes:

```bash
content-release manifest > "$reports/manifest.json"
content-release plan > "$reports/dry-run.json"
content-release apply --release-sha "$release" --manifest-sha256 "$approved" --plan-sha256 "$plan_checksum" > "$reports/apply.json"
content-release verify > "$reports/verify.json"
```

The apply invocation requires exact approved manifest checksum from the dry-run report. `bootstrap-content-check.mjs` validates dynamic manifest counts and `blocked:false`, never historical constants.

- [ ] **Step 6: Verify container hardening and bootstrap failure boundaries**

```bash
node --test tests/deploy/bootstrap.test.mjs tests/deploy/image.test.mjs tests/deploy/toolingRuntime.test.mjs
docker compose --env-file tests/fixtures/deploy-leads.env -f deploy/docker-compose.team.yml config >/dev/null
```

Expected: tests pass; no public content-release port or egress network.

- [ ] **Step 7: Commit image/bootstrap changes**

```bash
git add Dockerfile deploy/docker-compose.team.yml scripts/build-content-release.sh scripts/bootstrap-production-content.sh scripts/bootstrap-content-check.mjs tests/deploy/bootstrap.test.mjs tests/deploy/image.test.mjs tests/deploy/toolingRuntime.test.mjs
git rm scripts/build-content-migration.sh
git commit -m "feat(deploy): package hardened content release tool"
```

---

### Task 8: Production deploy ordering and evidence binding

**Files:**
- Modify: `scripts/deploy-slot.sh`
- Modify: `scripts/deploy-common.sh`
- Modify: `scripts/release-boundary.mjs`
- Modify: `scripts/release-gate.sh`
- Modify: `tests/deploy/scripts.test.mjs`
- Create: `tests/deploy/contentRelease.test.mjs`

**Interfaces:**
- Consumes: exact web image, exact content image and content manifest checksum.
- Produces: candidate slot record plus private release evidence version 2 bound to both images and content checksum.

- [ ] **Step 1: Write failing shell-order tests**

Pin the new interface:

```bash
scripts/deploy-slot.sh green "$WEB_IMAGE" "$CONTENT_IMAGE" "$CONTENT_MANIFEST_SHA256"
```

Assert command order:

```js
assert.ok(index("backup-postgres.sh") < index("migrate-production.mjs"));
assert.ok(index("migrate-production.mjs") < index("content-release.mjs plan"));
assert.ok(index("content-release.mjs plan") < index("content-release.mjs apply"));
assert.ok(index("content-release.mjs apply") < index("content-release.mjs verify"));
assert.ok(index("content-release.mjs verify") < index("up -d --no-deps kordevteam-green"));
```

For failures at plan/apply/verify, assert no candidate `up`, no slot record update and no route edit.

- [ ] **Step 2: Run focused deployment tests and confirm interface mismatch**

```bash
node --test tests/deploy/scripts.test.mjs tests/deploy/contentRelease.test.mjs
```

Expected: usage/order assertions fail.

- [ ] **Step 3: Validate both image identities before backup**

`deploy-slot.sh` must pull both images and inspect:

- exact digest syntax;
- same registry repository name;
- identical `org.opencontainers.image.revision` labels;
- revision equals `RELEASE_SHA` label recorded by both images;
- content image manifest command returns the supplied checksum.

No database operation runs before all checks pass.

- [ ] **Step 4: Add private plan/apply/verify evidence**

Create `$DEPLOY_STATE_DIR/content-releases/$target/` mode `0700`. Write `manifest.json`, `plan.json`, `apply.json`, `verify.json` atomically as mode `0600`. Reject symlinks and pre-existing unsafe paths through existing `safe_path` helpers. Parse fields with Node, not shell regex over arbitrary JSON.

- [ ] **Step 5: Bind release gate evidence version 2**

Extend the exact keys to:

```js
const keys = [
  "version", "slot", "image", "contentImage", "contentManifestSha256",
  "contentPlanSha256", "privacyPolicySha256", "leadId", "consentVersion",
  "slotRecordMtimeMs", "createdAt",
];
```

`release-gate.sh` reads candidate content evidence from the private state directory; `release-boundary.mjs record` stores it; `validate` rejects stale/mismatched image, manifest or plan evidence before switch.

- [ ] **Step 6: Prove shared-DB failure behavior**

Add a test where apply succeeds but candidate smoke fails. Assert route and worker remain on the old slot, content evidence records committed apply, and no automatic restore command runs. This pins the shared-database limitation from the approved spec.

- [ ] **Step 7: Run all deploy tests**

```bash
node --test tests/deploy/*.test.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit production orchestration**

```bash
git add scripts/deploy-slot.sh scripts/deploy-common.sh scripts/release-boundary.mjs scripts/release-gate.sh tests/deploy/scripts.test.mjs tests/deploy/contentRelease.test.mjs
git commit -m "feat(deploy): gate slots on atomic content release"
```

---

### Task 9: CI publication of two immutable images and release manifest

**Files:**
- Modify: `.github/workflows/docker-build.yml`
- Modify: `tests/ciReleaseGate.test.mjs`
- Create: `scripts/release-manifest.mjs`
- Create: `scripts/release-manifest.test.mjs`

**Interfaces:**
- Consumes: web/content image digests, Git SHA, content checksum, GitHub run ID and build timestamp.
- Produces: `release-manifest.json` artifact and manual workflow inputs for both images/checksum.

- [ ] **Step 1: Write failing release-manifest tests**

```js
const manifest = buildReleaseManifest({
  gitSha: "a".repeat(40),
  webImage: `ghcr.io/example/site@sha256:${"b".repeat(64)}`,
  contentImage: `ghcr.io/example/site@sha256:${"c".repeat(64)}`,
  contentManifestSha256: "d".repeat(64),
  ciRunId: "12345",
  builtAt: "2026-09-25T12:00:00.000Z",
});
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.gitSha, "a".repeat(40));
assert.throws(() => buildReleaseManifest({ ...input, webImage: "ghcr.io/example/site:latest" }));
```

The builder rejects an invalid ISO timestamp; content determinism is proved by `contentManifestSha256`, while `builtAt` records when the release artifact was assembled.

- [ ] **Step 2: Update workflow contract tests first**

Require dispatch inputs `image_ref`, `content_image_ref`, `content_manifest_sha256`, privacy checksum and test-lead opt-in. Require validation to build/test both targets, publisher to expose both digests, and artifact to contain `release-manifest.json`.

- [ ] **Step 3: Run CI contract tests and confirm failures**

```bash
node --test scripts/release-manifest.test.mjs tests/ciReleaseGate.test.mjs
```

Expected: missing script/inputs/content build failures.

- [ ] **Step 4: Replace separate crawler seeding with the release CLI**

In validation:

```bash
yarn db:migrate
manifest_report="$(RELEASE_SHA="$GITHUB_SHA" yarn -s content:release manifest)"
manifest_sha="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.manifestChecksum)' "$manifest_report")"
plan_report="$(RELEASE_SHA="$GITHUB_SHA" yarn -s content:release plan)"
plan_sha="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.planChecksum)' "$plan_report")"
RELEASE_SHA="$GITHUB_SHA" yarn -s content:release apply --release-sha "$GITHUB_SHA" --manifest-sha256 "$manifest_sha" --plan-sha256 "$plan_sha"
RELEASE_SHA="$GITHUB_SHA" yarn -s content:release verify
```

Then run the existing crawler. Remove the sequential `content:migrate`, `portfolio:import`, `content:services` CI path.

- [ ] **Step 5: Build and publish both multi-arch targets**

Use two `docker/build-push-action@v6` steps:

- web default target tagged `${GITHUB_SHA}`;
- `target: content-release` tagged `${GITHUB_SHA}-content`.

Both use `platforms: linux/amd64,linux/arm64`, `RELEASE_SHA=${{ github.sha }}`, no `latest`, and capture returned digests.

- [ ] **Step 6: Generate and upload release-manifest.json**

`scripts/release-manifest.mjs` validates exact refs, requires different digests, and emits:

```json
{
  "schemaVersion": 1,
  "gitSha": "40 lowercase hex",
  "webImage": "ghcr.io/...@sha256:...",
  "contentImage": "ghcr.io/...@sha256:...",
  "contentManifestSha256": "64 lowercase hex",
  "ciRunId": "numeric string",
  "builtAt": "ISO-8601 UTC timestamp"
}
```

Upload it with 30-day retention and print only non-secret identifiers to the job summary.

- [ ] **Step 7: Pass exact inputs to production SSH**

Validate both refs and checksum before login, export them through `ssh-action`, and call:

```bash
bash scripts/deploy-slot.sh "$inactive" "$IMAGE_REF" "$CONTENT_IMAGE_REF" "$CONTENT_MANIFEST_SHA256"
```

Keep release gate, switch and prune order unchanged after deploy-slot succeeds.

- [ ] **Step 8: Run workflow tests and Bash parsing checks**

```bash
node --test scripts/release-manifest.test.mjs tests/ciReleaseGate.test.mjs
bash -n scripts/deploy-slot.sh scripts/release-gate.sh scripts/bootstrap-production-content.sh
```

Expected: all pass.

- [ ] **Step 9: Commit CI publication**

```bash
git add .github/workflows/docker-build.yml tests/ciReleaseGate.test.mjs scripts/release-manifest.mjs scripts/release-manifest.test.mjs
git commit -m "ci: publish code and content as one release"
```

---

### Task 10: Operator documentation and complete verification

**Files:**
- Modify: `docs/operations/production-release.md`
- Modify: `deploy/README.md`
- Modify: `tests/ciReleaseGate.test.mjs`
- Modify: `tests/deploy/bootstrap.test.mjs`

**Interfaces:**
- Consumes: final CLI, images, workflow and deployment scripts.
- Produces: exact operator runbook and complete release evidence checklist.

- [ ] **Step 1: Add failing documentation assertions**

Require both documents to contain:

```js
for (const term of [
  "content_image_ref", "content_manifest_sha256", "release-manifest.json",
  "content-release", "unowned-conflict", "orphaned-owned",
  "общая PostgreSQL", "без автоматического восстановления",
]) assert.match(source, new RegExp(term, "i"));
```

- [ ] **Step 2: Run documentation contract tests**

```bash
node --test tests/ciReleaseGate.test.mjs tests/deploy/bootstrap.test.mjs
```

Expected: missing runbook terms fail.

- [ ] **Step 3: Document first install and ordinary release with exact commands**

Runbook must show:

1. downloading/reviewing `release-manifest.json`;
2. copying exact web/content refs and checksum into protected workflow dispatch;
3. reading private plan report when `blocked:true`;
4. resolving admin/MCP conflicts by moving production text into source or explicitly restoring the approved source;
5. confirming apply can be visible through the old slot before route switch;
6. using route rollback for runtime failure and manual DB restore only after incident analysis;
7. verifying sitemap, canonical URLs, form lead and `X-Kordev-Slot` after switch.

- [ ] **Step 4: Run the complete local verification matrix**

```bash
yarn typecheck
yarn test
yarn build
yarn db:check
docker compose --env-file tests/fixtures/deploy-leads.env -f deploy/docker-compose.team.yml config >/dev/null
docker build --target content-release --build-arg "RELEASE_SHA=$(git rev-parse HEAD)" -t kordevteam-content-release:test .
docker run --rm --read-only --user 1000:1000 --entrypoint node kordevteam-content-release:test /app/content-release.mjs manifest
```

Expected: all commands exit 0; manifest report is JSON with `ok:true` and the image runs non-root/read-only.

- [ ] **Step 5: Run a clean PostgreSQL release rehearsal and crawler**

```bash
release_sha="$(git rev-parse HEAD)"
test -n "${TEST_DATABASE_URL:-}"
test "${DATABASE_URL:-}" = "$TEST_DATABASE_URL"
yarn db:migrate
manifest_report="$(RELEASE_SHA="$release_sha" yarn -s content:release manifest)"
content_manifest_sha256="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.manifestChecksum)' "$manifest_report")"
plan_report="$(RELEASE_SHA="$release_sha" yarn -s content:release plan)"
content_plan_sha256="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.planChecksum)' "$plan_report")"
RELEASE_SHA="$release_sha" yarn -s content:release apply --release-sha "$release_sha" --manifest-sha256 "$content_manifest_sha256" --plan-sha256 "$content_plan_sha256"
RELEASE_SHA="$release_sha" yarn -s content:release verify
yarn start > /tmp/kordev-content-release-runtime.log 2>&1 &
runtime_pid=$!
trap 'kill "$runtime_pid" 2>/dev/null || true; wait "$runtime_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:3001/api/health/ready >/dev/null && break
  test "$attempt" -lt 30
  sleep 2
done
yarn seo:crawl --origin http://127.0.0.1:3001
```

Expected: verify `ok:true`, 94 sitemap URLs, 15 internal URLs and zero crawler violations.

- [ ] **Step 6: Check the final diff for secrets and unrelated changes**

```bash
git diff --check
git status --short
git diff --stat HEAD~10..HEAD
rg -n "postgresql://[^[:space:]]+:[^[:space:]]+@|BEGIN (RSA |OPENSSH )?PRIVATE KEY|kdt_mcp_" --glob '!yarn.lock' .github deploy docs scripts src tests || true
```

Expected: only fixture credentials already designed for tests; no production secret or unrelated file.

- [ ] **Step 7: Commit documentation**

```bash
git add docs/operations/production-release.md deploy/README.md tests/ciReleaseGate.test.mjs tests/deploy/bootstrap.test.mjs
git commit -m "docs: document atomic content releases"
```

- [ ] **Step 8: Push and require the full CI release artifact**

```bash
git push origin main
```

Expected: validation is green; publish job emits exact web/content digests plus `release-manifest.json`. Do not dispatch production until those three artifact fields and the reviewed privacy checksum are available.
