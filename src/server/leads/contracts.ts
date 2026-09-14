export const MAX_FILE_BYTES = 26_214_400;
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 131_072;
export const MAX_DESCRIPTION_LENGTH = 10_000;
export const CONSENT_FIELD_VALUE = "accepted";

export type RawLeadFields = Record<string, string | undefined>;

export type NormalizedLeadFields = {
  name: string;
  phone: string;
  phoneDigits: string;
  description: string | null;
  consent: true;
  honeypot: string;
};

export type LeadContext = {
  pagePath: string;
  referrer: string | null;
  utm: Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>>;
};

export type AcceptedResponse = { leadId: string; status: "accepted" };

export type RawLeadContext = Partial<Record<
  "pagePath" | "referrer" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm",
  string
>>;

export type FingerprintInput = {
  fields: NormalizedLeadFields;
  context: LeadContext;
  consentVersion: string;
  attachmentSha256: string | null;
};

export type StagedAttachment = {
  path: string;
  originalName: string;
  declaredMime: string;
  byteSize: number;
  sha256: string;
};

export type AllowedMediaType =
  | "application/pdf"
  | "application/msword"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.ms-excel"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "image/jpeg"
  | "image/png";

export type StoredLead = {
  id: string;
  submissionKey: string;
  requestFingerprint: string;
  consentVersion: string;
  successResponse: AcceptedResponse;
};

export type ClaimedJob = {
  id: string;
  leadId: string;
  channel: "crm" | "email";
  attemptCount: number;
  acceptedAt: Date;
  leaseExpiresAt: Date;
  lead: NormalizedLeadFields & { pagePath: string; referrer: string | null };
  attachment: null | {
    objectKey: string;
    originalName: string;
    mediaType: AllowedMediaType;
    sha256: string;
  };
};
