export const CONSENT_VERSION = "2026-09-18" as const;
export const CONSENT_STORAGE_KEY = "kordev.analytics-consent" as const;

export type ConsentDecision = "unknown" | "accepted" | "rejected";

export type ConsentRecord = {
  version: typeof CONSENT_VERSION;
  decision: Exclude<ConsentDecision, "unknown">;
  decidedAt: string;
};

export function parseConsentRecord(raw: string | null): ConsentDecision {
  if (!raw) return "unknown";

  try {
    const record: unknown = JSON.parse(raw);
    if (
      typeof record === "object"
      && record !== null
      && "version" in record
      && record.version === CONSENT_VERSION
      && "decision" in record
      && (record.decision === "accepted" || record.decision === "rejected")
    ) {
      return record.decision;
    }
  } catch {
    // Invalid or inaccessible persisted data is equivalent to no decision.
  }

  return "unknown";
}

export function createConsentRecord(
  decision: Exclude<ConsentDecision, "unknown">,
  decidedAt = new Date(),
): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    decision,
    decidedAt: decidedAt.toISOString(),
  };
}
