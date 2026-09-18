import { randomBytes, timingSafeEqual } from "node:crypto";

const LOGIN_CSRF_COOKIE = "__Host-kordev_admin_login_csrf";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_SCOPE = "Path=/; Secure; HttpOnly; SameSite=Strict";

export function generateLoginCsrf(): string {
  return randomBytes(32).toString("base64url");
}

export function createLoginCsrfCookie(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("admin_login_csrf_invalid");
  return `${LOGIN_CSRF_COOKIE}=${token}; Max-Age=600; ${COOKIE_SCOPE}`;
}

export function clearLoginCsrfCookie(): string {
  return `${LOGIN_CSRF_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${COOKIE_SCOPE}`;
}

function readLoginCsrfCookie(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).filter(part =>
    part.startsWith(`${LOGIN_CSRF_COOKIE}=`),
  );
  if (matches.length !== 1) return null;
  const token = matches[0].slice(LOGIN_CSRF_COOKIE.length + 1);
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function verifyLoginCsrf(request: Request, submitted: string): void {
  const cookie = readLoginCsrfCookie(request);
  const left = Buffer.from(cookie ?? "");
  const right = Buffer.from(submitted);
  if (!cookie || !TOKEN_PATTERN.test(submitted) || left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("admin_login_csrf_invalid");
  }
}
