import type { ActionFunction, ActionFunctionArgs, LoaderFunction, LoaderFunctionArgs } from "react-router";

import { readAdminAuthConfig, type AdminAuthConfig } from "../../server/auth/config";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { MCP_SCOPES, type McpScope } from "../../server/mcp/contracts";
import { getMcpTokenService } from "../../server/mcp/runtime";
import type { McpTokenService } from "../../server/mcp/tokenService";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

type Authenticator = Pick<AdminAuthService, "authenticate">;
type TokenActions = Pick<McpTokenService, "issue" | "list" | "revoke">;

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function parseScopes(form: FormData): McpScope[] {
  const values = form.getAll("scope");
  if (values.length === 0 || values.some(value => typeof value !== "string" || !MCP_SCOPES.includes(value as McpScope))) {
    throw new Error("mcp_token_scopes_invalid");
  }
  return values as McpScope[];
}

function parseTtl(value: string): 30 | 90 | 365 | null {
  if (value === "never") return null;
  const ttl = Number(value);
  if (ttl !== 30 && ttl !== 90 && ttl !== 365) throw new Error("mcp_token_ttl_invalid");
  return ttl;
}

function errorResponse(request: Request, error: unknown): Response {
  const code = error instanceof Error ? error.message : "mcp_tokens_unavailable";
  const known: Record<string, { status: number; error: string }> = {
    mcp_token_name_invalid: { status: 422, error: "Укажите название токена длиной до 120 символов." },
    mcp_token_scopes_invalid: { status: 422, error: "Выберите хотя бы одно допустимое право доступа." },
    mcp_token_ttl_invalid: { status: 422, error: "Выберите допустимый срок действия токена." },
    mcp_token_id_invalid: { status: 422, error: "Некорректный идентификатор токена." },
    mcp_token_not_found: { status: 404, error: "Токен не найден или уже отозван." },
    mcp_token_conflict: { status: 409, error: "Токен уже изменён. Обновите страницу." },
    admin_origin_invalid: { status: 403, error: "Не удалось проверить источник запроса." },
    admin_csrf_invalid: { status: 403, error: "Сессия формы устарела. Обновите страницу." },
  };
  const result = known[code] ?? { status: 503, error: "Управление MCP-доступом временно недоступно. Попробуйте позже." };
  return Response.json({ error: result.error }, {
    status: result.status,
    headers: adminHeaders(requestCspNonce(request)),
  });
}

export function createMcpAdminLoader(auth: Authenticator, tokens: TokenActions): LoaderFunction {
  return async ({ request }: LoaderFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    try {
      return Response.json({
        tokens: await tokens.list(principal.userId),
        endpoint: new URL("/mcp", request.url).href,
      }, { headers: adminHeaders(requestCspNonce(request)) });
    } catch (error) {
      return errorResponse(request, error);
    }
  };
}

export function createMcpAdminAction(
  auth: Authenticator,
  tokens: TokenActions,
  config: AdminAuthConfig,
): ActionFunction {
  return async ({ request }: ActionFunctionArgs) => {
    const { principal } = await requireAdminPage(request, auth);
    try {
      const form = await request.formData();
      verifyAdminMutationRequest(request, principal, formString(form.get("_csrf")), config);
      const intent = formString(form.get("intent"));

      if (intent === "create") {
        const issued = await tokens.issue({
          adminUserId: principal.userId,
          name: formString(form.get("name")),
          scopes: parseScopes(form),
          ttlDays: parseTtl(formString(form.get("ttlDays"))),
        });
        return Response.json(issued, {
          status: 201,
          headers: adminHeaders(requestCspNonce(request)),
        });
      }

      if (intent === "revoke") {
        const id = formString(form.get("id"));
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
          throw new Error("mcp_token_id_invalid");
        }
        if (!await tokens.revoke(id, principal.userId)) throw new Error("mcp_token_not_found");
        return Response.json({ revoked: true }, { headers: adminHeaders(requestCspNonce(request)) });
      }

      throw new Error("mcp_token_intent_invalid");
    } catch (error) {
      return errorResponse(request, error);
    }
  };
}

export const loader = (args: LoaderFunctionArgs) => createMcpAdminLoader(
  getAdminAuthService(),
  getMcpTokenService(),
)(args);
export const action = (args: ActionFunctionArgs) => createMcpAdminAction(
  getAdminAuthService(),
  getMcpTokenService(),
  readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
