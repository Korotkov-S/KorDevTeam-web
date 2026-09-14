import { openAsBlob } from "node:fs";
import { z } from "zod";
import type { LeadWorkerConfig } from "./config";
import { DeliveryFailure } from "./retry";

/** Worker owns materialization and finally-disposal of this immutable local file. */
export type DeliveryEnvelope = Readonly<{
  leadId: string;
  jobId: string;
  acceptedAt: Date;
  name: string;
  phone: string;
  description: string | null;
  pagePath: string;
  referrer: string | null;
  attachment: Readonly<{ path: string; originalName: string; mediaType: string; sha256: string }> | null;
}>;

export type CrmReceipt = {
  requestId: string | null;
  taskId: number;
  taskCode: string;
  taskStatus: string;
  dueDate: string;
  replayed: boolean;
  rateLimit: number | null;
  rateRemaining: number | null;
};

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).refine((value) => {
  const iso = `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isFinite(+date) && date.toISOString().replace(".000Z", "Z") === iso;
});
const successSchema = z.strictObject({
  data: z.strictObject({
    request_id: z.uuid().nullable(),
    task: z.strictObject({ id: z.number().int().min(1), code: z.string(), title: z.string(), status: z.string(), due_date: localDateTime }),
  }),
});
const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(), message: z.string(),
    field_errors: z.record(z.string(), z.string()).optional(), details: z.record(z.string(), z.unknown()).optional(),
  }),
  request_id: z.uuid().nullable(),
});

function integerHeader(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function invalidResponse(): never { throw new DeliveryFailure({ kind: "manual_action", code: "crm_invalid_response" }); }

async function responseJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch (error) {
    if (error instanceof SyntaxError) invalidResponse();
    // An interrupted response body is still an ambiguous network delivery.
    throw new DeliveryFailure({ kind: "retry" });
  }
}

export async function sendToCrm(envelope: DeliveryEnvelope, config: LeadWorkerConfig["crm"], fetchImpl: typeof fetch = fetch): Promise<CrmReceipt> {
  const form = new FormData();
  form.set("name", envelope.name);
  form.set("phone", envelope.phone);
  if (envelope.description) form.set("description", envelope.description);
  if (envelope.attachment) {
    try {
      form.set("file", await openAsBlob(envelope.attachment.path, { type: envelope.attachment.mediaType }), envelope.attachment.originalName);
    } catch { throw new DeliveryFailure({ kind: "manual_action", code: "attachment_read_failed" }); }
  }
  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${config.token}`, "Idempotency-Key": envelope.leadId, "X-Request-Id": envelope.jobId },
      body: form, signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new DeliveryFailure({ kind: "retry" }); }

  if (response.status === 429 || response.status >= 500) {
    const seconds = integerHeader(response.headers.get("Retry-After"));
    await response.body?.cancel().catch(() => undefined);
    throw new DeliveryFailure(response.status === 429 && seconds !== null && seconds >= 1 && seconds <= 3600
      ? { kind: "retry", retryAfterSeconds: seconds } : { kind: "retry" });
  }
  if (response.status === 201) {
    if (response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") invalidResponse();
    const parsed = successSchema.safeParse(await responseJson(response));
    if (!parsed.success) invalidResponse();
    const trace = response.headers.get("X-Request-Id"), replayed = response.headers.get("Idempotency-Replayed");
    if (trace !== null && !z.uuid().safeParse(trace).success || replayed !== null && replayed !== "true") invalidResponse();
    const { request_id, task } = parsed.data.data;
    return {
      requestId: request_id, taskId: task.id, taskCode: task.code, taskStatus: task.status, dueDate: task.due_date,
      replayed: replayed === "true", rateLimit: integerHeader(response.headers.get("X-RateLimit-Limit")), rateRemaining: integerHeader(response.headers.get("X-RateLimit-Remaining")),
    };
  }
  if (![400, 401, 403, 409, 413, 415].includes(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    throw new DeliveryFailure({ kind: "manual_action", code: "crm_unexpected_status" });
  }
  const payloadRejected = [400, 413, 415].includes(response.status);
  const invalidError = (): never => {
    if (payloadRejected) throw new DeliveryFailure({ kind: "terminal", code: "crm_payload_rejected" });
    invalidResponse();
  };
  let errorBody: unknown;
  try { errorBody = await response.json(); } catch { invalidError(); }
  const parsed = errorSchema.safeParse(errorBody);
  if (!parsed.success) invalidError();
  const code = parsed.data.error.code;
  const codes: Record<number, readonly string[]> = {
    400: ["validation_error"], 401: ["invalid_token", "token_expired", "token_revoked"],
    403: ["scope_forbidden", "board_forbidden", "intake_disabled"],
    409: ["configuration_invalid", "idempotency_in_progress", "idempotency_conflict"],
    413: ["file_too_large"], 415: ["unsupported_file_type"],
  };
  if (!codes[response.status].includes(code)) invalidError();
  if (response.status === 409 && code === "idempotency_in_progress") throw new DeliveryFailure({ kind: "retry" });
  throw new DeliveryFailure({ kind: payloadRejected ? "terminal" : "manual_action", code });
}
