import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminAuthConfig } from "./config";
import { ADMIN_COOKIE_NAME } from "./cookie";
import {
  adminClientIp,
  readAdminSessionToken,
  safeAdminReturnPath,
  verifyAdminMutationRequest,
} from "./request";

const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1),
  rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"),
  sessionTtlMs: 43_200_000,
};
const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: "csrf-token-safe-value-123456789012345",
  expiresAt: new Date("2026-09-17T21:00:00.000Z"),
};

test("extracts exactly one valid session cookie", () => {
  const token = "a".repeat(43);
  assert.equal(readAdminSessionToken(new Request("https://kordev.team/admin/", {
    headers: { cookie: `theme=dark; ${ADMIN_COOKIE_NAME}=${token}` },
  })), token);
  assert.equal(readAdminSessionToken(new Request("https://kordev.team/admin/", {
    headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}; ${ADMIN_COOKIE_NAME}=${"b".repeat(43)}` },
  })), null);
});

test("accepts mutations only with same-origin metadata and matching csrf", () => {
  const request = new Request("https://kordev.team/admin/content/article/", {
    method: "POST",
    headers: { origin: "https://kordev.team", "sec-fetch-site": "same-origin" },
  });
  assert.doesNotThrow(() => verifyAdminMutationRequest(request, principal, principal.csrfToken, config));

  for (const [origin, site, csrf] of [
    ["https://evil.example", "same-origin", principal.csrfToken],
    ["https://kordev.team", "cross-site", principal.csrfToken],
    ["https://kordev.team", "same-origin", "wrong"],
  ]) {
    const invalid = new Request("https://kordev.team/admin/content/article/", {
      method: "POST",
      headers: { origin, "sec-fetch-site": site },
    });
    assert.throws(() => verifyAdminMutationRequest(invalid, principal, csrf, config), /admin_(origin|csrf)_invalid/);
  }
});

test("normalizes return paths and trusts only the runtime client-ip header", () => {
  assert.equal(safeAdminReturnPath("/admin/content/article/?status=draft"), "/admin/content/article/?status=draft");
  for (const unsafe of ["https://evil.example/admin/", "//evil.example/admin/", "/public/", "/admin/../privacy/"]) {
    assert.equal(safeAdminReturnPath(unsafe), "/admin/");
  }
  const request = new Request("https://kordev.team/admin/login/", {
    headers: { "x-kordev-client-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.2" },
  });
  assert.equal(adminClientIp(request), "203.0.113.10");
});
