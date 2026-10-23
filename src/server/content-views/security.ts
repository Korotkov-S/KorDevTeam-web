import { createHmac } from "node:crypto";
import { z } from "zod";
import { CONSENT_VERSION } from "../../lib/consent";

export class ViewHttpError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}
const sessionToken = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
const base = { sessionToken, consentVersion: z.literal(CONSENT_VERSION) };
const sessionSchema = z.object({ ...base, operation: z.enum(["register", "touch"]) }).strict();
const recordSchema = z.object({ ...base, entryId: z.uuid() }).strict();
export function parseViewRequest(endpoint: "session", body: unknown): z.infer<typeof sessionSchema>;
export function parseViewRequest(endpoint: "record", body: unknown): z.infer<typeof recordSchema>;
export function parseViewRequest(endpoint: "session" | "record", body: unknown) {
  if (typeof body === "object" && body !== null && "consentVersion" in body && body.consentVersion !== CONSENT_VERSION) throw new ViewHttpError("consent_required", 403);
  const result = (endpoint === "session" ? sessionSchema : recordSchema).safeParse(body);
  if (!result.success) throw new ViewHttpError("malformed", 400);
  return result.data;
}
export function hashViewKey(key: Buffer, domain: "session" | "rate-ip", value: string): string {
  return createHmac("sha256", key).update(`${domain}:${value}`).digest("hex");
}
export function isAutomatedRequest(input: { userAgent?: string; purpose?: string; secPurpose?: string }): boolean {
  return /bot|spider|crawler|facebookexternalhit|slurp|headless|preview/i.test(input.userAgent ?? "")
    || /prefetch|prerender/i.test(`${input.purpose ?? ""} ${input.secPurpose ?? ""}`);
}
