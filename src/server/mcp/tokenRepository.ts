import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import type { createDb } from "../db/client";
import { adminUsers, mcpTokens } from "../db/schema";
import type { McpPrincipal, McpScope, McpTokenSummary } from "./contracts";

export type McpDatabase = ReturnType<typeof createDb>;

export type CreateMcpTokenRecord = {
  adminUserId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: McpScope[];
  now: Date;
  expiresAt: Date | null;
};

function toSummary(token: typeof mcpTokens.$inferSelect): McpTokenSummary {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes as McpScope[],
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
  };
}

export function createMcpTokenRepository(db: McpDatabase) {
  return {
    async create(input: CreateMcpTokenRecord): Promise<McpTokenSummary> {
      const [token] = await db.insert(mcpTokens).values({
        adminUserId: input.adminUserId,
        name: input.name,
        tokenHash: input.tokenHash,
        tokenPrefix: input.tokenPrefix,
        scopes: input.scopes,
        createdAt: input.now,
        expiresAt: input.expiresAt,
      }).returning();
      return toSummary(token);
    },

    async listForAdmin(adminUserId: string): Promise<McpTokenSummary[]> {
      const rows = await db.select().from(mcpTokens)
        .where(eq(mcpTokens.adminUserId, adminUserId))
        .orderBy(desc(mcpTokens.createdAt), desc(mcpTokens.id));
      return rows.map(toSummary);
    },

    async findActiveByHash(tokenHash: string, now: Date): Promise<McpPrincipal | null> {
      const [result] = await db.select({
        tokenId: mcpTokens.id,
        adminUserId: adminUsers.id,
        login: adminUsers.login,
        scopes: mcpTokens.scopes,
        expiresAt: mcpTokens.expiresAt,
      }).from(mcpTokens).innerJoin(adminUsers, eq(adminUsers.id, mcpTokens.adminUserId)).where(and(
        eq(mcpTokens.tokenHash, tokenHash),
        isNull(mcpTokens.revokedAt),
        or(isNull(mcpTokens.expiresAt), gt(mcpTokens.expiresAt, now)),
        eq(adminUsers.active, true),
      )).limit(1);
      return result ? { ...result, scopes: result.scopes as McpScope[] } : null;
    },

    async touchLastUsed(id: string, now: Date): Promise<void> {
      await db.update(mcpTokens).set({ lastUsedAt: now }).where(eq(mcpTokens.id, id));
    },

    async revoke(id: string, adminUserId: string, now: Date): Promise<boolean> {
      const revoked = await db.update(mcpTokens).set({ revokedAt: now }).where(and(
        eq(mcpTokens.id, id),
        eq(mcpTokens.adminUserId, adminUserId),
        isNull(mcpTokens.revokedAt),
      )).returning({ id: mcpTokens.id });
      return revoked.length === 1;
    },

    async checkReady(): Promise<void> {
      await db.select({ id: mcpTokens.id }).from(mcpTokens).limit(1);
    },
  };
}

export type McpTokenRepository = ReturnType<typeof createMcpTokenRepository>;
