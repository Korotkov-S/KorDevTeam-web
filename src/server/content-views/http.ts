import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { getDb } from "../db/client";
import { ContentViewError } from "./contracts";
import { readContentViewsConfig, type ContentViewsConfig } from "./config";
import { createContentViewsRepository, type ContentViewsRepository } from "./repository";
import { hashViewKey, isAutomatedRequest, parseViewRequest, ViewHttpError } from "./security";

type ViewLog = { request_id: string; code: string; status: number; duration_ms: number };
export function createContentViewsRouter(overrides: { repository?: ContentViewsRepository; config?: ContentViewsConfig; clock?: () => Date; log?: (record: ViewLog) => void } = {}): Router {
  const router = Router();
  const clock = overrides.clock ?? (() => new Date());
  const parse = express.json({ limit: 4096, strict: true, inflate: false });
  let repository = overrides.repository;
  // This terminal boundary owns every method/path/error before generic logging/parsing.
  router.use(async (req, res) => {
    const request_id = randomUUID(); const start = performance.now(); let code = "unavailable";
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.vary("Origin");
    const fail = (safeCode: string, status: number) => {
      code = safeCode;
      if (status === 429 || status === 503) res.set("Retry-After", "60");
      return res.status(status).json({ error: { code: safeCode } });
    };
    try {
      if (!["/session", "/record"].includes(req.path)) return fail("target_unavailable", 404);
      if (req.method !== "POST") { res.set("Allow", "POST"); return fail("method_not_allowed", 405); }
      const config = overrides.config ?? readContentViewsConfig(process.env);
      if (!config.enabled) return fail("disabled", 503);
      if (config.production && !req.secure) return fail("https_required", 426);
      if (req.get("origin") !== config.trustedOrigin.origin || req.get("sec-fetch-site") !== "same-origin") return fail("origin_forbidden", 403);
      if (isAutomatedRequest({ userAgent: req.get("user-agent"), purpose: req.get("purpose"), secPurpose: req.get("sec-purpose") })) return fail("automated_request", 403);
      if (!req.is("application/json")) return fail("unsupported_media_type", 415);
      await new Promise<void>((resolve, reject) => parse(req, res, error => error ? reject(error) : resolve()));
      const input = req.path === "/session" ? parseViewRequest("session", req.body) : parseViewRequest("record", req.body);
      const repo = repository ??= createContentViewsRepository(getDb(), { now: clock });
      const now = clock();
      const hash = hashViewKey(config.hashKey!, "session", input.sessionToken);
      const ipKey = hashViewKey(config.hashKey!, "rate-ip", req.ip ?? req.socket.remoteAddress ?? "unknown");
      const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
      const limited = !await repo.consumeRateLimit({ key: `ip:${ipKey}`, bucketStart: minute, windowSeconds: 60, limit: 600 })
        || !await repo.consumeRateLimit({ key: `session:${hash}`, bucketStart: minute, windowSeconds: 60, limit: 120 });
      if (limited) return fail("rate_limited", 429);
      if ("operation" in input && input.operation === "register" && !await repo.consumeRateLimit({ key: `register:${ipKey}`, bucketStart: new Date(Math.floor(now.getTime() / 600_000) * 600_000), windowSeconds: 600, limit: 60 })) return fail("rate_limited", 429);
      // Retention is opportunistic and bounded; failure never masks a successful receipt.
      try { await repo.cleanup(); } catch { /* the principal operation reports DB availability */ }
      const result = "operation" in input
        ? await (input.operation === "register" ? repo.registerSession(hash) : repo.touchSession(hash))
        : await repo.recordView(hash, input.entryId);
      code = "ok"; return res.json(result);
    } catch (error) {
      if (error instanceof ViewHttpError) return fail(error.code, error.status);
      if (error instanceof ContentViewError) return fail(error.code, error.code === "session_expired" ? 409 : 404);
      const type = (error as { type?: string })?.type;
      if (type === "entity.too.large") return fail("body_too_large", 413);
      if (type === "entity.parse.failed" || type === "request.aborted") return fail("malformed", 400);
      if (type === "encoding.unsupported" || type === "charset.unsupported") return fail("unsupported_media_type", 415);
      return fail("unavailable", 503);
    } finally {
      if (!req.readableEnded) req.resume();
      try { (overrides.log ?? (record => console.info(JSON.stringify(record))))({ request_id, code, status: res.statusCode, duration_ms: Math.max(0, Math.round(performance.now() - start)) }); } catch { /* never log raw error fallback */ }
    }
  });
  return router;
}
