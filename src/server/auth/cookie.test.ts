import assert from "node:assert/strict";
import { test } from "node:test";

import { ADMIN_COOKIE_NAME, clearAdminCookie, createAdminCookie } from "./cookie";

test("creates a host-only secure twelve-hour cookie", () => {
  const token = "safe_token-123".padEnd(43, "x");
  const value = createAdminCookie(token);

  assert.match(value, new RegExp(`^${ADMIN_COOKIE_NAME}=${token};`));
  assert.match(value, /Path=\//);
  assert.match(value, /Max-Age=43200/);
  assert.match(value, /Secure/);
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Strict/);
  assert.doesNotMatch(value, /Domain=/);
});

test("clears only the admin cookie with the same security scope", () => {
  const value = clearAdminCookie();

  assert.match(value, new RegExp(`^${ADMIN_COOKIE_NAME}=;`));
  assert.match(value, /Max-Age=0/);
  assert.match(value, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.match(value, /Secure/);
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Strict/);
});

test("rejects characters that could inject cookie attributes", () => {
  assert.throws(() => createAdminCookie("bad; Path=/evil"), /admin_session_token_invalid/);
});
