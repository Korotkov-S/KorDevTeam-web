export const leadErrorStatuses = {
  validation_error: 400,
  idempotency_conflict: 409,
  file_too_large: 413,
  unsupported_file_type: 415,
  unsafe_file: 422,
  rate_limit_exceeded: 429,
  storage_unavailable: 503,
  scan_unavailable: 503,
  service_unavailable: 503,
  internal_error: 500,
} as const;

export type LeadErrorCode = keyof typeof leadErrorStatuses;

export class LeadError extends Error {
  readonly status: (typeof leadErrorStatuses)[LeadErrorCode];
  readonly retryAfterSeconds?: number;

  constructor(readonly code: LeadErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.name = "LeadError";
    this.status = leadErrorStatuses[code];
    if (retryAfterSeconds !== undefined) {
      if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 3_600) {
        throw new RangeError("lead_error_retry_after_invalid");
      }
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}
