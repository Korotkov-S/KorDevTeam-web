import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import type { McpScope, McpTokenSummary } from "../../server/mcp/contracts";
import { createMcpAdminAction, createMcpAdminLoader } from "./mcp.server";

const sessionToken = "a".repeat(43);
const csrf = "b".repeat(43);
const adminId = "00000000-0000-4000-8000-000000000001";
const tokenId = "00000000-0000-4000-8000-000000000003";
const fullToken = `kdt_mcp_${"c".repeat(43)}`;
const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1),
  rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"),
  sessionTtlMs: 43_200_000,
};
const principal = {
  userId: adminId,
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: csrf,
  expiresAt: new Date("2026-09-25T21:00:00.000Z"),
};
const safeSummary: McpTokenSummary = {
  id: tokenId,
  name: "Codex MacBook",
  tokenPrefix: "kdt_mcp_cccccccc",
  scopes: ["content:read", "content:write"],
  createdAt: new Date("2026-09-25T10:00:00.000Z"),
  lastUsedAt: null,
  expiresAt: new Date("2027-09-25T10:00:00.000Z"),
  revokedAt: null,
};

const auth = { authenticate: async () => principal };

function adminRequest(path: string, form?: FormData, headers: Record<string, string> = {}) {
  return new Request(`https://kordev.team${path}`, {
    method: form ? "POST" : "GET",
    body: form,
    headers: {
      cookie: createAdminCookie(sessionToken),
      origin: "https://kordev.team",
      "sec-fetch-site": "same-origin",
      "x-kordev-csp-nonce": "d".repeat(22),
      ...headers,
    },
  });
}

function createForm(overrides: { scopes?: string[]; ttlDays?: string; csrf?: string } = {}) {
  const form = new FormData();
  form.set("intent", "create");
  form.set("_csrf", overrides.csrf ?? csrf);
  form.set("name", "Codex MacBook");
  form.set("ttlDays", overrides.ttlDays ?? "365");
  for (const scope of overrides.scopes ?? ["content:read", "content:write"]) form.append("scope", scope);
  return form;
}

test("MCP admin action creates a token with selected scopes and no-store", async () => {
  type IssueInput = { adminUserId: string; name: string; scopes: readonly McpScope[]; ttlDays: 30 | 90 | 365 | null };
  let issued: IssueInput | undefined;
  const tokens = {
    async issue(input: IssueInput) { issued = input; return { token: fullToken, summary: safeSummary }; },
    async list() { return []; },
    async revoke() { return false; },
  };
  const response = await createMcpAdminAction(auth, tokens, config)({
    request: adminRequest("/admin/mcp/", createForm()), params: {}, context: {},
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(issued, {
    adminUserId: adminId,
    name: "Codex MacBook",
    scopes: ["content:read", "content:write"],
    ttlDays: 365,
  });
  assert.equal((await response.json()).token, fullToken);
});

test("MCP admin loader is owner-scoped and never returns a full token", async () => {
  let listedFor = "";
  const loader = createMcpAdminLoader(auth, {
    async issue() { throw new Error("unused"); },
    async list(adminUserId) { listedFor = adminUserId; return [safeSummary]; },
    async revoke() { return false; },
  });
  const response = await loader({ request: adminRequest("/admin/mcp/"), params: {}, context: {} });
  const body = await response.text();
  assert.equal(listedFor, adminId);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(body.includes(fullToken), false);
  assert.match(body, /"endpoint":"https:\/\/kordev\.team\/mcp"/);
});

test("MCP admin loader redirects unauthenticated visitors", async () => {
  const loader = createMcpAdminLoader({ authenticate: async () => null }, {
    async issue() { throw new Error("unused"); }, async list() { return []; }, async revoke() { return false; },
  });
  await assert.rejects(
    () => loader({ request: new Request("https://kordev.team/admin/mcp/"), params: {}, context: {} }),
    (error: unknown) => error instanceof Response && error.status === 302 &&
      error.headers.get("Location") === "/admin/login/?returnTo=%2Fadmin%2Fmcp%2F",
  );
});

test("MCP admin action rejects wrong origin and wrong CSRF", async () => {
  const action = createMcpAdminAction(auth, {
    async issue() { throw new Error("must not issue"); }, async list() { return []; }, async revoke() { return false; },
  }, config);
  const wrongOrigin = await action({
    request: adminRequest("/admin/mcp/", createForm(), { origin: "https://evil.example" }), params: {}, context: {},
  });
  const wrongCsrf = await action({
    request: adminRequest("/admin/mcp/", createForm({ csrf: "x".repeat(43) })), params: {}, context: {},
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongCsrf.status, 403);
});

test("MCP admin action validates scopes and expiration", async () => {
  const action = createMcpAdminAction(auth, {
    async issue() { throw new Error("must not issue"); }, async list() { return []; }, async revoke() { return false; },
  }, config);
  const invalidScope = await action({
    request: adminRequest("/admin/mcp/", createForm({ scopes: ["root:all"] })), params: {}, context: {},
  });
  const invalidExpiration = await action({
    request: adminRequest("/admin/mcp/", createForm({ ttlDays: "31" })), params: {}, context: {},
  });
  assert.equal(invalidScope.status, 422);
  assert.equal(invalidExpiration.status, 422);
});

test("MCP admin action revokes only through the authenticated owner", async () => {
  let revoked: { id: string; adminUserId: string } | undefined;
  const action = createMcpAdminAction(auth, {
    async issue() { throw new Error("unused"); }, async list() { return []; },
    async revoke(id, adminUserId) { revoked = { id, adminUserId }; return true; },
  }, config);
  const form = new FormData();
  form.set("intent", "revoke");
  form.set("_csrf", csrf);
  form.set("id", tokenId);
  const response = await action({ request: adminRequest("/admin/mcp/", form), params: {}, context: {} });
  assert.equal(response.status, 200);
  assert.deepEqual(revoked, { id: tokenId, adminUserId: adminId });
  assert.deepEqual(await response.json(), { revoked: true });
});

test("MCP admin action maps missing and unexpected failures safely", async () => {
  const form = new FormData();
  form.set("intent", "revoke"); form.set("_csrf", csrf); form.set("id", tokenId);
  const missing = await createMcpAdminAction(auth, {
    async issue() { throw new Error("unused"); }, async list() { return []; }, async revoke() { return false; },
  }, config)({ request: adminRequest("/admin/mcp/", form), params: {}, context: {} });
  const unavailable = await createMcpAdminAction(auth, {
    async issue() { throw new Error("secret database detail"); }, async list() { return []; }, async revoke() { return false; },
  }, config)({ request: adminRequest("/admin/mcp/", createForm()), params: {}, context: {} });
  assert.equal(missing.status, 404);
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /secret|database/i);
});
