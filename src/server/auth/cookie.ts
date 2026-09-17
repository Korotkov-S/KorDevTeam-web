export const ADMIN_COOKIE_NAME = "__Host-kordev_admin";
const COOKIE_SCOPE = "Path=/; Secure; HttpOnly; SameSite=Strict";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;

export function createAdminCookie(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("admin_session_token_invalid");
  return `${ADMIN_COOKIE_NAME}=${token}; Max-Age=43200; ${COOKIE_SCOPE}`;
}

export function clearAdminCookie(): string {
  return `${ADMIN_COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${COOKIE_SCOPE}`;
}
