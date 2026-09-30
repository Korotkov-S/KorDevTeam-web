import { randomUUID, timingSafeEqual } from "node:crypto";
import { Router, json } from "express";

import { getDb } from "../db/client";
import { createLeadRepository } from "../leads/repository";
import { readVkLeadWebhookConfig, type VkLeadWebhookConfig } from "./config";
import { VkLeadError, type VkLeadErrorCode } from "./errors";
import { createVkLeadService, type VkLeadServiceDependencies } from "./service";

type VkLeadLog = {
  request_id: string;
  status: number;
  code: VkLeadErrorCode | "accepted" | "replayed";
  form_id?: string;
  duration_ms: number;
};

export type VkLeadRouterOverrides = Partial<VkLeadServiceDependencies> & {
  config?: VkLeadWebhookConfig;
  log?: (record: VkLeadLog) => void;
};

function tokenMatches(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  return expectedBytes.byteLength === actualBytes.byteLength && timingSafeEqual(expectedBytes, actualBytes);
}

export function createVkLeadRouter(overrides: VkLeadRouterOverrides = {}): Router {
  const router = Router();
  const log = overrides.log ?? ((record: VkLeadLog) => console.info(JSON.stringify(record)));
  const parse = json({ limit: "64kb", strict: true, type: "application/json" });
  let configured: VkLeadWebhookConfig | undefined;
  let service: ReturnType<typeof createVkLeadService> | undefined;
  const webhookConfig = () => {
    configured ??= overrides.config ?? readVkLeadWebhookConfig(process.env);
    return configured;
  };
  const webhookService = () => {
    if (!service) {
      const config = webhookConfig();
      const repository = overrides.repository ?? createLeadRepository(getDb(), { now: () => new Date() });
      service = createVkLeadService({ config, repository });
    }
    return service;
  };

  router.use("/:token", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    let config: VkLeadWebhookConfig;
    try { config = webhookConfig(); }
    catch { return res.status(503).set("Retry-After", "60").json({ error: { code: "vk_lead_unavailable" } }); }
    if (!tokenMatches(config.pathToken, req.params.token ?? "")) return res.sendStatus(404);
    next();
  });

  router.all("/:token", (req, res, next) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.sendStatus(405);
    }
    if (!req.is("application/json")) return res.sendStatus(415);
    parse(req, res, next);
  }, async (req, res) => {
    const requestId = randomUUID();
    const start = performance.now();
    let code: VkLeadLog["code"] = "vk_lead_unavailable";
    let formId: string | undefined;
    try {
      const body = req.body as { data?: { form_id?: unknown } };
      if (typeof body?.data?.form_id === "string" || typeof body?.data?.form_id === "number") formId = String(body.data.form_id);
      const decision = await webhookService().accept(req.body);
      code = decision.kind;
      return res.status(204).end();
    } catch (error) {
      const safe = error instanceof VkLeadError ? error : new VkLeadError("vk_lead_unavailable");
      code = safe.code;
      const status = safe.code === "vk_lead_payload_invalid" ? 400
        : safe.code === "vk_lead_form_forbidden" ? 403
          : safe.code === "vk_lead_idempotency_conflict" ? 409
            : safe.code === "vk_lead_rate_limited" ? 429
              : 503;
      if (status === 429 || status === 503) res.set("Retry-After", String(safe.retryAfterSeconds ?? 60));
      return res.status(status).json({ error: { code: safe.code }, request_id: requestId });
    } finally {
      try {
        log({ request_id: requestId, status: res.statusCode, code, ...(formId ? { form_id: formId } : {}), duration_ms: Math.max(0, Math.round(performance.now() - start)) });
      } catch { /* logging must not affect webhook acknowledgement */ }
    }
  });

  router.use((error: unknown, _req: unknown, res: { headersSent: boolean; status(code: number): { json(value: unknown): unknown } }, _next: unknown) => {
    if (res.headersSent) return;
    const status = error instanceof SyntaxError ? 400 : (error as { status?: unknown })?.status === 413 ? 413 : 400;
    return res.status(status).json({ error: { code: "vk_lead_payload_invalid" } });
  });

  router.use((_req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendStatus(404);
  });
  return router;
}
