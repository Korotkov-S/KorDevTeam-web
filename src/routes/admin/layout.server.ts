import type { LoaderFunctionArgs } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

function rememberedSidebarState(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sidebar_state="))
    ?.slice("sidebar_state=".length);
  return value !== "false";
}

export function createAdminLayoutLoader(service = getAdminAuthService()) {
  return async ({ request }: LoaderFunctionArgs) => {
    const { principal } = await requireAdminPage(request, service);
    return Response.json({
      login: principal.login,
      csrfToken: principal.csrfToken,
      expiresAt: principal.expiresAt.toISOString(),
      sidebarOpen: rememberedSidebarState(request),
    }, { headers: adminHeaders(requestCspNonce(request)) });
  };
}

export const loader = (args: LoaderFunctionArgs) => createAdminLayoutLoader(getAdminAuthService())(args);
export const headers = adminRouteHeaders;
