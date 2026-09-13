const MAX_TTL_SECONDS = 60;

/** Only single-process development/test may opt into a process-local read cache. */
export function contentCacheTtlSeconds(environment: Readonly<Record<string, string | undefined>> = process.env): number {
  const local = environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
  const configured = environment.CONTENT_CACHE_TTL_SECONDS;
  if (configured === undefined) return local ? MAX_TTL_SECONDS : 0;
  if (!/^(0|[1-9][0-9]*)$/.test(configured)) throw new Error("content_cache_config_invalid");
  const ttl = Number(configured);
  validateTtl(ttl);
  if (!local && ttl !== 0) throw new Error("content_cache_config_invalid");
  return ttl;
}

function validateTtl(ttl: number): void {
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > MAX_TTL_SECONDS) throw new Error("content_cache_config_invalid");
}

/** Production bypasses storage: independent blue/green processes cannot invalidate each other. */
export class ContentCache {
  private records = new Map<string, { value: unknown; expiresAt: number }>();
  private generation = 0;

  constructor(private readonly now: () => number = Date.now, private readonly ttlSeconds = contentCacheTtlSeconds()) {
    validateTtl(ttlSeconds);
    // An injected cache must not accidentally re-enable stale reads in production.
    if (process.env.NODE_ENV === "production" && ttlSeconds !== 0) throw new Error("content_cache_config_invalid");
  }

  get<T>(key: string): T | undefined {
    if (this.ttlSeconds === 0) return undefined;
    const record = this.records.get(key);
    if (!record) return undefined;
    if (record.expiresAt <= this.now()) {
      this.records.delete(key);
      return undefined;
    }
    return structuredClone(record.value) as T;
  }

  set(key: string, value: unknown): void {
    if (this.ttlSeconds === 0) return;
    this.records.delete(key);
    if (this.records.size >= 500) this.records.delete(this.records.keys().next().value!);
    this.records.set(key, { value: structuredClone(value), expiresAt: this.now() + this.ttlSeconds * 1000 });
  }

  invalidate(keys: string[], prefixes: string[] = []): void {
    this.generation++;
    for (const key of keys) this.records.delete(key);
    for (const key of this.records.keys()) {
      if (prefixes.some(prefix => key.startsWith(prefix))) this.records.delete(key);
    }
  }

  async read<T>(key: string, load: () => Promise<T>, shouldCache: (value: T) => boolean = () => true): Promise<T> {
    for (;;) {
      const cached = this.get<T>(key);
      if (cached !== undefined) return cached;
      const generation = this.generation;
      const value = await load();
      // A transaction committed while this query was in flight: query fresh state.
      if (generation !== this.generation) continue;
      if (shouldCache(value)) this.set(key, value);
      return value;
    }
  }
}
