import type { LoaderFunctionArgs } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

export function createAdminLayoutLoader(service = getAdminAuthService()) {
  return async ({ request }: LoaderFunctionArgs) => {
    const { principal } = await requireAdminPage(request, service);
    return Response.json({
      login: principal.login,
      csrfToken: principal.csrfToken,
      expiresAt: principal.expiresAt.toISOString(),
    }, { headers: adminHeaders(requestCspNonce(request)) });
  };
}

export const loader = (args: LoaderFunctionArgs) => createAdminLayoutLoader(getAdminAuthService())(args);
export const headers = adminRouteHeaders;
