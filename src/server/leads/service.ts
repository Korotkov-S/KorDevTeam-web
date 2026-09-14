import { randomUUID } from "node:crypto";
import type { ClamAvScanner } from "./clamav";
import type { LeadWebConfig } from "./config";
import type { AcceptedResponse, RawLeadContext, RawLeadFields, StagedAttachment } from "./contracts";
import { LeadError } from "./errors";
import { inspectAttachment } from "./fileInspection";
import type { PrivateAttachmentStore } from "./objectStore";
import type { AcceptCommand, LeadRepository } from "./repository";
import { fingerprintsEqual, normalizeLeadContext, normalizeLeadFields, requestFingerprint, subjectHash } from "./validation";

export type ServiceDecision =
  | { kind: "accepted"; response: AcceptedResponse }
  | { kind: "replayed"; response: AcceptedResponse }
  | { kind: "ignored" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

/** Fields and staging must come from the bounded multipart parser. */
export type LeadServiceInput = {
  fields: RawLeadFields;
  context: RawLeadContext;
  submissionKey: string;
  requestIp: string;
  attachment: StagedAttachment | null;
  dispose(): Promise<void>;
};

export type LeadServiceDependencies = {
  config: LeadWebConfig;
  repository: Pick<LeadRepository, "consumeIpAttempt" | "findBySubmissionKey" | "accept">;
  scanner: Pick<ClamAvScanner, "scan">;
  objectStore: Pick<PrivateAttachmentStore, "putFile" | "delete">;
  inspect?: typeof inspectAttachment;
};

export function createLeadService({ config, repository, scanner, objectStore, inspect = inspectAttachment }: LeadServiceDependencies) {
  return {
    async accept(input: LeadServiceInput): Promise<ServiceDecision> {
      let uploadedKey: string | undefined;
      const compensate = async () => {
        const key = uploadedKey;
        uploadedKey = undefined;
        if (key) await objectStore.delete(key);
      };
      try {
        if (input.fields.website) return { kind: "ignored" };
        const fields = normalizeLeadFields(input.fields);
        const context = normalizeLeadContext(input.context);
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.submissionKey)) throw new LeadError("validation_error");
        const ipHash = subjectHash(config.hashKey, "ip", input.requestIp);
        const rate = await repository.consumeIpAttempt(ipHash);
        if (rate.kind === "rate_limited") return rate;
        const existing = await repository.findBySubmissionKey(input.submissionKey);
        const consentVersion = existing?.consentVersion ?? config.consentVersion;
        const fingerprint = requestFingerprint({ fields, context, consentVersion, attachmentSha256: input.attachment?.sha256 ?? null });
        if (existing) {
          if (!fingerprintsEqual(existing.requestFingerprint, fingerprint)) throw new LeadError("idempotency_conflict");
          return { kind: "replayed", response: existing.successResponse };
        }
        let attachment: AcceptCommand["attachment"] = null;
        if (input.attachment) {
          const verified = await inspect(input.attachment);
          const scan = await scanner.scan(verified.path);
          const objectKey = `${config.s3.prefix.replace(/\/+$/, "")}/${randomUUID()}`;
          await objectStore.putFile({ objectKey, path: verified.path, contentType: verified.mediaType });
          uploadedKey = objectKey;
          attachment = {
            objectKey, originalName: verified.originalName, mediaType: verified.mediaType,
            byteSize: verified.byteSize, sha256: verified.sha256, scanMetadata: scan.scanMetadata, scannedAt: scan.scannedAt,
          };
        }
        const result = await repository.accept({
          submissionKey: input.submissionKey, requestFingerprint: fingerprint, fields, context,
          phoneHash: subjectHash(config.hashKey, "phone", fields.phoneDigits), ipHash, consentVersion, attachment,
        });
        if (result.kind === "accepted") uploadedKey = undefined;
        else await compensate();
        if (result.kind === "conflict") throw new LeadError("idempotency_conflict");
        return result;
      } catch (error) {
        try { await compensate(); } catch { throw new LeadError("service_unavailable"); }
        throw error instanceof LeadError ? error : new LeadError("service_unavailable");
      } finally {
        try { await input.dispose(); } catch { throw new LeadError("service_unavailable"); }
      }
    },
  };
}
