# KorDevTeam MCP Content Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add revocable personal MCP tokens and a protected `/mcp` endpoint that lets Codex read and safely update KorDevTeam content, upload images, and explicitly publish changes.

**Architecture:** Mount an official stateless Streamable HTTP MCP handler in the existing Express runtime before React Router. Authenticate every request against hashed PostgreSQL tokens, build the tool set from the token scopes, and route all mutations through the existing admin content and media services so validation, revisions, optimistic locking, S3 handling, and cache invalidation remain authoritative.

**Tech Stack:** Node.js 22, TypeScript, React Router 7, Express 5, PostgreSQL, Drizzle ORM, Zod 4, `@modelcontextprotocol/server` 2.1.0, `@modelcontextprotocol/node` 2.1.0, `@modelcontextprotocol/express` 2.0.1, `@modelcontextprotocol/client` 2.1.0 for protocol tests, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-25-kordev-mcp-content-access-design.md`

## Global Constraints

- The only MCP endpoint is `/mcp`; production configuration uses `https://kordev.team/mcp`.
- Bearer tokens never appear in URLs, logs, persistent HTML, Codex configuration, or plaintext database columns.
- Tokens use the format `kdt_mcp_` plus 43 base64url characters generated from 32 random bytes.
- All five existing content kinds are supported: `service`, `case`, `article`, `page`, and `faq`.
- MCP exposes no delete operation for content or media.
- New content is always created as `draft`.
- `update_content_draft` rejects published entries and must never unpublish them implicitly.
- A published entry changes only through explicit `publish_content` with both write and publish scopes when a replacement snapshot is supplied.
- Existing content validation, revisions, optimistic versions, media inspection, object-store cleanup, and cache invalidation stay authoritative.
- Images remain limited to JPG, PNG, or WebP, 20 MiB, and 40 megapixels; remote URL fetching is forbidden.
- MCP responses, token-creation responses, and authentication failures use `Cache-Control: no-store`.
- OAuth 2.1, ChatGPT app registration, legacy SSE, bulk import, settings, redirects, leads, and administrator management are outside this plan.

## Review Focus

- A published entry passed to `update_content_draft` must return `content_not_draft`, preserve its version, and remain published; Task 4 pins this behavior.
- Token creation must persist only an HMAC and safe prefix, while list and reload paths can never reconstruct the secret; Task 2 pins this behavior.
- A token missing a scope must not see or invoke the corresponding tool even when a crafted `tools/call` names it directly; Task 6 pins this behavior.
- Malformed or oversized base64 must be rejected before media service or S3 work starts; Task 5 pins this behavior.
- Invalid, expired, revoked, and inactive-owner tokens must produce indistinguishable 401 responses without leaking which check failed; Task 7 pins this behavior.

---

## File Structure

New MCP domain files:

- `src/server/mcp/contracts.ts` — scopes, token principal, snapshots, paging, and shared constants.
- `src/server/mcp/tokenRepository.ts` — PostgreSQL token persistence only.
- `src/server/mcp/tokenService.ts` — token generation, HMAC, validation, authentication, and revocation.
- `src/server/mcp/pagination.ts` — bounded offset cursor encoding used by content and media lists.
- `src/server/mcp/contentService.ts` — safe MCP-facing adapter over `AdminContentService`.
- `src/server/mcp/mediaService.ts` — bounded list and base64 upload adapter over `MediaService`.
- `src/server/mcp/tools.ts` — MCP server construction, Zod tool schemas, annotations, safe results, and structured audit events.
- `src/server/mcp/http.ts` — Express router, Bearer verifier, host/origin guards, raw-body limit, and SDK handler.
- `src/server/mcp/runtime.ts` — production dependency wiring.

New admin files:

- `src/routes/admin/mcp.server.ts` — authenticated loader/action with CSRF checks.
- `src/routes/admin/mcp.tsx` — token creation, one-time reveal, connection snippet, list, and revocation UI.

Tests live next to their units: `tokenRepository.test.ts`, `tokenService.test.ts`, `contentService.test.ts`, `mediaService.test.ts`, `tools.test.ts`, `http.test.ts`, and `src/routes/admin/mcp.test.tsx`.

Existing files changed intentionally:

- `src/server/db/schema.ts`, `src/server/db/schema.test.ts`, `drizzle/0004_mcp_tokens.sql`, `drizzle/meta/*` — token storage.
- `package.json`, `yarn.lock` — official MCP SDK dependencies.
- `src/routes.ts`, `src/routes/admin/layout.tsx` — admin page registration and navigation.
- `src/entry.server.tsx`, `server/runtime.mjs` — export and mount the MCP router.
- `scripts/postgres-backup.mjs` — include `mcp_tokens` in verified inventory.
- `docs/runbooks/mcp-content-access.md` — issue, connect, verify, rotate, and revoke instructions.

### Task 1: Add the MCP SDK and token database foundation

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/schema.test.ts`
- Create: `drizzle/0004_mcp_tokens.sql`
- Create: `drizzle/meta/0004_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `scripts/postgres-backup.mjs`

**Interfaces:**
- Produces: Drizzle table `mcpTokens` and type-safe columns consumed by `createMcpTokenRepository` in Task 2.
- Produces: runtime MCP packages at versions `@modelcontextprotocol/server@2.1.0`, `@modelcontextprotocol/node@2.1.0`, and `@modelcontextprotocol/express@2.0.1`; `hono@4.13.9` satisfies the Node adapter peer contract; `@modelcontextprotocol/client@2.1.0` is a development dependency for protocol tests.

- [ ] **Step 1: Add a failing schema test for token constraints and cascade**

Extend `src/server/db/schema.test.ts` to import `mcpTokens` and add this database test:

```ts
databaseTest("MCP tokens keep only a digest and cascade with their administrator", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const [admin] = await db.insert(adminUsers).values({
    login: "mcp-owner",
    passwordDigest: "digest",
    passwordSalt: "salt",
  }).returning();
  const [token] = await db.insert(mcpTokens).values({
    adminUserId: admin.id,
    name: "Codex MacBook",
    tokenHash: "a".repeat(64),
    tokenPrefix: "kdt_mcp_abcd1234",
    scopes: ["content:read", "content:write"],
    expiresAt: new Date(Date.now() + 86_400_000),
  }).returning();

  assert.equal(token.tokenHash, "a".repeat(64));
  assert.equal("token" in token, false);
  await db.delete(adminUsers).where(eq(adminUsers.id, admin.id));
  assert.equal((await db.select().from(mcpTokens)).length, 0);
});
```

- [ ] **Step 2: Run the focused typecheck to prove the table is missing**

Run: `yarn typecheck`

Expected: FAIL because `mcpTokens` is not exported from `src/server/db/schema.ts`.

- [ ] **Step 3: Add the Drizzle table with database-enforced invariants**

Add this shape to `src/server/db/schema.ts` after `adminSessions`:

```ts
export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id").notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenPrefix: varchar("token_prefix", { length: 24 }).notNull(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mcp_tokens_token_hash_uq").on(table.tokenHash),
    index("mcp_tokens_admin_user_id_idx").on(table.adminUserId),
    index("mcp_tokens_active_idx").on(table.revokedAt, table.expiresAt),
    check("mcp_tokens_token_hash_sha256", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("mcp_tokens_name_nonempty", sql`length(btrim(${table.name})) > 0`),
    check("mcp_tokens_scopes_nonempty", sql`cardinality(${table.scopes}) > 0`),
    check("mcp_tokens_expiry_valid", sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`),
  ],
);
```

Add an application-level scope validator in Task 2; the database only enforces non-empty arrays because PostgreSQL check syntax should not duplicate the TypeScript allowlist.

- [ ] **Step 4: Generate and inspect the append-only migration**

Run: `yarn db:generate --name mcp_tokens`

Expected: `drizzle/0004_mcp_tokens.sql`, `drizzle/meta/0004_snapshot.json`, and the next `_journal.json` entry are created. Inspect the SQL and confirm it creates only `mcp_tokens`, its checks, indexes, unique hash, and the cascading foreign key.

- [ ] **Step 5: Install the exact stable MCP packages**

Run:

```bash
yarn add @modelcontextprotocol/server@2.1.0 @modelcontextprotocol/node@2.1.0 @modelcontextprotocol/express@2.0.1 hono@4.13.9
yarn add -D @modelcontextprotocol/client@2.1.0
```

Expected: `package.json` and `yarn.lock` change; no second incompatible Zod version is introduced. Confirm with `yarn why zod`.

- [ ] **Step 6: Include the table in backup inventory verification**

Add `public.mcp_tokens` to `requiredTables` in `scripts/postgres-backup.mjs`. Do not add token contents to the manifest; only table inventory/count verification is required.

- [ ] **Step 7: Run schema and migration checks**

Run:

```bash
yarn db:check
yarn typecheck
yarn test
```

Expected: migration check, typecheck, and the full suite PASS. When `TEST_DATABASE_URL` is configured, the new cascade test runs rather than skips.

- [ ] **Step 8: Commit the foundation**

```bash
git add package.json yarn.lock src/server/db/schema.ts src/server/db/schema.test.ts drizzle scripts/postgres-backup.mjs
git commit -m "feat(mcp): add token persistence foundation"
```

### Task 2: Implement token issuance, authentication, listing, and revocation

**Files:**
- Create: `src/server/mcp/contracts.ts`
- Create: `src/server/mcp/tokenRepository.ts`
- Create: `src/server/mcp/tokenRepository.test.ts`
- Create: `src/server/mcp/tokenService.ts`
- Create: `src/server/mcp/tokenService.test.ts`
- Create: `src/server/mcp/runtime.ts`

**Interfaces:**
- Produces: `MCP_SCOPES`, `McpScope`, `McpPrincipal`, `IssuedMcpToken`, and `McpTokenSummary` from `contracts.ts`.
- Produces: `createMcpTokenRepository(db)` with `create`, `listForAdmin`, `findActiveByHash`, `touchLastUsed`, `revoke`, and `checkReady`.
- Produces: `createMcpTokenService(repository, hmacKey, runtime?)` with `issue`, `list`, `authenticate`, and `revoke`.
- Produces: `getMcpTokenService()` and `checkMcpReady()` for admin, HTTP wiring, and production readiness.

- [ ] **Step 1: Define contracts and write failing service tests**

Define the exact scope tuple in `contracts.ts`:

```ts
export const MCP_SCOPES = [
  "content:read",
  "content:write",
  "content:publish",
  "media:read",
  "media:write",
] as const;
export type McpScope = typeof MCP_SCOPES[number];
export type McpPrincipal = {
  tokenId: string;
  adminUserId: string;
  login: string;
  scopes: McpScope[];
  expiresAt: Date | null;
};
export const MCP_MAX_REQUEST_BYTES = 30 * 1024 * 1024;
```

In `tokenService.test.ts`, use an in-memory fake repository and pin these cases:

```ts
test("issue returns a secret once and persists only its HMAC", async () => {
  const saved: Record<string, unknown>[] = [];
  const service = createMcpTokenService(fakeRepository(saved), Buffer.alloc(32, 7), {
    now: () => new Date("2026-09-25T10:00:00.000Z"),
    randomBytes: () => Buffer.alloc(32, 9),
  });
  const issued = await service.issue({
    adminUserId: ADMIN_ID,
    name: "Codex MacBook",
    scopes: ["content:read", "content:write"],
    ttlDays: 365,
  });
  assert.match(issued.token, /^kdt_mcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(saved[0]?.tokenHash, createHmac("sha256", Buffer.alloc(32, 7))
    .update(`mcp-token\0${issued.token}`).digest("hex"));
  assert.equal(JSON.stringify(saved).includes(issued.token), false);
});
```

Also add tests for duplicate scopes, unknown scopes, blank/overlong names, invalid TTL, malformed Bearer headers, expired/revoked records, inactive owners, successful authentication, and owner-bounded revocation.

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --import tsx --test src/server/mcp/tokenService.test.ts`

Expected: FAIL because `createMcpTokenService` and contracts do not exist.

- [ ] **Step 3: Implement the repository and service**

Use domain-separated HMAC and a strict token regex:

```ts
const TOKEN_PATTERN = /^kdt_mcp_[A-Za-z0-9_-]{43}$/;
const tokenHash = (key: Buffer, token: string) => createHmac("sha256", key)
  .update(`mcp-token\0${token}`).digest("hex");

async function authenticate(rawToken: string): Promise<McpPrincipal | null> {
  if (!TOKEN_PATTERN.test(rawToken)) return null;
  const principal = await repository.findActiveByHash(tokenHash(hmacKey, rawToken), runtime.now());
  if (!principal) return null;
  await repository.touchLastUsed(principal.tokenId, runtime.now());
  return principal;
}
```

`issue` trims the name, deduplicates scopes in `MCP_SCOPES` order, computes `expiresAt` from `ttlDays` (`30 | 90 | 365 | null`), saves only the HMAC and `kdt_mcp_` plus the first eight secret characters as `tokenPrefix`, and returns `{ token, summary }`. `list` returns only safe columns. `revoke` requires both token ID and issuing administrator ID.

The repository lookup must join `admin_users`, require `active = true`, `revoked_at IS NULL`, and `expires_at IS NULL OR expires_at > now` in the SQL query rather than filtering in memory. `checkReady` performs a bounded `SELECT id FROM mcp_tokens LIMIT 1`; its purpose is table/migration presence, not token existence.

- [ ] **Step 4: Add database repository tests**

In `tokenRepository.test.ts`, reset `kordev_test`, create two admins, and prove:

```ts
assert.equal((await repository.listForAdmin(first.id)).length, 1);
assert.equal((await repository.listForAdmin(second.id)).length, 0);
assert.equal(await repository.revoke(token.id, second.id, now), false);
assert.equal(await repository.revoke(token.id, first.id, now), true);
assert.equal(await repository.findActiveByHash("a".repeat(64), now), null);
```

- [ ] **Step 5: Wire the production singleton**

In `runtime.ts`, derive the HMAC key from `readAdminAuthConfig(process.env).sessionHmacKey` and create the repository from `getDb()`. Keep the singleton lazy, matching `src/server/admin/runtime.ts`. Export `checkMcpReady()` as a thin call to the repository readiness probe.

- [ ] **Step 6: Run token tests and typecheck**

Run:

```bash
node --import tsx --test src/server/mcp/tokenService.test.ts src/server/mcp/tokenRepository.test.ts
yarn typecheck
```

Expected: all available tests PASS; the repository test skips only when `TEST_DATABASE_URL` is absent.

- [ ] **Step 7: Commit token management**

```bash
git add src/server/mcp
git commit -m "feat(mcp): issue and revoke scoped tokens"
```

### Task 3: Add the protected MCP token administration page

**Files:**
- Create: `src/routes/admin/mcp.server.ts`
- Create: `src/routes/admin/mcp.tsx`
- Create: `src/routes/admin/mcp.test.tsx`
- Modify: `src/routes.ts`
- Modify: `src/routes/admin/layout.tsx`

**Interfaces:**
- Consumes: `getMcpTokenService()` and `McpScope` from Task 2.
- Produces: `/admin/mcp/` loader/action and the only browser UI allowed to issue or revoke tokens.

- [ ] **Step 1: Write failing loader/action tests**

Use the same fake principal, cookie, CSRF, and injected-service style as `src/routes/admin/media.test.tsx`. Pin these behaviors:

```ts
test("MCP admin action creates a token with selected scopes and no-store", async () => {
  const form = new FormData();
  form.set("intent", "create");
  form.set("_csrf", csrf);
  form.set("name", "Codex MacBook");
  form.set("ttlDays", "365");
  form.append("scope", "content:read");
  form.append("scope", "content:write");
  const response = await createMcpAdminAction(auth, tokens, config)({
    request: adminRequest("/admin/mcp/", form), params: {}, context: {},
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match((await response.json()).token, /^kdt_mcp_/);
});
```

Add tests for unauthenticated redirect, wrong origin, wrong CSRF, invalid scope, invalid expiration, owner-scoped list, successful revoke, and a loader response that never contains any full token.

- [ ] **Step 2: Run the route tests and verify failure**

Run: `node --import tsx --test src/routes/admin/mcp.test.tsx`

Expected: FAIL because the route module does not exist.

- [ ] **Step 3: Implement the server loader/action**

Export injectable factories with these signatures:

```ts
export function createMcpAdminLoader(auth: Authenticator, tokens: TokenActions): LoaderFunction;
export function createMcpAdminAction(
  auth: Authenticator,
  tokens: TokenActions,
  config: AdminAuthConfig,
): ActionFunction;
```

The loader calls `requireAdminPage`, lists only `principal.userId` tokens, and returns `{ tokens, endpoint }` with admin no-store headers. The action reads form data only after `verifyAdminMutationRequest`; `create` maps repeated `scope` fields and the four supported expiry choices, while `revoke` passes both token ID and `principal.userId`.

Map validation to 422, missing token to 404, conflict to 409, CSRF/origin failures to 403, and unexpected failures to a generic 503 Russian message without exception details.

- [ ] **Step 4: Build the page and one-time reveal**

Implement `mcp.tsx` with `useLoaderData`, `useActionData`, and the CSRF token from `useMatches`. The creation response is rendered only from current action data:

```tsx
{actionData?.token ? (
  <section aria-live="polite" className="rounded-xl border border-primary bg-card p-5">
    <h2 className="text-xl font-semibold">Сохраните токен сейчас</h2>
    <p className="mt-2 text-sm text-muted-foreground">После обновления страницы он больше не показывается.</p>
    <code className="mt-4 block break-all rounded-lg bg-muted p-3">{actionData.token}</code>
    <button type="button" onClick={() => navigator.clipboard.writeText(actionData.token!)}>Копировать</button>
  </section>
) : null}
```

Render production/local endpoint guidance, the Codex TOML snippet without a token, checked-by-default scope boxes, expiry select defaulting to 365, and a token table with prefix, scopes, created/last-used/expires/revoked timestamps and CSRF-protected revoke forms.

- [ ] **Step 5: Register navigation and route**

Add `route("admin/mcp/", "routes/admin/mcp.tsx")` inside the existing admin layout in `src/routes.ts`. Add `[/admin/mcp/, "MCP-доступ"]` before settings in `src/routes/admin/layout.tsx`.

- [ ] **Step 6: Run route tests, typecheck, and a focused render check**

Run:

```bash
node --import tsx --test src/routes/admin/mcp.test.tsx src/routes/admin/routes.test.tsx
yarn typecheck
```

Expected: PASS, with the new route covered by authenticated navigation tests.

- [ ] **Step 7: Commit the admin page**

```bash
git add src/routes.ts src/routes/admin/layout.tsx src/routes/admin/mcp.server.ts src/routes/admin/mcp.tsx src/routes/admin/mcp.test.tsx
git commit -m "feat(admin): manage MCP access tokens"
```

### Task 4: Build the safe MCP-facing content adapter

**Files:**
- Create: `src/server/mcp/pagination.ts`
- Create: `src/server/mcp/pagination.test.ts`
- Create: `src/server/mcp/contentService.ts`
- Create: `src/server/mcp/contentService.test.ts`

**Interfaces:**
- Consumes: `AdminContentService` methods `list`, `getEditorData`, `save`, and `unpublish`.
- Produces: `createMcpContentService(admin)` with `list`, `get`, `createDraft`, `updateDraft`, `publish`, and `unpublish`.
- Produces: `McpContentSnapshot` as the full editable state without `id`, `expectedVersion`, or `intent`.

- [ ] **Step 1: Write failing pagination and content safety tests**

Pin cursor bounds in `pagination.test.ts`: invalid base64, negative offsets, limit zero, and limit above 100 all reject with `mcp_pagination_invalid`; a valid cursor round-trips.

In `contentService.test.ts`, use a fake `AdminContentService` and include the critical published-content regression:

```ts
test("updateDraft never turns a published entry into a draft", async () => {
  let saves = 0;
  const service = createMcpContentService(fakeAdmin({
    async getEditorData() { return editorData({ status: "published", version: 4 }); },
    async save() { saves += 1; throw new Error("must_not_write"); },
  }));
  await assert.rejects(
    () => service.updateDraft(ENTRY_ID, 4, validSnapshot(), ACTOR_ID),
    /content_not_draft/,
  );
  assert.equal(saves, 0);
});
```

Add tests for exact kind+slug lookup, bounded pages, create forced to draft, full-snapshot update, stale version propagation, publish-current-draft, atomic replacement of a published entry, write+publish requirement surfaced to the caller, and unpublish delegation.

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --import tsx --test src/server/mcp/pagination.test.ts src/server/mcp/contentService.test.ts`

Expected: FAIL because the adapters do not exist.

- [ ] **Step 3: Implement bounded cursor paging**

Use an opaque base64url JSON cursor containing only an integer offset:

```ts
export function decodePage(cursor: string | undefined, limit = 50): { offset: number; limit: number } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("mcp_pagination_invalid");
  if (!cursor) return { offset: 0, limit };
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!parsed || !Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error("mcp_pagination_invalid");
  return { offset: parsed.offset, limit };
}
```

Catch JSON/base64 failures and normalize them to the same error code. `pageOf` slices an already bounded in-memory list and emits `nextCursor` only when more rows exist. This intentionally reuses the small existing admin lists instead of introducing a second SQL paging implementation.

- [ ] **Step 4: Implement the content adapter**

Define a snapshot that exactly matches the current admin command fields:

```ts
export type McpContentSnapshot = Omit<AdminContentCommand, "id" | "expectedVersion" | "intent">;
```

`createDraft` calls `admin.save({ ...snapshot, intent: "draft" }, actorId)`. `updateDraft` first loads editor data, checks version and `status === "draft"`, then calls `admin.save` with the full snapshot and `intent: "draft"`.

`publish` has two paths:

```ts
async function publish(id: string, expectedVersion: number, actorId: string, snapshot?: McpContentSnapshot) {
  const current = await admin.getEditorData(id);
  if (current.entry.version !== expectedVersion) throw new Error("content_version_conflict");
  const next = snapshot ?? snapshotFromEditorData(current);
  return admin.save({ ...next, id, expectedVersion, intent: "publish" }, actorId);
}
```

When `snapshot` is absent, only an existing draft is accepted. When it is present, a draft or published entry can be atomically validated and published. Never call `unpublish` from update or publish.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
node --import tsx --test src/server/mcp/pagination.test.ts src/server/mcp/contentService.test.ts
yarn typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the content adapter**

```bash
git add src/server/mcp/pagination.ts src/server/mcp/pagination.test.ts src/server/mcp/contentService.ts src/server/mcp/contentService.test.ts
git commit -m "feat(mcp): add safe content operations"
```

### Task 5: Build the bounded MCP-facing media adapter

**Files:**
- Create: `src/server/mcp/mediaService.ts`
- Create: `src/server/mcp/mediaService.test.ts`

**Interfaces:**
- Consumes: `MediaService.list` and `MediaService.upload`.
- Consumes: `decodePage` and `pageOf` from Task 4.
- Produces: `createMcpMediaService(media)` with `list` and `uploadImage`.

- [ ] **Step 1: Write failing media adapter tests**

Pin search/paging and ensure malformed or oversized base64 never calls the media service:

```ts
test("upload rejects oversized base64 before media work", async () => {
  let uploads = 0;
  const service = createMcpMediaService({
    async upload() { uploads += 1; throw new Error("must_not_upload"); },
    async list() { return []; },
  } as never);
  await assert.rejects(() => service.uploadImage({
    filename: "large.png",
    mimeType: "image/png",
    base64Data: "A".repeat(MAX_MCP_BASE64_CHARS + 1),
    altText: "Большое изображение",
    decorative: false,
  }, ACTOR_ID), /media_size_invalid/);
  assert.equal(uploads, 0);
});
```

Add malformed padding/alphabet, empty file, blank or over-255-character filename, unsupported declared MIME, required alt text, decorative image, valid decode, underlying inspection error propagation, case-insensitive alt search, and limit/cursor tests.

- [ ] **Step 2: Run the test and verify failure**

Run: `node --import tsx --test src/server/mcp/mediaService.test.ts`

Expected: FAIL because `createMcpMediaService` does not exist.

- [ ] **Step 3: Implement strict preflight and delegation**

Calculate `MAX_MCP_BASE64_CHARS = Math.ceil(MAX_MEDIA_BYTES / 3) * 4`. Reject input longer than that before `Buffer.from`. Validate the base64 alphabet and canonical re-encoding, then require decoded bytes `1..MAX_MEDIA_BYTES`.

Allow only `image/jpeg`, `image/png`, and `image/webp` as declared MIME values. Validate `filename` as a trimmed 1–255 character display name but do not persist or use it as an object key. Pass decoded bytes, MIME, alt/decorative metadata, and actor ID to the existing media service. Because `MediaService.upload` returns the storage row while `MediaService.list` adds presentation URLs, resolve the returned ID once through `media.list()` and return only the matching presented asset fields: `id`, `publicUrl`, dimensions, MIME, alt/decorative, and version. If the just-uploaded ID is absent, fail with `media_not_found` rather than inventing a URL.

- [ ] **Step 4: Run the adapter tests and typecheck**

Run:

```bash
node --import tsx --test src/server/mcp/mediaService.test.ts src/server/media/service.test.ts
yarn typecheck
```

Expected: PASS; existing media cleanup and inspection tests remain green.

- [ ] **Step 5: Commit the media adapter**

```bash
git add src/server/mcp/mediaService.ts src/server/mcp/mediaService.test.ts
git commit -m "feat(mcp): add bounded image operations"
```

### Task 6: Register scoped MCP tools and safe structured results

**Files:**
- Create: `src/server/mcp/tools.ts`
- Create: `src/server/mcp/tools.test.ts`
- Modify: `src/server/mcp/runtime.ts`

**Interfaces:**
- Consumes: `McpPrincipal`, `createMcpContentService`, and `createMcpMediaService`.
- Produces: `createKordevMcpServer(principal, services, logger?) => McpServer`.
- Produces: registered tools `list_content`, `get_content`, `create_content_draft`, `update_content_draft`, `publish_content`, `unpublish_content`, `list_media`, and `upload_image` according to scopes.

- [ ] **Step 1: Write failing in-memory MCP tool tests**

Use `Client` and `InMemoryTransport` from the official SDK to connect to the server without HTTP. Assert tool lists by scope:

```ts
test("read-only token sees no write, publish, upload, or delete tools", async () => {
  const server = createKordevMcpServer(principal(["content:read", "media:read"]), services());
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  const names = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(names, ["get_content", "list_content", "list_media"]);
});
```

Add tests for every scope combination, no delete tools under full scopes, strict unknown-field rejection, optimistic version error shape, publication requiring both scopes when a snapshot is supplied, annotations (`readOnlyHint`, `destructiveHint: false`, `openWorldHint: false`), structuredContent shape, and audit records that contain no body text or base64.

- [ ] **Step 2: Run tool tests and verify failure**

Run: `node --import tsx --test src/server/mcp/tools.test.ts`

Expected: FAIL because `createKordevMcpServer` does not exist.

- [ ] **Step 3: Implement strict schemas and conditional registration**

Create one `McpServer` per request:

```ts
const server = new McpServer(
  { name: "kordev-site", version: "1.0.0" },
  { instructions: "Read the current version before updates. Draft writes never publish. Use publish_content explicitly for live changes." },
);
```

Use `z.strictObject` for every input and explicit output schemas. Register read tools only with read scopes, draft tools only with `content:write`, publish/unpublish only with `content:publish`, and `publish_content` with replacement snapshot only when the principal also has `content:write`. Register upload only with `media:write` and list media only with `media:read`.

Each handler returns both forms:

```ts
return {
  content: [{ type: "text", text: JSON.stringify(result) }],
  structuredContent: { ...result },
};
```

Normalize known domain errors into `isError: true` with `{ code, message }`; all unknown failures become `internal_error`. Do not include stack, SQL, token, full Markdown, or base64 in audit records.

- [ ] **Step 4: Wire production services**

Extend `runtime.ts` with `getMcpServices()` returning singleton token, content, and media adapters. Reuse `getAdminContentService()` and `getMediaService()`; do not create alternate repositories for their domain mutations.

- [ ] **Step 5: Run tool tests and typecheck**

Run:

```bash
node --import tsx --test src/server/mcp/tools.test.ts
yarn typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit MCP tools**

```bash
git add src/server/mcp/tools.ts src/server/mcp/tools.test.ts src/server/mcp/runtime.ts
git commit -m "feat(mcp): expose scoped content and media tools"
```

### Task 7: Mount authenticated Streamable HTTP at `/mcp`

**Files:**
- Create: `src/server/mcp/http.ts`
- Create: `src/server/mcp/http.test.ts`
- Modify: `src/entry.server.tsx`
- Modify: `server/runtime.mjs`
- Modify: `tests/runtimeApiComposition.test.mjs`
- Modify: `tests/deploy/readiness.test.mjs`

**Interfaces:**
- Consumes: token service and `createKordevMcpServer` from Tasks 2 and 6.
- Produces: `createMcpRouter(dependencies?) => express.Router` exported by the server build.
- Produces: live `/mcp` before canonical SSR and without the general `/api` body parsers.

- [ ] **Step 1: Write failing HTTP authentication and protocol tests**

Start an Express app on `127.0.0.1:0` with an injected fake token service. Test missing, malformed, expired, revoked, and inactive-owner cases through the same null result and assert identical safe responses:

```ts
for (const authorization of [undefined, "Basic abc", "Bearer invalid", "Bearer expired-token"]) {
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.text()).includes("expired"), false);
}
```

Add tests for wrong Host, foreign Origin, acceptable no-Origin Codex request, body above the configured MCP limit, modern `server/discover`, legacy stateless initialize/tools/list, two parallel callers with different scopes, and a successful tool call whose logs contain safe IDs but not Authorization or arguments.

- [ ] **Step 2: Run HTTP tests and verify failure**

Run: `node --import tsx --test src/server/mcp/http.test.ts`

Expected: FAIL because `createMcpRouter` does not exist.

- [ ] **Step 3: Implement verifier and handler**

Use the official v2 handler and adapters:

```ts
const handler = createMcpHandler(
  ({ authInfo }) => createKordevMcpServer(principalFromAuthInfo(authInfo), services, logger),
  { legacy: "stateless", responseMode: "json", maxRequestBodySize: MCP_MAX_REQUEST_BYTES },
);
const nodeHandler = toNodeHandler(handler);
```

Build an `OAuthTokenVerifier` whose `verifyAccessToken(rawToken)` calls the token service and throws the SDK invalid-token error for every null result. Encode `adminUserId` and `tokenId` into a reversible server-only `clientId` value, pass scopes unchanged, and convert token expiry to Unix seconds; use Unix `253402300799` for non-expiring tokens.

Mount these middlewares in order on the router:

1. no-store header;
2. allowed Host validation for `kordev.team`, `localhost`, `127.0.0.1`, and `[::1]`;
3. optional Origin validation allowing only the configured trusted origin;
4. `requireBearerAuth({ verifier })` while the request body is still unread;
5. `router.all("/", (req, res) => void nodeHandler(req, res))`.

Do not attach `express.json()` to this route: `createMcpHandler` must read the raw request and enforce `MCP_MAX_REQUEST_BYTES` itself. This authenticates before allocating a large JSON/base64 body and avoids interfering with `/admin` or `/api` streams. Do not add OAuth metadata routes: static Codex Bearer configuration is the supported first-version client.

- [ ] **Step 4: Export and mount the router before SSR**

Add `export { createMcpRouter } from "./server/mcp/http";` to `src/entry.server.tsx`.

In `server/runtime.mjs`, mount it after proxy/security header middleware and before canonicalization, `/api` composition, static assets, and React Router:

```js
app.use("/mcp", build.entry.module.createMcpRouter());
```

The MCP router owns only `/mcp`; it must not parse bodies for `/admin` or `/api`.

- [ ] **Step 5: Require the MCP migration in application readiness**

Import `checkMcpReady` in `src/entry.server.tsx` and call it immediately after `checkDatabaseReady()` inside `checkApplicationReady()`. Extend `tests/deploy/readiness.test.mjs` so a missing `mcp_tokens` readiness probe rejects readiness, while a successful probe still reaches the existing lead/admin/media configuration checks.

- [ ] **Step 6: Extend runtime composition regression coverage**

In `tests/runtimeApiComposition.test.mjs`, build an app with a sentinel MCP router and prove `/mcp` reaches it while `/admin/action` bodies remain unread for React Router. Keep the existing `/api/leads` and readiness assertions.

- [ ] **Step 7: Run HTTP, runtime, type, and build checks**

Run:

```bash
node --import tsx --test src/server/mcp/http.test.ts
node --test tests/runtimeApiComposition.test.mjs tests/deploy/readiness.test.mjs
yarn typecheck
yarn build
```

Expected: PASS; production build exports `createMcpRouter` and no React Router route is generated for `/mcp`.

- [ ] **Step 8: Commit HTTP integration**

```bash
git add src/server/mcp/http.ts src/server/mcp/http.test.ts src/entry.server.tsx server/runtime.mjs tests/runtimeApiComposition.test.mjs tests/deploy/readiness.test.mjs
git commit -m "feat(mcp): serve authenticated Streamable HTTP"
```

### Task 8: Add operator documentation and run end-to-end verification

**Files:**
- Create: `docs/runbooks/mcp-content-access.md`
- Modify only if verification exposes a defect: files owned by Tasks 1–7 and their tests.

**Interfaces:**
- Consumes: completed `/admin/mcp/` and `/mcp` functionality.
- Produces: repeatable local and production issue/connect/revoke procedure.

- [ ] **Step 1: Write the runbook**

Document these exact operations without including a real secret:

```toml
[mcp_servers.kordev_site]
url = "https://kordev.team/mcp"
bearer_token_env_var = "KORDEV_MCP_TOKEN"
```

Cover: apply migration, deploy, log into `/admin/mcp/`, issue a least-privilege token, save it to `KORDEV_MCP_TOKEN`, configure Codex, restart/reload Codex, run `list_content`, create a disposable draft, upload a small fixture image, publish only after explicit review, revoke the token, and verify the next call returns 401. Include rotation and incident revocation procedures.

- [ ] **Step 2: Run every focused MCP test together**

Run:

```bash
node --import tsx --test \
  src/server/mcp/pagination.test.ts \
  src/server/mcp/tokenService.test.ts \
  src/server/mcp/tokenRepository.test.ts \
  src/server/mcp/contentService.test.ts \
  src/server/mcp/mediaService.test.ts \
  src/server/mcp/tools.test.ts \
  src/server/mcp/http.test.ts \
  src/routes/admin/mcp.test.tsx
```

Expected: all non-database tests PASS; database tests PASS when `TEST_DATABASE_URL` is set and otherwise report only the established skip behavior.

- [ ] **Step 3: Run full project verification**

Run:

```bash
yarn db:check
yarn typecheck
yarn test
yarn build
git diff --check
```

Expected: every command exits 0 and `git diff --check` prints nothing.

- [ ] **Step 4: Perform a local Codex smoke test**

With the production-mode server running on port 3003 and a test database migrated:

1. Create a token in `http://127.0.0.1:3003/admin/mcp/`.
2. Set `KORDEV_MCP_TOKEN` only in the local environment.
3. Point a temporary Codex MCP entry to `http://127.0.0.1:3003/mcp`.
4. Confirm tools/list matches scopes.
5. Create a disposable draft and verify it appears in the admin editor with version 1.
6. Update it with expectedVersion 1 and verify revision/version 2.
7. Upload a small PNG and verify the returned public URL loads.
8. Revoke the token and verify the next tool call returns 401.
9. Delete the disposable records only through the existing admin UI after the smoke test; MCP itself must still expose no delete tool.

- [ ] **Step 5: Review the final diff for secret and destructive-surface regressions**

Run:

```bash
rg -n "kdt_mcp_[A-Za-z0-9_-]{20,}|Authorization:" src server docs drizzle --glob '!**/*.test.*'
rg -n "delete|hardDelete|deleteUnused" src/server/mcp src/routes/admin/mcp* 
```

Expected: no real token value; `Authorization:` appears only in generic documentation/code; no delete or hard-delete operation is registered by MCP.

- [ ] **Step 6: Commit the runbook and any verified corrections**

```bash
git add docs/runbooks/mcp-content-access.md src server tests package.json yarn.lock drizzle scripts
git commit -m "docs(mcp): add operations and verification runbook"
```

The implementation is complete only after the final verification output is recorded in the task handoff and the local token used for smoke testing is revoked.
