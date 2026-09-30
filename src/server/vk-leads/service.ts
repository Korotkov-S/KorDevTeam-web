import { createHmac } from "node:crypto";
import { z } from "zod";

import { normalizeLeadContext, normalizeLeadFields, requestFingerprint, subjectHash } from "../leads/validation";
import type { AcceptDecision, LeadRepository } from "../leads/repository";
import type { VkLeadWebhookConfig } from "./config";
import { VkLeadError } from "./errors";

const providerId = z.union([z.string().regex(/^\d{1,32}$/), z.number().int().nonnegative()]).transform(String);
const optionalProviderId = providerId.nullish().transform(value => value ?? null);
const answerSchema = z.object({
  question_text: z.string().max(1_000).nullish(),
  answer_text: z.string().max(4_000).nullish(),
}).passthrough();
const notificationSchema = z.object({
  id: z.string().min(1).max(255),
  resource_id: optionalProviderId,
  resource: z.literal("LEAD"),
  callback_url: z.string().url().max(2_048),
  created: z.string().min(1).max(100),
  data: z.object({
    id: providerId,
    form_id: providerId,
    ad_plan_id: optionalProviderId,
    ad_group_id: optionalProviderId,
    banner_id: optionalProviderId,
    created_at: z.string().min(1).max(100),
    answers: z.array(answerSchema).max(100).default([]),
    contact_info: z.object({
      first_name: z.string().max(255).nullish(),
      phone: z.string().max(50).nullish(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type VkLeadServiceDependencies = {
  config: VkLeadWebhookConfig;
  repository: Pick<LeadRepository, "accept">;
};
type VkLeadAcceptedDecision = Extract<AcceptDecision, { kind: "accepted" | "replayed" }>;

function formatUuid(bytes: Buffer): string {
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

/** RFC 9562 version 8 UUID derived from an HMAC, so provider IDs are not exposed to CRM. */
export function vkLeadSubmissionKey(base64HashKey: string, providerLeadId: string): string {
  const bytes = createHmac("sha256", Buffer.from(base64HashKey, "base64"))
    .update("kordev-vk-lead:", "utf8")
    .update(providerLeadId, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function description(input: {
  service: string;
  formId: string;
  campaignId: string | null;
  adGroupId: string | null;
  bannerId: string | null;
  providerLeadId: string;
  answers: Array<{ question_text?: string | null; answer_text?: string | null }>;
}): string {
  const lines = [
    `Заявка из лид-формы VK: ${input.service}`,
    `Форма VK: ${input.formId}`,
    `Лид VK: ${input.providerLeadId}`,
  ];
  if (input.campaignId) lines.push(`Кампания VK: ${input.campaignId}`);
  if (input.adGroupId) lines.push(`Группа VK: ${input.adGroupId}`);
  if (input.bannerId) lines.push(`Объявление VK: ${input.bannerId}`);
  for (const answer of input.answers) {
    const question = answer.question_text?.trim();
    const value = answer.answer_text?.trim();
    if (question && value) lines.push(`${question}: ${value}`);
  }
  return lines.join("\n").slice(0, 10_000);
}

export function createVkLeadService({ config, repository }: VkLeadServiceDependencies) {
  return {
    async accept(raw: unknown): Promise<VkLeadAcceptedDecision> {
      const parsed = notificationSchema.safeParse(raw);
      if (!parsed.success) throw new VkLeadError("vk_lead_payload_invalid");
      const lead = parsed.data.data;
      const service = config.forms.get(lead.form_id);
      if (!service) throw new VkLeadError("vk_lead_form_forbidden");

      let fields;
      let context;
      try {
        fields = normalizeLeadFields({
          name: lead.contact_info.first_name?.trim() || `VK — ${service}`,
          phone: lead.contact_info.phone ?? "",
          description: description({
            service,
            formId: lead.form_id,
            campaignId: lead.ad_plan_id,
            adGroupId: lead.ad_group_id,
            bannerId: lead.banner_id,
            providerLeadId: lead.id,
            answers: lead.answers,
          }),
          consent: "accepted",
        });
        context = normalizeLeadContext({
          pagePath: `/__vk-lead__/form/${lead.form_id}`,
          utmSource: "vk",
          utmMedium: "paid_social",
          utmCampaign: lead.ad_plan_id ?? undefined,
          utmContent: lead.banner_id ?? undefined,
        });
      } catch {
        throw new VkLeadError("vk_lead_payload_invalid");
      }

      const result = await repository.accept({
        submissionKey: vkLeadSubmissionKey(config.hashKey, lead.id),
        requestFingerprint: requestFingerprint({ fields, context, consentVersion: config.consentVersion, attachmentSha256: null }),
        fields,
        context,
        phoneHash: subjectHash(config.hashKey, "phone", fields.phoneDigits),
        ipHash: subjectHash(config.hashKey, "ip", "vk-ads-webhook"),
        consentVersion: config.consentVersion,
        attachment: null,
      });
      if (result.kind === "conflict") throw new VkLeadError("vk_lead_idempotency_conflict");
      if (result.kind === "rate_limited") throw new VkLeadError("vk_lead_rate_limited", result.retryAfterSeconds);
      return result;
    },
  };
}
