import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { readAdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";
import { clearLoginCsrfCookie, createLoginCsrfCookie, generateLoginCsrf, verifyLoginCsrf } from "./loginCsrf";

type ResetService = Pick<AdminAuthService, "resetPassword">;
const RESET_COOKIE = "__Host-kordev_admin_password_reset";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RESET_COOKIE_SCOPE = "Path=/; Secure; HttpOnly; SameSite=Lax";

function responseHeaders(request: Request): Headers {
  return adminHeaders(requestCspNonce(request));
}

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function verifyOrigin(request: Request, config: AdminAuthConfig): void {
  if (request.method !== "POST" || request.headers.get("origin") !== config.trustedOrigin.origin ||
      request.headers.get("sec-fetch-site") !== "same-origin") throw new Error("admin_origin_invalid");
}

function readResetToken(request: Request): string {
  const values = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim())
    .filter(value => value.startsWith(`${RESET_COOKIE}=`));
  if (values.length !== 1) return "";
  const token = values[0]?.slice(RESET_COOKIE.length + 1) ?? "";
  return TOKEN_PATTERN.test(token) ? token : "";
}

function createResetCookie(token: string): string {
  return `${RESET_COOKIE}=${token}; Max-Age=1800; ${RESET_COOKIE_SCOPE}`;
}

function clearResetCookie(): string {
  return `${RESET_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${RESET_COOKIE_SCOPE}`;
}

export function createResetPasswordLoader(csrfFactory: () => string = generateLoginCsrf) {
  return async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    if (url.searchParams.has("token")) {
      const headers = responseHeaders(request);
      const token = url.searchParams.get("token") ?? "";
      headers.append("Set-Cookie", TOKEN_PATTERN.test(token) ? createResetCookie(token) : clearResetCookie());
      return redirect("/admin/reset-password/", { headers });
    }
    const loginCsrf = csrfFactory();
    const headers = responseHeaders(request);
    headers.append("Set-Cookie", createLoginCsrfCookie(loginCsrf));
    return Response.json({ loginCsrf, tokenPresent: Boolean(readResetToken(request)) }, { headers });
  };
}

export function createResetPasswordAction(service: ResetService, config: AdminAuthConfig) {
  return async ({ request }: ActionFunctionArgs) => {
    const headers = responseHeaders(request);
    let form: FormData;
    let loginCsrf = "";
    try {
      verifyOrigin(request, config);
      form = await request.formData();
      loginCsrf = formString(form.get("_loginCsrf"));
      verifyLoginCsrf(request, loginCsrf);
    } catch {
      return Response.json({ error: "Не удалось проверить запрос. Обновите страницу и попробуйте снова." }, { status: 403, headers });
    }
    const token = readResetToken(request);
    const newPassword = formString(form.get("newPassword"));
    if (newPassword !== formString(form.get("confirmPassword"))) {
      return Response.json({ error: "Пароли не совпадают.", loginCsrf }, { status: 400, headers });
    }
    let changed = false;
    try {
      changed = await service.resetPassword({ token, newPassword });
    } catch {
      return Response.json({ error: "Пароль должен содержать от 14 до 256 символов.", loginCsrf }, { status: 400, headers });
    }
    if (!changed) {
      headers.append("Set-Cookie", clearResetCookie());
      return Response.json({ error: "Ссылка недействительна или уже использована. Запросите новую.", loginCsrf }, { status: 400, headers });
    }
    headers.append("Set-Cookie", clearLoginCsrfCookie());
    headers.append("Set-Cookie", clearResetCookie());
    return redirect("/admin/login/?reset=success", { headers });
  };
}

export const loader = (args: LoaderFunctionArgs) => createResetPasswordLoader()(args);
export const action = (args: ActionFunctionArgs) => createResetPasswordAction(
  getAdminAuthService(),
  readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
