/** Process-local published-read cache. All service instances for a DB must share it. */
export class ContentCache {
  private records = new Map<string, { value: unknown; expiresAt: number }>();
  private generation = 0;

  constructor(private readonly now: () => number = Date.now) {}

  get<T>(key: string): T | undefined {
    const record = this.records.get(key);
    if (!record) return undefined;
    if (record.expiresAt <= this.now()) {
      this.records.delete(key);
      return undefined;
    }
    return structuredClone(record.value) as T;
  }

  set(key: string, value: unknown): void {
    this.records.delete(key);
    if (this.records.size >= 500) this.records.delete(this.records.keys().next().value!);
    this.records.set(key, { value: structuredClone(value), expiresAt: this.now() + 60000 });
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
