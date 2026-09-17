import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import type { AdminAuthConfig } from "./config";
import { ADMIN_COOKIE_NAME } from "./cookie";
import type { AdminPrincipal } from "./service";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function readAdminSessionToken(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).filter(part =>
    part.startsWith(`${ADMIN_COOKIE_NAME}=`),
  );
  if (matches.length !== 1) return null;
  const token = matches[0].slice(ADMIN_COOKIE_NAME.length + 1);
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function safeAdminReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/admin/";
  try {
    const url = new URL(value, "https://return.invalid");
    if (url.origin !== "https://return.invalid" || !url.pathname.startsWith("/admin/") || url.hash) return "/admin/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/admin/";
  }
}

function sameSecret(first: string, second: string): boolean {
  const left = Buffer.from(first);
  const right = Buffer.from(second);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function verifyAdminMutationRequest(
  request: Request,
  principal: AdminPrincipal,
  submittedCsrf: string,
  config: AdminAuthConfig,
): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
      request.headers.get("origin") !== config.trustedOrigin.origin ||
      request.headers.get("sec-fetch-site") !== "same-origin") {
    throw new Error("admin_origin_invalid");
  }
  if (!sameSecret(submittedCsrf, principal.csrfToken)) throw new Error("admin_csrf_invalid");
}

export function adminClientIp(request: Request): string {
  const value = request.headers.get("x-kordev-client-ip") ?? "";
  return isIP(value) ? value : "unknown";
}
