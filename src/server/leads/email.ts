import { basename, extname } from "node:path";
import nodemailer, { type SendMailOptions } from "nodemailer";
import type { LeadWorkerConfig } from "./config";
import type { DeliveryEnvelope } from "./crm";
import { classifyDeliveryFailure, DeliveryFailure } from "./retry";

export type EmailReceipt = { messageId: string };
export type LeadEmailTransport = {
  sendMail(mail: SendMailOptions): Promise<{ messageId: string; rejected?: unknown[] }>;
};

/** Construct once per worker; construction itself does not send a message. */
export function createLeadEmailTransport(config: LeadWorkerConfig["smtp"]) {
  return nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure,
    auth: { user: config.user, pass: config.password }, logger: false, debug: false,
    requireTLS: true,
    connectionTimeout: 5_000, greetingTimeout: 10_000, socketTimeout: 45_000, dnsTimeout: 5_000,
  });
}

function safeFilename(originalName: string): string {
  const name = basename(originalName.replace(/\\/g, "/")).normalize("NFC").replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_");
  if (!name || name === "." || name === "..") return "attachment";
  const extension = extname(name).slice(0, 20);
  return name.length <= 200 ? name : name.slice(0, 200 - extension.length) + extension;
}

function renderLeadText(envelope: DeliveryEnvelope): string {
  const lines = [
    "Новая заявка KorDevTeam", `Номер заявки: ${envelope.leadId}`,
    `Принята: ${envelope.acceptedAt.toISOString()}`, `Имя: ${envelope.name}`, `Телефон: ${envelope.phone}`,
  ];
  if (envelope.description) lines.push("Описание:", envelope.description);
  lines.push(`Страница: ${envelope.pagePath}`);
  if (envelope.referrer) lines.push(`Источник перехода: ${envelope.referrer}`);
  return lines.join("\n");
}

export async function sendLeadEmail(envelope: DeliveryEnvelope, config: LeadWorkerConfig["smtp"], transport: LeadEmailTransport): Promise<EmailReceipt> {
  try {
    const result = await transport.sendMail({
      from: config.from, to: "team@korotkov.dev",
      subject: `Новая заявка KorDevTeam · ${envelope.leadId.slice(-8)}`,
      messageId: `<lead-${envelope.leadId}@kordev.team>`, text: renderLeadText(envelope),
      attachments: envelope.attachment ? [{ filename: safeFilename(envelope.attachment.originalName), path: envelope.attachment.path, contentType: envelope.attachment.mediaType }] : [],
    });
    if (!result || typeof result.messageId !== "string" || !result.messageId || Buffer.byteLength(result.messageId) > 255 || /[\x00-\x1f\x7f]/.test(result.messageId) || result.rejected?.length) {
      throw new DeliveryFailure({ kind: "manual_action", code: "smtp_invalid_receipt" });
    }
    return { messageId: result.messageId };
  } catch (error) { throw new DeliveryFailure(classifyDeliveryFailure("email", error)); }
}
