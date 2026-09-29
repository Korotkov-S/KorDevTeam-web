import assert from "node:assert/strict";
import { test } from "node:test";

import { createPasswordResetSender } from "./passwordResetEmail";

const environment = {
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "fixture-user",
  SMTP_PASSWORD: "fixture-password",
  SMTP_FROM: "team@korotkov.dev",
};

test("password reset email is addressed to the approved mailbox and contains the one-time link", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const sender = createPasswordResetSender(environment, {
    sendMail: async mail => {
      sent.push(mail as Record<string, unknown>);
      return { messageId: "reset-message" };
    },
  });

  await sender({
    resetUrl: new URL(`https://kordev.team/admin/reset-password/?token=${"t".repeat(43)}`),
    expiresAt: new Date("2026-09-29T09:30:00.000Z"),
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "team@korotkov.dev");
  assert.equal(sent[0]?.from, "team@korotkov.dev");
  assert.match(String(sent[0]?.text), new RegExp(`/admin/reset-password/\\?token=${"t".repeat(43)}`));
  assert.match(String(sent[0]?.text), /29\.09\.2026, 12:30:00/);
});

test("password reset email rejects an invalid SMTP receipt", async () => {
  const sender = createPasswordResetSender(environment, {
    sendMail: async () => ({ messageId: "", rejected: ["team@korotkov.dev"] }),
  });
  await assert.rejects(() => sender({
    resetUrl: new URL(`https://kordev.team/admin/reset-password/?token=${"t".repeat(43)}`),
    expiresAt: new Date("2026-09-29T09:30:00.000Z"),
  }), /admin_password_reset_email_failed/);
});
