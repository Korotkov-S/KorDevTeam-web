export type VkLeadErrorCode =
  | "vk_lead_payload_invalid"
  | "vk_lead_form_forbidden"
  | "vk_lead_idempotency_conflict"
  | "vk_lead_rate_limited"
  | "vk_lead_unavailable";

export class VkLeadError extends Error {
  constructor(public readonly code: VkLeadErrorCode, public readonly retryAfterSeconds?: number) {
    super(code);
  }
}
