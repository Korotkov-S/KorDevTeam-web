import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { Router } from "express";
import { getDb } from "../db/client";
import { ClamAvScanner } from "./clamav";
import { readLeadWebConfig } from "./config";
import { LeadError, leadErrorStatuses, type LeadErrorCode } from "./errors";
import { parseLeadMultipart, sweepStagedUploads } from "./multipart";
import { createPrivateAttachmentStore } from "./objectStore";
import { createLeadRepository } from "./repository";
import { createLeadService, type LeadServiceDependencies } from "./service";

const messages: Record<LeadErrorCode, string> = {
  validation_error: "Проверьте данные заявки и повторите отправку.",
  idempotency_conflict: "Эта отправка уже содержит другие данные. Начните новую заявку.",
  file_too_large: "Файл слишком большой. Максимальный размер — 25 МиБ.",
  unsupported_file_type: "Этот формат файла не поддерживается.",
  unsafe_file: "Файл не прошёл проверку безопасности. Выберите другой файл.",
  rate_limit_exceeded: "Слишком много заявок. Повторите попытку позже.",
  storage_unavailable: "Не удалось сохранить файл. Повторите попытку позже.",
  scan_unavailable: "Проверка файла временно недоступна. Повторите попытку позже.",
  service_unavailable: "Приём заявок временно недоступен. Повторите попытку позже.",
  internal_error: "Не удалось обработать заявку. Повторите попытку позже.",
};

type LeadLog = { request_id: string; status: number; code: LeadErrorCode | "accepted" | "replayed" | "ignored"; duration_ms: number };
export type LeadRouterOverrides = Partial<LeadServiceDependencies> & {
  log?: (record: LeadLog) => void;
  sweepUploads?: typeof sweepStagedUploads;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const retryAfter = (seconds = 60) => Number.isFinite(seconds) ? Math.max(1, Math.min(3_600, Math.ceil(seconds))) : 60;

/** Dependencies are lazy so liveness still works when readiness fails configuration. */
export function createLeadRouter(overrides: LeadRouterOverrides = {}): Router {
  const router = Router();
  const production = process.env.NODE_ENV === "production";
  const log = overrides.log ?? ((record: LeadLog) => console.info(JSON.stringify(record)));
  let configured: { tempRoot: string; service: ReturnType<typeof createLeadService>; startupSweep: Promise<number> } | undefined;
  const dependencies = () => {
    if (!configured) {
      const config = overrides.config ?? readLeadWebConfig(process.env);
      const service = createLeadService({
        config,
        repository: overrides.repository ?? createLeadRepository(getDb(), { now: () => new Date() }),
        scanner: overrides.scanner ?? new ClamAvScanner(config.clamav),
        objectStore: overrides.objectStore ?? createPrivateAttachmentStore(config.s3),
        inspect: overrides.inspect,
      });
      configured = {
        tempRoot: config.tempRoot,
        service,
        startupSweep: (overrides.sweepUploads ?? sweepStagedUploads)(config.tempRoot, new Date(Date.now() - 2 * 60 * 60_000)),
      };
    }
    return configured;
  };

  // Terminate every request in this boundary, before generic CORS, body parsers or logging.
  router.use(async (req, res) => {
    const requestId = randomUUID();
    const start = performance.now();
    let code: LeadLog["code"] = "service_unavailable";
    const nativeNavigation = req.method === "POST"
      && req.get("sec-fetch-mode") === "navigate"
      && (req.get("accept") ?? "").includes("text/html");
    res.set("Cache-Control", "no-store");
    res.vary("Origin");
    res.set("X-Content-Type-Options", "nosniff");
    const fail = (errorCode: LeadErrorCode, status: number = leadErrorStatuses[errorCode], delay?: number) => {
      code = errorCode;
      if (status === 429 || status === 503) res.set("Retry-After", String(retryAfter(delay)));
      if (nativeNavigation) return res.redirect(303, "/#lead-submit-error");
      return res.status(status).json({ error: { code: errorCode, message: messages[errorCode] }, request_id: requestId });
    };
    try {
      if (req.path !== "/") return fail("validation_error", 404);
      if (req.method !== "POST") {
        res.set("Allow", "POST");
        return fail("validation_error", 405);
      }
      if (production && !req.secure) return fail("validation_error", 426);
      const expectedOrigin = production ? "https://kordev.team" : `${req.protocol}://${req.get("host")}`;
      const site = req.get("sec-fetch-site");
      if (req.get("origin") !== expectedOrigin || (site !== undefined && site !== "same-origin")) return fail("validation_error", 403);
      const submissionKey = req.get("idempotency-key") || (nativeNavigation ? randomUUID() : undefined);
      if (!submissionKey || !uuid.test(submissionKey)) return fail("validation_error");
      const { tempRoot, service, startupSweep } = dependencies();
      await startupSweep;
      // The parser destroys its input on rejection. Isolate that destruction from
      // the HTTP socket so an in-flight upload still receives the safe 400/413.
      const body = Object.assign(new PassThrough(), { headers: req.headers });
      const aborted = () => body.destroy(new LeadError("validation_error"));
      body.on("error", () => { /* parseLeadMultipart owns error reporting and cleanup */ });
      req.once("aborted", aborted);
      req.once("error", aborted);
      let parsed: Awaited<ReturnType<typeof parseLeadMultipart>>;
      try {
        req.pipe(body);
        parsed = await parseLeadMultipart(body, tempRoot);
      } finally {
        req.unpipe(body);
        req.off("aborted", aborted);
        req.off("error", aborted);
        body.destroy();
      }
      const { pagePath, referrer, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = parsed.fields;
      const decision = await service.accept({ ...parsed,
        context: { pagePath, referrer, utmSource, utmMedium, utmCampaign, utmContent, utmTerm },
        submissionKey, requestIp: req.ip ?? req.socket.remoteAddress ?? "",
      });
      if (decision.kind === "rate_limited") return fail("rate_limit_exceeded", 429, decision.retryAfterSeconds);
      code = decision.kind;
      if (nativeNavigation) return res.redirect(303, "/#lead-submitted-message");
      if (decision.kind === "ignored") return res.status(202).json({ status: "received" });
      if (decision.kind === "replayed") res.set("Idempotency-Replayed", "true");
      // Explicit projection also protects against extra fields in historical stored JSON.
      return res.status(decision.kind === "accepted" ? 201 : 200).json({ leadId: decision.response.leadId, status: "accepted" });
    } catch (error) {
      const safe = error instanceof LeadError && Object.hasOwn(messages, error.code) ? error : new LeadError("service_unavailable");
      return fail(safe.code, leadErrorStatuses[safe.code], safe.retryAfterSeconds);
    } finally {
      if (!req.readableEnded) req.resume();
      // Logging failures cannot fall through to the generic error handler with request details.
      try { log({ request_id: requestId, status: res.statusCode, code, duration_ms: Math.max(0, Math.round(performance.now() - start)) }); } catch { /* no sensitive fallback */ }
    }
  });
  return router;
}
