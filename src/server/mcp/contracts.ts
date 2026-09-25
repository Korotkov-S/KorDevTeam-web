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

export type McpTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: McpScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type IssuedMcpToken = {
  token: string;
  summary: McpTokenSummary;
};

export const MCP_MAX_REQUEST_BYTES = 30 * 1024 * 1024;
