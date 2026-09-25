import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import { createDb } from "../db/client";
import { adminUsers, mcpTokens } from "../db/schema";
import { resetTestDatabase } from "../db/testDatabase";
import { createMcpTokenRepository } from "./tokenRepository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = TEST_DATABASE_URL ? test : test.skip;
const NOW = new Date("2026-09-25T10:00:00.000Z");

databaseTest("token repository scopes listing and revocation to the owner", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createMcpTokenRepository(db);
  const [first, second] = await db.insert(adminUsers).values([
    { login: "first-mcp-owner", passwordDigest: "digest", passwordSalt: "salt" },
    { login: "second-mcp-owner", passwordDigest: "digest", passwordSalt: "salt" },
  ]).returning();

  const token = await repository.create({
    adminUserId: first.id,
    name: "Codex",
    tokenHash: "a".repeat(64),
    tokenPrefix: "kdt_mcp_abcd1234",
    scopes: ["content:read"],
    now: NOW,
    expiresAt: new Date("2026-12-24T10:00:00.000Z"),
  });

  assert.equal((await repository.listForAdmin(first.id)).length, 1);
  assert.equal((await repository.listForAdmin(second.id)).length, 0);
  assert.deepEqual(await repository.findActiveByHash("a".repeat(64), NOW), {
    tokenId: token.id,
    adminUserId: first.id,
    login: first.login,
    scopes: ["content:read"],
    expiresAt: new Date("2026-12-24T10:00:00.000Z"),
  });
  await repository.touchLastUsed(token.id, NOW);
  assert.equal((await repository.listForAdmin(first.id))[0]?.lastUsedAt?.toISOString(), NOW.toISOString());
  assert.equal(await repository.revoke(token.id, second.id, NOW), false);
  assert.equal(await repository.revoke(token.id, first.id, NOW), true);
  assert.equal(await repository.findActiveByHash("a".repeat(64), NOW), null);
  await repository.checkReady();
});

databaseTest("token repository rejects expired tokens and tokens owned by inactive administrators", async () => {
  await resetTestDatabase(TEST_DATABASE_URL);
  const db = createDb(TEST_DATABASE_URL);
  const repository = createMcpTokenRepository(db);
  const [active, inactive] = await db.insert(adminUsers).values([
    { login: "active-mcp-owner", passwordDigest: "digest", passwordSalt: "salt" },
    { login: "inactive-mcp-owner", passwordDigest: "digest", passwordSalt: "salt", active: false },
  ]).returning();
  await repository.create({
    adminUserId: active.id,
    name: "Expired",
    tokenHash: "b".repeat(64),
    tokenPrefix: "kdt_mcp_expired1",
    scopes: ["content:read"],
    now: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-01-31T00:00:00.000Z"),
  });
  await repository.create({
    adminUserId: inactive.id,
    name: "Inactive owner",
    tokenHash: "c".repeat(64),
    tokenPrefix: "kdt_mcp_inactive",
    scopes: ["media:read"],
    now: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: null,
  });

  assert.equal(await repository.findActiveByHash("b".repeat(64), NOW), null);
  assert.equal(await repository.findActiveByHash("c".repeat(64), NOW), null);
  assert.equal((await db.select().from(mcpTokens).where(eq(mcpTokens.adminUserId, active.id))).length, 1);
});
