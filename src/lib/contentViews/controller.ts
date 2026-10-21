import { CONSENT_VERSION } from "../consent";
import type { ViewReceipt } from "./contracts";
import type { LocalViewSession, ViewSessionStore } from "./sessionStore";
export class ViewTransportError extends Error { constructor(public readonly code: string) { super(code); } }
type Body = { sessionToken: string; operation?: "register" | "touch"; entryId?: string };
type Result = ViewReceipt | { expiresAt: string };
export type ViewTransport = (endpoint: "session" | "record", body: Body, signal: AbortSignal) => Promise<Result>;
export function createViewTransport(fetcher: typeof fetch = fetch): ViewTransport {
  return async (endpoint, body, signal) => {
    const response = await fetcher(`/api/content-views/${endpoint}`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, consentVersion: CONSENT_VERSION }), signal });
    const value = await response.json();
    if (!response.ok) throw new ViewTransportError(value?.error?.code ?? "unavailable");
    if (endpoint === "session") {
      if (typeof value?.expiresAt !== "string") throw new ViewTransportError("malformed");
    } else if (typeof value?.counted !== "boolean" || typeof value?.views !== "string" || !/^\d+$/.test(value.views)
      || value?.target?.entryId !== body.entryId || !["article", "case"].includes(value?.target?.kind) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value?.target?.slug)
      || value.target.path !== `/${value.target.kind === "article" ? "blog" : "cases"}/${value.target.slug}/`) throw new ViewTransportError("malformed");
    return value;
  };
}
export function createContentViewsController(deps: { store: ViewSessionStore; transport: ViewTransport; clock: () => number; isConsentCurrent: () => boolean }) {
  let disposed = false, registered: string | null = null;
  let activation: Promise<LocalViewSession | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<AbortController>();
  const live = () => !disposed && deps.isConsentCurrent();
  async function send(endpoint: "session" | "record", body: Body): Promise<Result> {
    if (!live()) throw new ViewTransportError("consent_required");
    const abort = new AbortController(); pending.add(abort);
    const timeout = setTimeout(() => abort.abort(), 5000);
    try { return await deps.transport(endpoint, body, abort.signal); }
    finally { clearTimeout(timeout); pending.delete(abort); }
  }
  async function register(s: LocalViewSession): Promise<LocalViewSession | null> {
    if (!live()) return null;
    if (registered !== s.token) {
      await send("session", { operation: "register", sessionToken: s.token });
      if (!live()) return null;
      registered = s.token;
      await deps.store.claimActivitySend(s.token, deps.clock());
    }
    return live() ? s : null;
  }
  async function ensure(): Promise<LocalViewSession | null> {
    if (!live()) return null;
    if (!activation) activation = (async () => {
      const s = await deps.store.getOrCreate(deps.clock());
      if (!live()) { await deps.store.clear(); return null; }
      if (!s) return null;
      try { return await register(s); }
      catch (error) {
        if (!(error instanceof ViewTransportError) || error.code !== "session_expired" || !live()) throw error;
        const next = await deps.store.rotate(s.token, deps.clock());
        return next && live() ? register(next) : null;
      }
    })().finally(() => { activation = null; });
    return activation;
  }
  async function activity() {
    if (!live()) return;
    try {
      const s = await deps.store.noteActivity(deps.clock()); if (!s || !live()) return;
      if (registered !== s.token) { await register(s); return; }
      if (await deps.store.claimActivitySend(s.token, deps.clock())) {
        try { await send("session", { operation: "touch", sessionToken: s.token }); }
        catch (error) {
          if (error instanceof ViewTransportError && error.code === "session_expired" && live()) {
            const next = await deps.store.rotate(s.token, deps.clock()); if (next && live()) await register(next);
          }
        }
      } else if (s.lastActivityAt > s.lastSentAt && !timer) {
        timer = setTimeout(() => { timer = undefined; if (live()) void flush(); }, Math.max(1, 60_000 - (deps.clock() - s.lastSentAt)));
      }
    } catch { /* storage/network failure never blocks reading */ }
  }
  async function flush() {
    if (!live()) return;
    // A flush must not note fresh activity: only an unsent real action can renew.
    try {
      const s = await deps.store.current();
      if (!s || !live() || deps.clock() - s.lastActivityAt >= 1_800_000 || s.lastActivityAt <= s.lastSentAt) return;
      if (await deps.store.claimActivitySend(s.token, deps.clock())) await send("session", { operation: "touch", sessionToken: s.token });
    } catch { /* one bounded attempt */ }
  }
  return {
    async activate() { try { await ensure(); } catch { /* fail soft */ } },
    activity() { void activity(); },
    async record(entryId: string): Promise<ViewReceipt | null> {
      try {
        let s = await ensure(); if (!s || !live()) return null;
        let result: Result;
        try { result = await send("record", { sessionToken: s.token, entryId }); }
        catch (error) {
          if (!(error instanceof ViewTransportError) || error.code !== "session_expired" || !live()) return null;
          s = await deps.store.rotate(s.token, deps.clock()); if (!s || !await register(s) || !live()) return null;
          result = await send("record", { sessionToken: s.token, entryId });
        }
        const current = live() ? await deps.store.current() : null;
        return live() && current?.token === s.token && "counted" in result ? result : null;
      } catch { return null; }
    },
    dispose() { disposed = true; registered = null; clearTimeout(timer); for (const abort of pending) abort.abort(); pending.clear(); },
  };
}
