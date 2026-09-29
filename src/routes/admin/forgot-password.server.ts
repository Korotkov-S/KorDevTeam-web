import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import type { AdminAuthConfig } from "../../server/auth/config";
import { readAdminAuthConfig } from "../../server/auth/config";
import { adminClientIp } from "../../server/auth/request";
import { getAdminAuthService } from "../../server/auth/runtime";
import type { AdminAuthService } from "../../server/auth/service";
import { getPasswordResetSender, type PasswordResetSender } from "../../server/auth/passwordResetEmail";
import { adminHeaders, adminRouteHeaders, requestCspNonce } from "./headers";
import { createLoginCsrfCookie, generateLoginCsrf, verifyLoginCsrf } from "./loginCsrf";

type ResetRequestService = Pick<AdminAuthService, "requestPasswordReset">;

const GENERIC_MESSAGE = "Если логин существует, ссылка для восстановления отправлена на почту администратора.";

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

export function createForgotPasswordLoader(csrfFactory: () => string = generateLoginCsrf) {
  return async ({ request }: LoaderFunctionArgs) => {
    const loginCsrf = csrfFactory();
    const headers = responseHeaders(request);
    headers.append("Set-Cookie", createLoginCsrfCookie(loginCsrf));
    return Response.json({ loginCsrf }, { headers });
  };
}

export function createForgotPasswordAction(
  service: ResetRequestService,
  config: AdminAuthConfig,
  sendEmail: PasswordResetSender,
) {
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
    const requested = await service.requestPasswordReset({
      login: formString(form.get("login")),
      ip: adminClientIp(request),
    });
    if (requested) {
      const resetUrl = new URL("/admin/reset-password/", config.trustedOrigin);
      resetUrl.searchParams.set("token", requested.token);
      void sendEmail({ resetUrl, expiresAt: requested.expiresAt }).catch(() => {
        console.error("admin_password_reset_email_failed");
      });
    }
    return Response.json({ submitted: true, message: GENERIC_MESSAGE, loginCsrf }, { headers });
  };
}

export const loader = (args: LoaderFunctionArgs) => createForgotPasswordLoader()(args);
export const action = (args: ActionFunctionArgs) => createForgotPasswordAction(
  getAdminAuthService(),
  readAdminAuthConfig(process.env),
  getPasswordResetSender(),
)(args);
export const headers = adminRouteHeaders;
