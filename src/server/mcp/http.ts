import { Router, type RequestHandler } from "express";
import { hostHeaderValidation, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";

import { readAdminAuthConfig } from "../auth/config";
import { MCP_MAX_REQUEST_BYTES, MCP_SCOPES, type McpPrincipal, type McpScope } from "./contracts";
import { getMcpServices } from "./runtime";
import type { McpTokenService } from "./tokenService";
import { createKordevMcpServer, type McpAuditRecord, type McpServices } from "./tools";

type McpHttpDependencies = {
  tokenService?: Pick<McpTokenService, "authenticate">;
  services?: McpServices;
  trustedOrigin?: URL;
  logger?: (record: McpAuditRecord) => void;
};

const NON_EXPIRING_UNIX_SECONDS = 253_402_300_799;
const ALLOWED_HOSTS = ["kordev.team", "localhost", "127.0.0.1", "[::1]"];
const CLIENT_ID_PREFIX = "kordev-mcp:";

function encodeClientId(principal: McpPrincipal): string {
  return CLIENT_ID_PREFIX + Buffer.from(JSON.stringify({
    tokenId: principal.tokenId,
    adminUserId: principal.adminUserId,
    login: principal.login,
  }), "utf8").toString("base64url");
}

function principalFromAuthInfo(authInfo: AuthInfo | undefined): McpPrincipal {
  if (!authInfo?.clientId.startsWith(CLIENT_ID_PREFIX)) throw new Error("mcp_auth_context_invalid");
  try {
    const encoded = authInfo.clientId.slice(CLIENT_ID_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.tokenId !== "string" || typeof parsed.adminUserId !== "string" || typeof parsed.login !== "string") {
      throw new Error("mcp_auth_context_invalid");
    }
    const scopes = authInfo.scopes.filter((scope): scope is McpScope => MCP_SCOPES.includes(scope as McpScope));
    return {
      tokenId: parsed.tokenId,
      adminUserId: parsed.adminUserId,
      login: parsed.login,
      scopes,
      expiresAt: authInfo.expiresAt === NON_EXPIRING_UNIX_SECONDS ? null : new Date(authInfo.expiresAt! * 1_000),
    };
  } catch {
    throw new Error("mcp_auth_context_invalid");
  }
}

function exactOrigin(trustedOrigin: URL): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");
    if (!origin) return next();
    if (origin !== trustedOrigin.origin) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

export function createMcpRouter(dependencies: McpHttpDependencies = {}) {
  const runtime = dependencies.tokenService && dependencies.services ? undefined : getMcpServices();
  const tokenService = dependencies.tokenService ?? runtime!.token;
  const services = dependencies.services ?? runtime!;
  const trustedOrigin = dependencies.trustedOrigin ?? readAdminAuthConfig(process.env).trustedOrigin;
  const verifier: OAuthTokenVerifier = {
    async verifyAccessToken(rawToken: string): Promise<AuthInfo> {
      const principal = await tokenService.authenticate(rawToken);
      if (!principal) throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");
      return {
        token: rawToken,
        clientId: encodeClientId(principal),
        scopes: principal.scopes,
        expiresAt: principal.expiresAt
          ? Math.floor(principal.expiresAt.getTime() / 1_000)
          : NON_EXPIRING_UNIX_SECONDS,
      };
    },
  };
  const handler = createMcpHandler(
    ({ authInfo }) => createKordevMcpServer(
      principalFromAuthInfo(authInfo),
      services,
      dependencies.logger,
    ),
    { legacy: "stateless", responseMode: "json", maxRequestBodySize: MCP_MAX_REQUEST_BYTES },
  );
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: MCP_MAX_REQUEST_BYTES });
  const router = Router();
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.use(hostHeaderValidation(ALLOWED_HOSTS));
  router.use(exactOrigin(trustedOrigin));
  router.use(requireBearerAuth({ verifier }));
  router.all("/", async (request, response) => {
    await nodeHandler(request, response);
  });
  return router;
}
