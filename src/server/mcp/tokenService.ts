import { createHmac, randomBytes as cryptoRandomBytes } from "node:crypto";

import {
  MCP_SCOPES,
  type IssuedMcpToken,
  type McpPrincipal,
  type McpScope,
  type McpTokenSummary,
} from "./contracts";
import type { McpTokenRepository } from "./tokenRepository";

const TOKEN_PATTERN = /^kdt_mcp_[A-Za-z0-9_-]{43}$/;
const VALID_TTLS = new Set<30 | 90 | 365 | null>([30, 90, 365, null]);

type TokenRuntime = {
  now: () => Date;
  randomBytes: (size: number) => Buffer;
};

type IssueMcpTokenInput = {
  adminUserId: string;
  name: string;
  scopes: readonly McpScope[];
  ttlDays: 30 | 90 | 365 | null;
};

const defaultRuntime: TokenRuntime = {
  now: () => new Date(),
  randomBytes: cryptoRandomBytes,
};

function hashToken(key: Buffer, token: string): string {
  return createHmac("sha256", key).update(`mcp-token\0${token}`).digest("hex");
}

function normalizeScopes(scopes: readonly McpScope[]): McpScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some(scope => !MCP_SCOPES.includes(scope))) {
    throw new Error("mcp_token_scopes_invalid");
  }
  const requested = new Set(scopes);
  return MCP_SCOPES.filter(scope => requested.has(scope));
}

export function parseMcpBearerToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^Bearer (kdt_mcp_[A-Za-z0-9_-]{43})$/.exec(value);
  return match?.[1] ?? null;
}

export function createMcpTokenService(
  repository: McpTokenRepository,
  hmacKey: Buffer,
  overrides: Partial<TokenRuntime> = {},
) {
  if (hmacKey.byteLength < 32) throw new Error("mcp_token_hmac_key_invalid");
  const runtime = { ...defaultRuntime, ...overrides };

  return {
    async issue(input: IssueMcpTokenInput): Promise<IssuedMcpToken> {
      const name = input.name.trim();
      if (name.length === 0 || name.length > 120) throw new Error("mcp_token_name_invalid");
      if (!VALID_TTLS.has(input.ttlDays)) throw new Error("mcp_token_ttl_invalid");
      const scopes = normalizeScopes(input.scopes);
      const now = runtime.now();
      const secret = runtime.randomBytes(32).toString("base64url");
      const token = `kdt_mcp_${secret}`;
      const expiresAt = input.ttlDays === null
        ? null
        : new Date(now.getTime() + input.ttlDays * 86_400_000);
      const summary = await repository.create({
        adminUserId: input.adminUserId,
        name,
        tokenHash: hashToken(hmacKey, token),
        tokenPrefix: `kdt_mcp_${secret.slice(0, 8)}`,
        scopes,
        now,
        expiresAt,
      });
      return { token, summary };
    },

    list(adminUserId: string): Promise<McpTokenSummary[]> {
      return repository.listForAdmin(adminUserId);
    },

    async authenticate(rawToken: string): Promise<McpPrincipal | null> {
      if (!TOKEN_PATTERN.test(rawToken)) return null;
      const now = runtime.now();
      const principal = await repository.findActiveByHash(hashToken(hmacKey, rawToken), now);
      if (!principal) return null;
      await repository.touchLastUsed(principal.tokenId, now);
      return principal;
    },

    revoke(id: string, adminUserId: string): Promise<boolean> {
      return repository.revoke(id, adminUserId, runtime.now());
    },
  };
}

export type McpTokenService = ReturnType<typeof createMcpTokenService>;
