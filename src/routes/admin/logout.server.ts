import { redirect, type ActionFunctionArgs } from "react-router";

import { readAdminAuthConfig } from "../../server/auth/config";
import { clearAdminCookie } from "../../server/auth/cookie";
import { verifyAdminMutationRequest } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import { requireAdminPage } from "./auth.server";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";

export async function action({ request }: ActionFunctionArgs) {
  const service = getAdminAuthService();
  const { principal, token } = await requireAdminPage(request, service);
  const form = await request.formData();
  verifyAdminMutationRequest(request, principal, String(form.get("_csrf") ?? ""), readAdminAuthConfig(process.env));
  await service.logout(token);
  const headers = adminHeaders(requestCspNonce(request));
  headers.append("Set-Cookie", clearAdminCookie());
  return redirect("/admin/login/", { headers });
}

export const headers = adminRouteHeaders;
