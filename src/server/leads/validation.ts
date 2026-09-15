import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  CONSENT_FIELD_VALUE,
  MAX_DESCRIPTION_LENGTH,
  type FingerprintInput,
  type LeadContext,
  type NormalizedLeadFields,
  type RawLeadContext,
  type RawLeadFields,
} from "./contracts";
import { LeadError } from "./errors";

const allowedLeadFields = new Set([
  "name", "phone", "description", "consent", "website", "pagePath", "referrer",
  "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
]);
const allowedContextFields = new Set(["pagePath", "referrer", "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"]);
const utf8 = new TextEncoder();

function validationError(): never {
  throw new LeadError("validation_error");
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").trim();
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function assertOnlyFields(raw: Record<string, string | undefined>, allowed: Set<string>): void {
  if (Object.keys(raw).some((key) => !allowed.has(key))) validationError();
}

export function normalizeLeadFields(raw: RawLeadFields): NormalizedLeadFields {
  assertOnlyFields(raw, allowedLeadFields);
  const name = normalizeText(raw.name);
  const phone = normalizeText(raw.phone);
  const descriptionValue = normalizeText(raw.description);
  const phoneDigits = (phone.match(/[0-9]/g) ?? []).join("");

  if (codePointLength(name) < 1 || codePointLength(name) > 255) validationError();
  if (codePointLength(phone) < 1 || codePointLength(phone) > 50 || phoneDigits.length < 5 || phoneDigits.length > 20) validationError();
  if (codePointLength(descriptionValue) > MAX_DESCRIPTION_LENGTH) validationError();
  if (raw.consent !== CONSENT_FIELD_VALUE) validationError();

  return {
    name,
    phone,
    phoneDigits,
    description: descriptionValue || null,
    consent: true,
    honeypot: normalizeText(raw.website),
  };
}

function normalizeContextValue(value: string | undefined): string {
  const normalized = normalizeText(value);
  if (codePointLength(normalized) > 500) validationError();
  return normalized;
}

export function normalizeLeadContext(raw: RawLeadContext): LeadContext {
  assertOnlyFields(raw as Record<string, string | undefined>, allowedContextFields);
  const pagePath = normalizeContextValue(raw.pagePath);
  if (!pagePath.startsWith("/") || pagePath.startsWith("//")) validationError();

  const rawReferrer = normalizeContextValue(raw.referrer);
  let referrer: string | null = null;
  if (rawReferrer) {
    try {
      const parsed = new URL(rawReferrer);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") validationError();
      referrer = `${parsed.origin}${parsed.pathname}`;
      if (codePointLength(referrer) > 500) validationError();
    } catch (error) {
      if (error instanceof LeadError) throw error;
      validationError();
    }
  }

  const utm: LeadContext["utm"] = {};
  const sourceFields = [
    ["source", raw.utmSource], ["medium", raw.utmMedium], ["campaign", raw.utmCampaign],
    ["content", raw.utmContent], ["term", raw.utmTerm],
  ] as const;
  for (const [key, value] of sourceFields) {
    const normalized = normalizeContextValue(value);
    if (normalized) utm[key] = normalized;
  }
  return { pagePath, referrer, utm };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

export function requestFingerprint(input: FingerprintInput): string {
  return createHash("sha256").update(canonicalJson(input), "utf8").digest("hex");
}

export function subjectHash(secret: string, kind: "ip" | "phone" | "crm_token" | "global", value: string): string {
  return createHmac("sha256", secret).update(`kordev-leads:${kind}:`, "utf8").update(value, "utf8").digest("hex");
}

export function fingerprintsEqual(first: string, second: string): boolean {
  const firstBytes = utf8.encode(first);
  const secondBytes = utf8.encode(second);
  return firstBytes.byteLength === secondBytes.byteLength && timingSafeEqual(firstBytes, secondBytes);
}
