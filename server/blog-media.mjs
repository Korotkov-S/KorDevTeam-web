import express from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { mediaBase, mediaType } from "./blog-media-paths.mjs";

const singleRange = /^bytes=(?:\d{1,15}-\d{0,15}|-\d{1,15})$/u;

export function createBlogMediaRouter({
  base = process.env.PUBLIC_MEDIA_BASE_URL,
  fetchMedia = fetch,
} = {}) {
  const router = express.Router();
  const upstreamBase = mediaBase(base);
  router.use(async (req, res) => {
    const key = req.path.slice(1);
    const expectedType = mediaType(key);
    if (!expectedType) return res.status(404).end();
    if (req.method !== "GET" && req.method !== "HEAD") return res.set("Allow", "GET, HEAD").status(405).end();
    const range = req.get("Range");
    if (range && !singleRange.test(range)) return res.status(416).end();
    if (!upstreamBase) return res.status(503).end();

    const abort = new AbortController();
    const disconnected = () => { if (!res.writableFinished) abort.abort(); };
    res.once("close", disconnected);
    const requestHeaders = new Headers({ "accept-encoding": "identity" });
    if (range) requestHeaders.set("range", range);
    const ifRange = req.get("If-Range");
    if (range && ifRange) requestHeaders.set("if-range", ifRange);
    try {
      const upstream = await fetchMedia(new URL(key, upstreamBase), {
        method: req.method,
        headers: requestHeaders,
        redirect: "error",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(90_000)]),
      });
      if (upstream.status === 404 || upstream.status === 416) {
        if (upstream.status === 416 && upstream.headers.has("content-range")) {
          res.set("Content-Range", upstream.headers.get("content-range"));
        }
        await upstream.body?.cancel();
        return res.status(upstream.status).end();
      }
      const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      const encoding = upstream.headers.get("content-encoding");
      if (![200, 206].includes(upstream.status) || type !== expectedType || (encoding && encoding !== "identity") ||
          (upstream.status === 206 && !upstream.headers.has("content-range")) ||
          (req.method === "GET" && !upstream.body)) {
        await upstream.body?.cancel();
        return res.status(502).end();
      }
      for (const name of ["accept-ranges", "content-length", "content-range", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) res.set(name, value);
      }
      res.set({
        "Content-Type": expectedType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable, no-transform",
      });
      res.status(upstream.status);
      if (req.method === "HEAD") return res.end();
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch {
      if (!res.headersSent && !res.destroyed) res.status(502).end();
      else if (!res.destroyed) res.destroy();
    } finally {
      res.off("close", disconnected);
    }
  });
  return router;
}
