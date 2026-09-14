export type DeliveryChannel = "crm" | "email";
export type DeliveryDecision =
  | { kind: "retry"; retryAfterSeconds?: number }
  | { kind: "terminal"; code: string }
  | { kind: "manual_action"; code: string };

/** Only sanitized decisions cross the adapter boundary; never attach vendor errors as causes. */
export class DeliveryFailure extends Error {
  constructor(readonly decision: DeliveryDecision) {
    super(decision.kind === "retry" ? "delivery_retry" : decision.code);
    this.name = "DeliveryFailure";
  }
}

export function classifyDeliveryFailure(channel: DeliveryChannel, error: unknown): DeliveryDecision {
  if (error instanceof DeliveryFailure) return error.decision;
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (channel === "email") {
    if (["EAUTH", "EMESSAGE", "ENOTFOUND", "EDNS", "ETLS", "ECONFIG"].includes(String(value.code))) {
      return { kind: "manual_action", code: "smtp_configuration_invalid" };
    }
    if (typeof value.responseCode === "number") {
      if (value.responseCode >= 400 && value.responseCode < 500) return { kind: "retry" };
      if (value.responseCode >= 500 && value.responseCode < 600) return { kind: "manual_action", code: "smtp_permanent_failure" };
    }
    if (value.code === "EENVELOPE") return { kind: "manual_action", code: "smtp_configuration_invalid" };
  }
  if (error instanceof TypeError || ["TimeoutError", "AbortError"].includes(String(value.name)) ||
      ["ECONNRESET", "ECONNREFUSED", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(String(value.code))) {
    return { kind: "retry" };
  }
  return { kind: "manual_action", code: "delivery_unknown_failure" };
}

export const CRM_CUTOFF_MS = (23 * 60 + 55) * 60_000;
export const EMAIL_MAX_ATTEMPTS = 12;

export type RetryInput = {
  channel: DeliveryChannel;
  /** Completed failed attempts, starting at 1. */
  attemptCount: number;
  acceptedAt: Date;
  now: Date;
  retryAfterSeconds?: number;
  random?: () => number;
};

export function nextRetryAt(input: RetryInput): Date {
  const { channel, attemptCount, acceptedAt, now, retryAfterSeconds } = input;
  const manual = (code: string): never => { throw new DeliveryFailure({ kind: "manual_action", code }); };
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1 || !Number.isFinite(+acceptedAt) || !Number.isFinite(+now)) {
    manual("retry_configuration_invalid");
  }
  if (channel === "email" && attemptCount >= EMAIL_MAX_ATTEMPTS) manual("email_attempts_exhausted");
  const cap = channel === "email" ? 6 * 60 * 60_000 : 60 * 60_000;
  const base = channel === "email" ? 60_000 : 1000;
  const random = (input.random ?? Math.random)();
  if (!Number.isFinite(random) || random < 0 || random > 1) manual("retry_configuration_invalid");
  let delay = Math.min(cap, base * 2 ** Math.min(attemptCount - 1, 30) * (1 + 0.2 * random));
  if (channel === "crm" && Number.isInteger(retryAfterSeconds) && retryAfterSeconds! >= 1 && retryAfterSeconds! <= 3600) delay = retryAfterSeconds! * 1000;
  const next = new Date(+now + Math.ceil(delay));
  if (!Number.isFinite(+next)) manual("retry_configuration_invalid");
  if (channel === "crm" && +next >= +acceptedAt + CRM_CUTOFF_MS) manual("crm_idempotency_window_expired");
  return next;
}
