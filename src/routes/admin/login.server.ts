import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { readAdminAuthConfig } from "../../server/auth/config";
import { createAdminCookie } from "../../server/auth/cookie";
import { adminClientIp, readAdminSessionToken, safeAdminReturnPath } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import { AdminAuthError, type AdminAuthService } from "../../server/auth/service";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";
import { clearLoginCsrfCookie, createLoginCsrfCookie, generateLoginCsrf, verifyLoginCsrf } from "./loginCsrf";

type LoginService = Pick<AdminAuthService, "login" | "authenticate" | "logout" | "changePassword" | "cleanupExpiredLimits">;

function responseHeaders(request: Request): Headers {
  return adminHeaders(requestCspNonce(request));
}

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function verifyLoginOrigin(request: Request, config: AdminAuthConfig): void {
  if (request.method !== "POST" || request.headers.get("origin") !== config.trustedOrigin.origin ||
      request.headers.get("sec-fetch-site") !== "same-origin") throw new Error("admin_origin_invalid");
}

export function createLoginLoader(
  service: Pick<AdminAuthService, "authenticate">,
  csrfFactory: () => string = generateLoginCsrf,
) {
  return async ({ request }: LoaderFunctionArgs) => {
    const current = readAdminSessionToken(request);
    if (current && await service.authenticate(current)) throw redirect("/admin/");
    const loginCsrf = csrfFactory();
    const url = new URL(request.url);
    const headers = responseHeaders(request);
    headers.append("Set-Cookie", createLoginCsrfCookie(loginCsrf));
    return Response.json({ loginCsrf, returnTo: safeAdminReturnPath(url.searchParams.get("returnTo")) }, { headers });
  };
}

export function createLoginAction(service: LoginService, config: AdminAuthConfig) {
  return async ({ request }: ActionFunctionArgs) => {
    const headers = responseHeaders(request);
    let form: FormData;
    try {
      verifyLoginOrigin(request, config);
      form = await request.formData();
      verifyLoginCsrf(request, formString(form.get("_loginCsrf")));
    } catch {
      return Response.json({ error: "Не удалось проверить запрос. Обновите страницу и попробуйте снова." }, { status: 403, headers });
    }
    const login = formString(form.get("login"));
    const returnTo = safeAdminReturnPath(formString(form.get("returnTo")));
    try {
      const result = await service.login({ login, password: formString(form.get("password")), ip: adminClientIp(request) });
      headers.append("Set-Cookie", createAdminCookie(result.token));
      headers.append("Set-Cookie", clearLoginCsrfCookie());
      return redirect(returnTo, { headers });
    } catch (error) {
      const status = error instanceof AdminAuthError ? error.status : 503;
      const message = status === 429
        ? "Слишком много попыток. Попробуйте позже."
        : status === 401 ? "Неверный логин или пароль." : "Вход временно недоступен.";
      if (error instanceof AdminAuthError && error.retryAfterSeconds) headers.set("Retry-After", String(error.retryAfterSeconds));
      const loginCsrf = generateLoginCsrf();
      headers.append("Set-Cookie", createLoginCsrfCookie(loginCsrf));
      return Response.json({ error: message, login, returnTo, loginCsrf }, { status, headers });
    }
  };
}

export const loader = (args: LoaderFunctionArgs) => createLoginLoader(getAdminAuthService())(args);
export const action = (args: ActionFunctionArgs) =>
  createLoginAction(getAdminAuthService(), readAdminAuthConfig(process.env))(args);
export const headers = adminRouteHeaders;
