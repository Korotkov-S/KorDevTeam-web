export type LocalViewSession = { token: string; generation: number; lastActivityAt: number; lastSentAt: number };
const TTL = 1_800_000;
export function createViewSessionStore() {
  let opening: Promise<IDBDatabase | null> | undefined;
  function open(): Promise<IDBDatabase | null> {
    return opening ??= new Promise(resolve => {
      try {
        const request = indexedDB.open("kordev-content-views", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("session");
        request.onerror = request.onblocked = () => resolve(null);
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
      } catch { resolve(null); }
    });
  }
  function fresh(now: number, generation: number): LocalViewSession {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return { token, generation, lastActivityAt: now, lastSentAt: now - 60_000 };
  }
  function valid(value: unknown): value is LocalViewSession {
    if (!value || typeof value !== "object") return false;
    const s = value as LocalViewSession;
    return typeof s.token === "string" && /^[\w-]{43}$/.test(s.token) && Number.isSafeInteger(s.generation) && Number.isFinite(s.lastActivityAt) && Number.isFinite(s.lastSentAt);
  }
  async function change<T>(run: (value: LocalViewSession | null, store: IDBObjectStore) => T, fallback: T): Promise<T> {
    const db = await open(); if (!db) return fallback;
    return new Promise(resolve => {
      try {
        const tx = db.transaction("session", "readwrite"); const store = tx.objectStore("session"); const request = store.get("current"); let result = fallback;
        tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => resolve(fallback);
        request.onsuccess = () => { try { result = run(valid(request.result) ? request.result : null, store); } catch { tx.abort(); } };
      } catch { resolve(fallback); }
    });
  }
  const active = (s: LocalViewSession | null, now: number) => s && now - s.lastActivityAt < TTL;
  return {
    current(): Promise<LocalViewSession | null> { return change(s => s, null); },
    getOrCreate(now: number): Promise<LocalViewSession | null> {
      return change((s, store) => { if (active(s, now)) return s; const next = fresh(now, (s?.generation ?? 0) + 1); store.put(next, "current"); return next; }, null);
    },
    rotate(expectedToken: string, now: number): Promise<LocalViewSession | null> {
      return change((s, store) => {
        if (!s) return null; // Revocation is not permission to recreate a generation.
        if (s.token !== expectedToken) return s;
        const next = fresh(now, s.generation + 1); store.put(next, "current"); return next;
      }, null);
    },
    noteActivity(now: number): Promise<LocalViewSession | null> {
      return change((s, store) => {
        if (!s) return null;
        const next = active(s, now) ? { ...s, lastActivityAt: Math.max(now, s.lastActivityAt) } : fresh(now, s.generation + 1);
        store.put(next, "current"); return next;
      }, null);
    },
    claimActivitySend(expectedToken: string, now: number): Promise<boolean> {
      return change((s, store) => {
        if (!s || s.token !== expectedToken || !active(s, now) || now - s.lastSentAt < 60_000) return false;
        store.put({ ...s, lastSentAt: now }, "current"); return true;
      }, false);
    },
    async clear(): Promise<void> { await change((_s, store) => { store.delete("current"); return null; }, null); },
  };
}
export type ViewSessionStore = ReturnType<typeof createViewSessionStore>;
