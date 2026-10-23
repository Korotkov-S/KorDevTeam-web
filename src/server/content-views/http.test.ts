import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { Readable } from "node:stream";
import { createContentViewsRouter } from "./http";
import { ContentViewError } from "./contracts";
import { CONSENT_VERSION } from "../../lib/consent";

const sessionToken = Buffer.alloc(32, 1).toString("base64url");
const entryId = "00000000-0000-4000-8000-000000000001";
const body = { sessionToken, entryId, consentVersion: CONSENT_VERSION };
async function start(t: TestContext, options: { production?: boolean; enabled?: boolean; limited?: boolean; expired?: boolean; unavailable?: boolean } = {}) {
  let writes = 0; const logs: unknown[] = []; const keys: string[] = [];
  const app = express(); app.set("trust proxy", false);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  app.use("/api/content-views", createContentViewsRouter({
    config: { enabled: options.enabled ?? true, trustedOrigin: new URL(origin), hashKey: Buffer.alloc(32, 9), production: options.production ?? false },
    repository: {
      async registerSession(hash) { writes++; keys.push(hash); return { expiresAt: "2026-10-21T09:30:00Z" }; },
      async touchSession() { writes++; return { expiresAt: "2026-10-21T09:30:00Z" }; },
      async recordView(hash) { writes++; keys.push(hash); if (options.expired) throw new ContentViewError("session_expired"); if (options.unavailable) throw Error("password raw-token 127.0.0.1"); return { counted: true, views: "1", target: { entryId, kind: "article", slug: "article", path: "/blog/article/" } }; },
      async consumeRateLimit(input) { keys.push(input.key); return !options.limited; },
      async cleanup() { return { sessions: 0, rateBuckets: 0 }; }, async readCounts() { return {}; },
    }, log: record => logs.push(record),
  }));
  app.use(() => assert.fail("boundary fell through"));
  return { origin, logs, keys, writes: () => writes, post: (patch: RequestInit = {}, endpoint = "record") => fetch(`${origin}/api/content-views/${endpoint}`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify(body), ...patch }) };
}
test("eligible writes hash tokens, return receipts and terminate before generic middleware", async t => {
  const s = await start(t);
  const response = await s.post(); assert.equal(response.status, 200); assert.equal((await response.json()).views, "1");
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(s.writes(), 1); assert.ok(s.keys.every(key => !key.includes(sessionToken) && !key.includes("127.0.0.1")));
  const registered = await s.post({ body: JSON.stringify({ operation: "register", sessionToken, consentVersion: CONSENT_VERSION }) }, "session"); assert.equal(registered.status, 200);
  assert.doesNotMatch(JSON.stringify(s.logs), new RegExp(`${sessionToken}|127\\.0\\.0\\.1|password`));
});
test("methods, wrong origin, bot, prefetch, malformed bodies and stale consent never write", async t => {
  const s = await start(t);
  for (const method of ["GET", "HEAD"]) assert.equal((await s.post({ method, body: undefined })).status, 405);
  for (const headers of [{ origin: "https://evil.test" }, { origin: s.origin, "sec-fetch-site": "cross-site" }, { origin: s.origin, "user-agent": "Googlebot" }, { origin: s.origin, purpose: "prefetch" }, { origin: s.origin, "sec-purpose": "prefetch;prerender" }]) assert.equal((await s.post({ headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers } })).status, 403);
  assert.equal((await s.post({ body: JSON.stringify({ ...body, consentVersion: "old" }) })).status, 403);
  assert.equal((await s.post({ body: JSON.stringify({ ...body, password: "sentinel" }) })).status, 400);
  assert.equal((await s.post({ body: "{" })).status, 400);
  assert.equal((await s.post({ headers: { origin: s.origin, "sec-fetch-site": "same-origin", "content-type": "text/plain" } })).status, 415);
  assert.equal((await s.post({}, "missing")).status, 404);
  assert.equal(s.writes(), 0);
});
test("chunked oversized JSON is bounded to 4KiB and its body is never logged", async t => {
  const s = await start(t);
  const response = await s.post({ body: Readable.from(["{\"secret\":\"", "x".repeat(5000), "\"}"]) as unknown as BodyInit, duplex: "half" } as RequestInit);
  assert.equal(response.status, 413); assert.equal(s.writes(), 0); assert.doesNotMatch(JSON.stringify(s.logs), /secret/);
});
test("HTTPS production cannot be spoofed through caller headers; failures stay safe and bounded", async t => {
  const insecure = await start(t, { production: true });
  assert.equal((await insecure.post({ headers: { origin: insecure.origin, "content-type": "application/json", "x-forwarded-proto": "https", "x-kordev-client-ip": "spoof" } })).status, 426);
  for (const [options, status, code] of [[{ enabled: false }, 503, "disabled"], [{ limited: true }, 429, "rate_limited"], [{ expired: true }, 409, "session_expired"], [{ unavailable: true }, 503, "unavailable"]] as const) {
    const s = await start(t, options); const response = await s.post(); assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: { code } });
    if (status === 429) assert.equal(response.headers.get("retry-after"), "60");
    assert.doesNotMatch(JSON.stringify(s.logs), /password|raw-token|127\.0\.0\.1/);
  }
});
