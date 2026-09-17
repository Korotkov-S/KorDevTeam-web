import type { LoaderFunctionArgs } from "react-router";

import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

export function createAdminIndexLoader(service: Pick<AdminAuthService, "authenticate"> = getAdminAuthService()) {
  return async ({ request }: LoaderFunctionArgs) => {
    const { principal } = await requireAdminPage(request, service);
    return Response.json({ login: principal.login }, { headers: adminHeaders(requestCspNonce(request)) });
  };
}

export const loader = (args: LoaderFunctionArgs) => createAdminIndexLoader(getAdminAuthService())(args);
export const headers = adminRouteHeaders;
