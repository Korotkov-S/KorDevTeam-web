import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { readAdminAuthConfig } from "../../server/auth/config";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";
import { clearLoginCsrfCookie, createLoginCsrfCookie, generateLoginCsrf, verifyLoginCsrf } from "./loginCsrf";

type ResetService = Pick<AdminAuthService, "resetPassword">;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function responseHeaders(request: Request): Headers {
  const headers = adminHeaders(requestCspNonce(request));
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function readResetToken(values: unknown[]): string {
  const token = values.length === 1 && typeof values[0] === "string" ? values[0] : "";
  return TOKEN_PATTERN.test(token) ? token : "";
}

function verifyOrigin(request: Request, config: AdminAuthConfig): void {
  if (request.method !== "POST" || request.headers.get("origin") !== config.trustedOrigin.origin ||
      request.headers.get("sec-fetch-site") !== "same-origin") throw new Error("admin_origin_invalid");
}

export function createResetPasswordLoader(csrfFactory: () => string = generateLoginCsrf) {
  return async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const resetToken = readResetToken(url.searchParams.getAll("token"));
    const loginCsrf = csrfFactory();
    const headers = responseHeaders(request);
    headers.append("Set-Cookie", createLoginCsrfCookie(loginCsrf));
    return Response.json({ loginCsrf, tokenPresent: Boolean(resetToken), resetToken }, { headers });
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
    const token = readResetToken(form.getAll("resetToken"));
    if (!token) {
      return Response.json({ error: "Ссылка недействительна или уже использована. Запросите новую.", loginCsrf }, { status: 400, headers });
    }
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
      return Response.json({ error: "Ссылка недействительна или уже использована. Запросите новую.", loginCsrf }, { status: 400, headers });
    }
    headers.append("Set-Cookie", clearLoginCsrfCookie());
    return redirect("/admin/login/?reset=success", { headers });
  };
}

export const loader = (args: LoaderFunctionArgs) => createResetPasswordLoader()(args);
export const action = (args: ActionFunctionArgs) => createResetPasswordAction(
  getAdminAuthService(),
  readAdminAuthConfig(process.env),
)(args);
export const headers = adminRouteHeaders;
