import assert from "node:assert/strict";
import { test } from "node:test";

import { isAdminPath } from "../../lib/adminPath";
import { adminHeaders } from "./headers";
import { createAdminIndexLoader } from "./index.server";
import { createLoginAction, createLoginLoader } from "./login.server";
import { createLoginCsrfCookie } from "./loginCsrf";

const nonce = "a".repeat(22);
const principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  login: "owner",
  sessionId: "00000000-0000-4000-8000-000000000002",
  csrfToken: "b".repeat(43),
  expiresAt: new Date("2026-09-17T21:00:00.000Z"),
};

test("admin headers are private, non-indexable and nonce protected", () => {
  const headers = adminHeaders(nonce);
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("Content-Security-Policy") ?? "", new RegExp(`script-src 'self' 'nonce-${nonce}'`));
  assert.doesNotMatch(headers.get("Content-Security-Policy") ?? "", /unsafe-eval|script-src[^;]*unsafe-inline/);
});

test("guest admin loader redirects to login with a local return path", async () => {
  const loader = createAdminIndexLoader({ authenticate: async () => null });
  await assert.rejects(
    () => loader({ request: new Request("https://kordev.team/admin/content/article/?status=draft", {
      headers: { "x-kordev-csp-nonce": nonce },
    }), params: {}, context: {} }),
    (response: unknown) => response instanceof Response && response.status === 302 &&
      response.headers.get("Location") === "/admin/login/?returnTo=%2Fadmin%2Fcontent%2Farticle%2F%3Fstatus%3Ddraft" &&
      response.headers.get("Cache-Control") === "no-store" &&
      response.headers.get("X-Robots-Tag") === "noindex, nofollow",
  );
});

test("login uses origin, a pre-auth csrf cookie and a safe return path", async () => {
  const csrf = "c".repeat(43);
  const action = createLoginAction({
    login: async () => ({ token: "d".repeat(43), principal }),
    authenticate: async () => null,
    logout: async () => undefined,
    changePassword: async () => undefined,
    cleanupExpiredLimits: async () => 0,
  }, {
    sessionHmacKey: Buffer.alloc(32, 1),
    rateLimitHmacKey: Buffer.alloc(32, 2),
    trustedOrigin: new URL("https://kordev.team"),
    sessionTtlMs: 43_200_000,
  });
  const form = new FormData();
  form.set("login", "owner");
  form.set("password", "очень-длинный-пароль-2026");
  form.set("_loginCsrf", csrf);
  form.set("returnTo", "https://evil.example/admin/");
  const response = await action({ request: new Request("https://kordev.team/admin/login/", {
    method: "POST",
    body: form,
    headers: {
      origin: "https://kordev.team",
      "sec-fetch-site": "same-origin",
      cookie: createLoginCsrfCookie(csrf),
      "x-kordev-client-ip": "203.0.113.10",
      "x-kordev-csp-nonce": nonce,
    },
  }), params: {}, context: {} });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/admin/");
  assert.match(response.headers.get("Set-Cookie") ?? "", /__Host-kordev_admin=/);
});

test("login loader issues csrf and public chrome is excluded from admin paths", async () => {
  const loader = createLoginLoader({ authenticate: async () => null }, () => "e".repeat(43));
  const response = await loader({ request: new Request("https://kordev.team/admin/login/", {
    headers: { "x-kordev-csp-nonce": nonce },
  }), params: {}, context: {} });
  assert.match(response.headers.get("Set-Cookie") ?? "", /__Host-kordev_admin_login_csrf=/);
  assert.match(response.headers.get("Set-Cookie") ?? "", /Path=\/; Secure; HttpOnly; SameSite=Strict/);
  assert.equal(isAdminPath("/admin/"), true);
  assert.equal(isAdminPath("/admin/content/article/"), true);
  assert.equal(isAdminPath("/administration/"), false);
});
