import { redirect } from "react-router";

import { readAdminSessionToken, safeAdminReturnPath } from "../../server/auth/request";
import type { AdminAuthService } from "../../server/auth/service";
import { getAdminAuthService } from "../../server/auth/runtime";

type Authenticator = Pick<AdminAuthService, "authenticate">;

export async function requireAdminPage(request: Request, service: Authenticator = getAdminAuthService()) {
  const token = readAdminSessionToken(request);
  const principal = token ? await service.authenticate(token) : null;
  if (!principal) {
    const url = new URL(request.url);
    const returnTo = safeAdminReturnPath(`${url.pathname}${url.search}`);
    throw redirect(`/admin/login/?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return { principal, token: token! };
}
