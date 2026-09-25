import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import type { McpPrincipal, McpScope, McpTokenSummary } from "./contracts";
import { createMcpTokenService, parseMcpBearerToken } from "./tokenService";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN_ID = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-09-25T10:00:00.000Z");

type SavedToken = {
  adminUserId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: McpScope[];
  now: Date;
  expiresAt: Date | null;
};

function summary(input: SavedToken): McpTokenSummary {
  return {
    id: TOKEN_ID,
    name: input.name,
    tokenPrefix: input.tokenPrefix,
    scopes: input.scopes,
    createdAt: input.now,
    lastUsedAt: null,
    expiresAt: input.expiresAt,
    revokedAt: null,
  };
}

function fakeRepository(saved: SavedToken[], principal: McpPrincipal | null = null) {
  const touched: Array<{ id: string; now: Date }> = [];
  const revoked: Array<{ id: string; adminUserId: string; now: Date }> = [];
  return {
    touched,
    revoked,
    async create(input: SavedToken) {
      saved.push(input);
      return summary(input);
    },
    async listForAdmin() {
      return saved.map(summary);
    },
    async findActiveByHash() {
      return principal;
    },
    async touchLastUsed(id: string, now: Date) {
      touched.push({ id, now });
    },
    async revoke(id: string, adminUserId: string, now: Date) {
      revoked.push({ id, adminUserId, now });
      return id === TOKEN_ID && adminUserId === ADMIN_ID;
    },
    async checkReady() {},
  };
}

function serviceFor(saved: SavedToken[] = [], principal: McpPrincipal | null = null) {
  const repository = fakeRepository(saved, principal);
  return {
    repository,
    service: createMcpTokenService(repository, Buffer.alloc(32, 7), {
      now: () => NOW,
      randomBytes: () => Buffer.alloc(32, 9),
    }),
  };
}

test("issue returns a secret once and persists only its HMAC", async () => {
  const saved: SavedToken[] = [];
  const { service } = serviceFor(saved);
  const issued = await service.issue({
    adminUserId: ADMIN_ID,
    name: "Codex MacBook",
    scopes: ["content:read", "content:write"],
    ttlDays: 365,
  });

  assert.match(issued.token, /^kdt_mcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(
    saved[0]?.tokenHash,
    createHmac("sha256", Buffer.alloc(32, 7)).update(`mcp-token\0${issued.token}`).digest("hex"),
  );
  assert.equal(JSON.stringify(saved).includes(issued.token), false);
  assert.equal(issued.summary.tokenPrefix, `kdt_mcp_${issued.token.slice(8, 16)}`);
  assert.equal(issued.summary.expiresAt?.toISOString(), "2027-09-25T10:00:00.000Z");
});

test("issue trims names and deduplicates scopes in canonical order", async () => {
  const saved: SavedToken[] = [];
  const { service } = serviceFor(saved);
  await service.issue({
    adminUserId: ADMIN_ID,
    name: "  Integration token  ",
    scopes: ["media:write", "content:read", "media:write", "content:publish"],
    ttlDays: null,
  });
  assert.equal(saved[0]?.name, "Integration token");
  assert.deepEqual(saved[0]?.scopes, ["content:read", "content:publish", "media:write"]);
  assert.equal(saved[0]?.expiresAt, null);
});

test("issue rejects invalid names, scopes, and TTL", async () => {
  const { service } = serviceFor();
  const base = { adminUserId: ADMIN_ID, name: "Codex", scopes: ["content:read"] as McpScope[], ttlDays: 30 as const };
  await assert.rejects(service.issue({ ...base, name: "   " }), /mcp_token_name_invalid/);
  await assert.rejects(service.issue({ ...base, name: "x".repeat(121) }), /mcp_token_name_invalid/);
  await assert.rejects(service.issue({ ...base, scopes: [] }), /mcp_token_scopes_invalid/);
  await assert.rejects(service.issue({ ...base, scopes: ["unknown"] as McpScope[] }), /mcp_token_scopes_invalid/);
  await assert.rejects(service.issue({ ...base, ttlDays: 31 as 30 }), /mcp_token_ttl_invalid/);
});

test("Bearer parser accepts exactly one canonical Authorization value", () => {
  const token = `kdt_mcp_${Buffer.alloc(32, 9).toString("base64url")}`;
  assert.equal(parseMcpBearerToken(`Bearer ${token}`), token);
  for (const value of [undefined, "", token, `bearer ${token}`, `Bearer  ${token}`, `Bearer ${token} extra`, ["Bearer one"]]) {
    assert.equal(parseMcpBearerToken(value), null);
  }
});

test("authentication rejects malformed and inactive tokens without touching usage", async () => {
  const { service, repository } = serviceFor([], null);
  assert.equal(await service.authenticate("not-a-token"), null);
  assert.equal(await service.authenticate(`kdt_mcp_${Buffer.alloc(32, 2).toString("base64url")}`), null);
  assert.deepEqual(repository.touched, []);
});

test("successful authentication returns the principal and touches last use", async () => {
  const principal: McpPrincipal = {
    tokenId: TOKEN_ID,
    adminUserId: ADMIN_ID,
    login: "owner",
    scopes: ["content:read"],
    expiresAt: null,
  };
  const { service, repository } = serviceFor([], principal);
  const token = `kdt_mcp_${Buffer.alloc(32, 3).toString("base64url")}`;
  assert.deepEqual(await service.authenticate(token), principal);
  assert.deepEqual(repository.touched, [{ id: TOKEN_ID, now: NOW }]);
});

test("listing and revocation remain bounded to the issuing administrator", async () => {
  const saved: SavedToken[] = [];
  const { service, repository } = serviceFor(saved);
  await service.issue({ adminUserId: ADMIN_ID, name: "Codex", scopes: ["content:read"], ttlDays: 90 });
  assert.equal((await service.list(ADMIN_ID)).length, 1);
  assert.equal(await service.revoke(TOKEN_ID, "00000000-0000-4000-8000-000000000099"), false);
  assert.equal(await service.revoke(TOKEN_ID, ADMIN_ID), true);
  assert.deepEqual(repository.revoked.map(({ id, adminUserId }) => ({ id, adminUserId })), [
    { id: TOKEN_ID, adminUserId: "00000000-0000-4000-8000-000000000099" },
    { id: TOKEN_ID, adminUserId: ADMIN_ID },
  ]);
});
