import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { createLeadEmailTransport, sendLeadEmail } from "./email";
import { classifyDeliveryFailure } from "./retry";
import type { DeliveryEnvelope } from "./crm";

const envelope: DeliveryEnvelope = {
  leadId: "a0e36e21-e11c-48d8-a087-90ca2205059d", jobId: "a80f079b-df33-4f66-9eac-b6f4cb3266a5", acceptedAt: new Date("2026-09-14T09:00:00Z"),
  name: "Анна", phone: "+7 (999) 111-22-33", description: "Нужна CRM\nВторая строка", pagePath: "/services/crm", referrer: "https://example.invalid/from", attachment: null,
};
const config = { host: "smtp.example.invalid", port: 465, secure: true, user: "fixture-user", password: "fixture-password", from: "leads@kordev.team", to: "team@korotkov.dev" as const };

test("email uses fixed recipient, deterministic identity, Russian plain text and exactly one sanitized private attachment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lead-email-test-")); const path = join(dir, "private-file");
  await writeFile(path, "private email bytes", { mode: 0o600 });
  try {
    const input = { ...envelope, ip: "192.0.2.87", ipHash: "PRIVATE_HMAC", token: "PRIVATE_TOKEN", consentVersion: "PRIVATE_CONSENT", attachment: { path, originalName: "C:\\private\\бриф\r\n?.pdf", mediaType: "application/pdf", sha256: "PRIVATE_SHA256" } };
    const mails: SendMailOptions[] = [];
    const transport = { sendMail: async (mail: SendMailOptions) => { mails.push(mail); return { messageId: "provider-message-42", response: "PRIVATE_RESPONSE" }; } };
    for (let i = 0; i < 2; i++) assert.deepEqual(await sendLeadEmail(input, config, transport), { messageId: "provider-message-42" });
    assert.deepEqual(mails[0], mails[1]);
    const mail = mails[0];
    assert.equal(mail.to, "team@korotkov.dev"); assert.equal(mail.from, "leads@kordev.team");
    assert.equal(mail.subject, "Новая заявка KorDevTeam · 2205059d");
    assert.equal(mail.messageId, "<lead-a0e36e21-e11c-48d8-a087-90ca2205059d@kordev.team>");
    assert.equal(mail.html, undefined); assert.equal(mail.cc, undefined); assert.equal(mail.bcc, undefined);
    const text = String(mail.text);
    for (const part of ["Имя: Анна", "Телефон: +7 (999) 111-22-33", "Описание:", "Нужна CRM\nВторая строка", "2026-09-14T09:00:00.000Z", "/services/crm", "https://example.invalid/from", envelope.leadId]) assert.ok(text.includes(part), part);
    assert.doesNotMatch(JSON.stringify(mail), /192\.0\.2\.87|PRIVATE_|fixture-password/);
    assert.equal(mail.attachments?.length, 1);
    assert.deepEqual(mail.attachments?.[0], { filename: "бриф___.pdf", path, contentType: "application/pdf" });
    assert.equal(await readFile(path, "utf8"), "private email bytes", "Task 8 owns disposal");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("email without description or file has no attachment and cannot be rerouted by config extras", async () => {
  await sendLeadEmail({ ...envelope, description: null, referrer: null }, { ...config, to: "attacker@example.invalid" } as typeof config, {
    sendMail: async (mail) => {
      assert.equal(mail.to, "team@korotkov.dev"); assert.deepEqual(mail.attachments, []);
      assert.doesNotMatch(String(mail.text), /null|undefined/); return { messageId: "provider-42" };
    },
  });
});

test("real Nodemailer composition keeps deterministic Message-ID and text without contacting SMTP", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  let wire = "";
  const receipt = await sendLeadEmail(envelope, config, { sendMail: async (mail) => {
    const result = await transport.sendMail(mail); wire = result.message.toString(); return result;
  } });
  assert.equal(receipt.messageId, "<lead-a0e36e21-e11c-48d8-a087-90ca2205059d@kordev.team>");
  assert.match(wire, /To: team@korotkov\.dev/); assert.match(wire, /Content-Type: text\/plain; charset=utf-8/);
  assert.doesNotMatch(wire, /text\/html|fixture-password/);
});

test("SMTP factory maps backend credentials, disables debug logging and does not connect on construction", () => {
  const transport = createLeadEmailTransport(config);
  try {
    assert.deepEqual(transport.options, {
      host: "smtp.example.invalid", port: 465, secure: true,
      auth: { user: "fixture-user", pass: "fixture-password" }, logger: false, debug: false,
      connectionTimeout: 5_000, greetingTimeout: 10_000, socketTimeout: 45_000, dnsTimeout: 5_000,
    });
  } finally { transport.close(); }
});

test("SMTP transient failures retry and permanent/configuration failures are sanitized", async () => {
  for (const [error, decision] of [
    [{ code: "ECONNRESET", message: "PRIVATE_TOKEN", response: "PRIVATE_RESPONSE" }, { kind: "retry" }],
    [{ responseCode: 450, message: "PRIVATE_TOKEN" }, { kind: "retry" }],
    [{ responseCode: 550, response: "PRIVATE_RESPONSE" }, { kind: "manual_action", code: "smtp_permanent_failure" }],
    [{ code: "EAUTH", responseCode: 535, response: "PRIVATE_PASSWORD" }, { kind: "manual_action", code: "smtp_configuration_invalid" }],
  ] as const) {
    await assert.rejects(() => sendLeadEmail(envelope, config, { sendMail: async () => { throw error; } }), (failure) => {
      assert.deepEqual(classifyDeliveryFailure("email", failure), decision);
      assert.doesNotMatch(JSON.stringify(failure), /PRIVATE_/); assert.equal((failure as Error).cause, undefined); return true;
    });
  }
});

test("missing/unsafe provider message ID or rejected recipient cannot be marked delivered", async () => {
  for (const result of [null, undefined, {}, { messageId: "" }, { messageId: "unsafe\r\nvalue" }, { messageId: "x".repeat(256) }, { messageId: "provider", rejected: ["team@korotkov.dev"] }]) {
    await assert.rejects(() => sendLeadEmail(envelope, config, { sendMail: async () => result as { messageId: string } }), (error) => {
      assert.deepEqual(classifyDeliveryFailure("email", error), { kind: "manual_action", code: "smtp_invalid_receipt" }); return true;
    });
  }
});
