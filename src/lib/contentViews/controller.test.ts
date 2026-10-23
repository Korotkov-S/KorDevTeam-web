import assert from "node:assert/strict";
import test from "node:test";
import { createContentViewsController, ViewTransportError, createViewTransport } from "./controller";
import type { ViewSessionStore, LocalViewSession } from "./sessionStore";
import type { ViewReceipt } from "./contracts";
const receipt: ViewReceipt = { counted: true, views: "1", target: { entryId: "a", kind: "article", slug: "a", path: "/blog/a/" } };
function fixture() {
  let session: LocalViewSession | null = { token: "first", generation: 1, lastActivityAt: 0, lastSentAt: -60_000 };
  let allowed = true, time = 0, reads = 0;
  const calls: string[] = [];
  const store: ViewSessionStore = {
    async getOrCreate() { reads++; return session; },
    async current() { return session; },
    async rotate(expected, now) { if (session?.token === expected) session = { token: "second", generation: 2, lastActivityAt: now, lastSentAt: now }; return session; },
    async noteActivity(now) { if (session) session.lastActivityAt = now; return session; },
    async claimActivitySend(token, now) { if (!session || token !== session.token || now - session.lastSentAt < 60_000) return false; session.lastSentAt = now; return true; },
    async clear() { session = null; },
  };
  return { store, calls, clock: () => time, isConsentCurrent: () => allowed, advance: (ms: number) => { time += ms; }, reject: () => { allowed = false; }, reads: () => reads, session: () => session };
}
test("no storage or network until current accepted consent; blocked storage is fail-soft", async () => {
  const f = fixture(); f.reject();
  const c = createContentViewsController({ ...f, transport: async () => { assert.fail("network before consent"); } });
  await c.activate(); assert.equal(await c.record("a"), null); assert.equal(f.reads(), 0); c.dispose();
  const blocked = createContentViewsController({ ...fixture(), store: { ...f.store, getOrCreate: async () => null }, transport: async () => assert.fail("blocked storage") });
  assert.equal(await blocked.record("a"), null); blocked.dispose();
});
test("parallel activation coalesces registration and records only after it succeeds", async () => {
  const f = fixture();
  const c = createContentViewsController({ ...f, transport: async (path) => { f.calls.push(path); return path === "record" ? receipt : { expiresAt: "date" }; } });
  await Promise.all([c.activate(), c.activate()]);
  assert.deepEqual(f.calls, ["session"]);
  assert.deepEqual(await c.record("a"), receipt); assert.deepEqual(f.calls, ["session", "record"]); c.dispose();
});
test("only expired session rotates once; network/rate errors never loop", async () => {
  const f = fixture(); let expired = false;
  const c = createContentViewsController({ ...f, transport: async (path, body) => {
    f.calls.push(`${path}:${body.sessionToken}`);
    if (path === "record" && !expired) { expired = true; throw new ViewTransportError("session_expired"); }
    return path === "record" ? receipt : { expiresAt: "date" };
  } });
  assert.deepEqual(await c.record("a"), receipt);
  assert.deepEqual(f.calls, ["session:first", "record:first", "session:second", "record:second"]); c.dispose();
  for (const code of ["unavailable", "rate_limited", "session_expired"]) {
    let calls = 0; const failing = createContentViewsController({ ...fixture(), transport: async () => { calls++; throw new ViewTransportError(code); } });
    assert.equal(await failing.record("a"), null); assert.ok(calls <= 2); failing.dispose();
  }
});
test("late replies after revocation are discarded and aborted, not resurrected", async () => {
  const f = fixture(); let finish: (value: ViewReceipt) => void = () => {}; let signal: AbortSignal | undefined;
  const c = createContentViewsController({ ...f, transport: async (path, _body, currentSignal) => {
    if (path === "session") return { expiresAt: "date" };
    signal = currentSignal; return new Promise(resolve => { finish = resolve; });
  } });
  await c.activate(); const pending = c.record("a"); await new Promise(resolve => setTimeout(resolve, 0));
  f.reject(); c.dispose(); await f.store.clear(); finish(receipt);
  assert.equal(await pending, null); assert.equal(signal?.aborted, true); assert.equal(f.session(), null);
});
test("activity is shared-throttled; an idle timer never sends a renewal", async () => {
  const f = fixture();
  const c = createContentViewsController({ ...f, transport: async (path, body) => { f.calls.push(`${path}:${body.operation ?? "record"}`); return { expiresAt: "date" }; } });
  await c.activate(); c.activity(); c.activity(); await new Promise(resolve => setTimeout(resolve, 0));
  const before = f.calls.length; f.advance(60_000); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.calls.length, before);
  c.activity(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.calls.filter(v => v === "session:touch").length, 1); c.dispose();
});
test("real transport binds same-origin no-store and current consent, aborts instead of retrying", async () => {
  let requests = 0;
  const transport = createViewTransport(async (url, init) => {
    requests++; assert.equal(url, "/api/content-views/record"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store");
    assert.equal(JSON.parse(String(init?.body)).sessionToken, "first");
    return new Response(JSON.stringify({ error: { code: "rate_limited" } }), { status: 429 });
  });
  await assert.rejects(() => transport("record", { sessionToken: "first", entryId: "a" }, new AbortController().signal), /rate_limited/); assert.equal(requests, 1);
});
test("a delayed renewal never creates a session after 30 idle minutes", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const c = createContentViewsController({ ...f, transport: async () => ({ expiresAt: "date" }) });
  await c.activate(); f.advance(1000); c.activity(); await Promise.resolve(); await Promise.resolve();
  const reads = f.reads(); f.advance(1_800_000); t.mock.timers.tick(60_000); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.reads(), reads); c.dispose();
});
test("a receipt from a retired cross-tab generation cannot emit a unique goal", async () => {
  const f = fixture(); let finish: (value: ViewReceipt) => void = () => {};
  const c = createContentViewsController({ ...f, transport: async path => path === "record" ? new Promise(resolve => { finish = resolve; }) : { expiresAt: "date" } });
  await c.activate(); const pending = c.record("a"); await new Promise(resolve => setTimeout(resolve, 0));
  await f.store.rotate("first", 1); finish(receipt); assert.equal(await pending, null); c.dispose();
});
test("retired activation cannot clear the accepted replacement controller's shared session", async () => {
  const f = fixture(); let release: (value: LocalViewSession | null) => void = () => {};
  let first = true;
  const store = { ...f.store, getOrCreate: async () => first ? (first = false, await new Promise<LocalViewSession | null>(resolve => { release = resolve; })) : f.store.getOrCreate(0) };
  const transport = async (path: "session" | "record") => path === "record" ? receipt : { expiresAt: "date" };
  const old = createContentViewsController({ ...f, store, transport });
  const activation = old.activate(); old.dispose();
  const current = createContentViewsController({ ...f, store, transport });
  assert.deepEqual(await current.record("a"), receipt);
  release(f.session()); await activation;
  assert.ok(await store.current(), "old cleanup must not erase the live session");
  assert.deepEqual(await current.record("a"), receipt); current.dispose();
});
