import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdminAuthConfig } from "../../server/auth/config";
import { createForgotPasswordAction } from "./forgot-password.server";
import { createResetPasswordAction, createResetPasswordLoader } from "./reset-password.server";
import { createLoginCsrfCookie } from "./loginCsrf";

const csrf = "c".repeat(43);
const config: AdminAuthConfig = {
  sessionHmacKey: Buffer.alloc(32, 1),
  rateLimitHmacKey: Buffer.alloc(32, 2),
  trustedOrigin: new URL("https://kordev.team"),
  sessionTtlMs: 43_200_000,
};

function postRequest(path: string, form: FormData, resetToken?: string): Request {
  const cookies = [createLoginCsrfCookie(csrf).split(";", 1)[0]];
  if (resetToken) cookies.push(`__Host-kordev_admin_password_reset=${resetToken}`);
  return new Request(`https://kordev.team${path}`, {
    method: "POST",
    body: form,
    headers: {
      origin: "https://kordev.team",
      "sec-fetch-site": "same-origin",
      cookie: cookies.join("; "),
      "x-kordev-client-ip": "203.0.113.30",
      "x-kordev-csp-nonce": "n".repeat(22),
    },
});
}

test("reset-password loader moves the bearer token into a browser-compatible __Host cookie and cleans the URL", async () => {
  const token = "t".repeat(43);
  const loader = createResetPasswordLoader(() => csrf);
  const captured = await loader({
    request: new Request(`https://kordev.team/admin/reset-password/?token=${token}`, {
      headers: { "x-kordev-csp-nonce": "n".repeat(22) },
    }),
    params: {},
    context: {},
  });
  assert.equal(captured.status, 302);
  assert.equal(captured.headers.get("Location"), "/admin/reset-password/");
  assert.match(captured.headers.get("Set-Cookie") ?? "", new RegExp(`__Host-kordev_admin_password_reset=${token}; Max-Age=1800; Path=/; Secure; HttpOnly; SameSite=Strict`));

  const clean = await loader({
    request: new Request("https://kordev.team/admin/reset-password/", {
      headers: {
        cookie: `__Host-kordev_admin_password_reset=${token}`,
        "x-kordev-csp-nonce": "n".repeat(22),
      },
    }),
    params: {},
    context: {},
  });
  assert.equal(clean.status, 200);
  assert.deepEqual(await clean.json(), { loginCsrf: csrf, tokenPresent: true });
});

test("forgot-password action sends a thirty-minute link but returns a generic response", async () => {
  const sent: Array<{ resetUrl: URL; expiresAt: Date }> = [];
  const action = createForgotPasswordAction({
    requestPasswordReset: async () => ({
      token: "t".repeat(43),
      expiresAt: new Date("2026-09-29T09:30:00.000Z"),
    }),
  }, config, async message => { sent.push(message); });
  const form = new FormData();
  form.set("_loginCsrf", csrf);
  form.set("login", "gennady");

  const response = await action({ request: postRequest("/admin/forgot-password/", form), params: {}, context: {} });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    submitted: true,
    message: "Если логин существует, ссылка для восстановления отправлена на почту администратора.",
    loginCsrf: csrf,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.resetUrl.href, `https://kordev.team/admin/reset-password/?token=${"t".repeat(43)}`);
  assert.equal(sent[0]?.expiresAt.toISOString(), "2026-09-29T09:30:00.000Z");
});

test("forgot-password action has the same public response for an unknown login", async () => {
  const action = createForgotPasswordAction({ requestPasswordReset: async () => null }, config, async () => {
    throw new Error("email_must_not_be_sent");
  });
  const form = new FormData();
  form.set("_loginCsrf", csrf);
  form.set("login", "unknown");

  const response = await action({ request: postRequest("/admin/forgot-password/", form), params: {}, context: {} });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, "Если логин существует, ссылка для восстановления отправлена на почту администратора.");
});

test("forgot-password response does not reveal a known login through SMTP latency", async () => {
  const action = createForgotPasswordAction({
    requestPasswordReset: async () => ({ token: "t".repeat(43), expiresAt: new Date("2026-09-29T09:30:00.000Z") }),
  }, config, async () => new Promise<void>(() => undefined));
  const form = new FormData();
  form.set("_loginCsrf", csrf);
  form.set("login", "gennady");

  const response = await Promise.race([
    action({ request: postRequest("/admin/forgot-password/", form), params: {}, context: {} }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("smtp_latency_leaked")), 100)),
  ]);
  assert.equal(response.status, 200);
});

test("reset-password action changes the password and redirects without keeping the token", async () => {
  const received: Array<{ token: string; newPassword: string }> = [];
  const action = createResetPasswordAction({
    resetPassword: async input => {
      received.push(input);
      return true;
    },
  }, config);
  const form = new FormData();
  form.set("_loginCsrf", csrf);
  form.set("newPassword", "совершенно-новый-пароль-2026");
  form.set("confirmPassword", "совершенно-новый-пароль-2026");

  const response = await action({ request: postRequest("/admin/reset-password/", form, "t".repeat(43)), params: {}, context: {} });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/admin/login/?reset=success");
  assert.deepEqual(received, [{ token: "t".repeat(43), newPassword: "совершенно-новый-пароль-2026" }]);
  assert.doesNotMatch(response.headers.get("Location") ?? "", /tttt/);
});

test("reset-password action reports expired links and mismatched passwords", async () => {
  const action = createResetPasswordAction({ resetPassword: async () => false }, config);
  const expired = new FormData();
  expired.set("_loginCsrf", csrf);
  expired.set("newPassword", "совершенно-новый-пароль-2026");
  expired.set("confirmPassword", "совершенно-новый-пароль-2026");
  const expiredResponse = await action({ request: postRequest("/admin/reset-password/", expired, "t".repeat(43)), params: {}, context: {} });
  assert.equal(expiredResponse.status, 400);
  assert.equal((await expiredResponse.json()).error, "Ссылка недействительна или уже использована. Запросите новую.");

  const mismatched = new FormData();
  mismatched.set("_loginCsrf", csrf);
  mismatched.set("newPassword", "совершенно-новый-пароль-2026");
  mismatched.set("confirmPassword", "другой-новый-пароль-2026");
  const mismatchedResponse = await action({ request: postRequest("/admin/reset-password/", mismatched, "t".repeat(43)), params: {}, context: {} });
  assert.equal(mismatchedResponse.status, 400);
  assert.equal((await mismatchedResponse.json()).error, "Пароли не совпадают.");
});
