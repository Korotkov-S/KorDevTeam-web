import { and, eq, inArray, sql } from "drizzle-orm";
import type { createDb } from "../db/client";
import { contentEntries, contentViewTotals } from "../db/schema";
import { ContentViewError, type ViewReceipt } from "./contracts";

type Database = ReturnType<typeof createDb>;
const SESSION_MS = 30 * 60_000;
const RETENTION_MS = 48 * 60 * 60_000;

export function createContentViewsRepository(db: Database, options: { now: () => Date } = { now: () => new Date() }) {
  async function session(sessionHash: string, register: boolean) {
    return db.transaction(async tx => {
      const now = options.now();
      const expires = new Date(now.getTime() + SESSION_MS);
      if (register) await tx.execute(sql`INSERT INTO content_view_sessions(session_hash,created_at,last_activity_at,expires_at)
        VALUES (${sessionHash},${now},${now},${expires}) ON CONFLICT DO NOTHING`);
      const result = await tx.execute(sql`SELECT expires_at FROM content_view_sessions WHERE session_hash=${sessionHash} FOR UPDATE`);
      if (!result.rows[0] || new Date(result.rows[0].expires_at as string).getTime() <= now.getTime()) throw new ContentViewError("session_expired");
      await tx.execute(sql`UPDATE content_view_sessions SET last_activity_at=${now},expires_at=${expires} WHERE session_hash=${sessionHash}`);
      return { expiresAt: expires.toISOString() };
    });
  }

  return {
    registerSession: (hash: string) => session(hash, true),
    touchSession: (hash: string) => session(hash, false),
    async recordView(sessionHash: string, entryId: string): Promise<ViewReceipt> {
      return db.transaction(async tx => {
        const now = options.now();
        // All writers lock session, then content. Only the receipt insertion can increment.
        const sessions = await tx.execute(sql`SELECT expires_at FROM content_view_sessions WHERE session_hash=${sessionHash} FOR UPDATE`);
        if (!sessions.rows[0] || new Date(sessions.rows[0].expires_at as string).getTime() <= now.getTime()) throw new ContentViewError("session_expired");
        const entries = await tx.execute(sql`SELECT id,kind,slug FROM content_entries WHERE id=${entryId} AND status='published' AND kind IN ('article','case') FOR SHARE`);
        const entry = entries.rows[0];
        if (!entry) throw new ContentViewError("target_unavailable");
        const receipt = await tx.execute(sql`INSERT INTO content_view_receipts(session_hash,entry_id,created_at)
          VALUES (${sessionHash},${entryId},${now}) ON CONFLICT DO NOTHING RETURNING entry_id`);
        const counted = receipt.rows.length === 1;
        const total = counted
          ? await tx.execute(sql`INSERT INTO content_view_totals(entry_id,views) VALUES (${entryId},1)
              ON CONFLICT(entry_id) DO UPDATE SET views=content_view_totals.views+1 RETURNING views::text AS views`)
          : await tx.execute(sql`SELECT views::text AS views FROM content_view_totals WHERE entry_id=${entryId}`);
        const kind = entry.kind as "article" | "case";
        return { counted, views: String(total.rows[0]?.views ?? "0"), target: {
          entryId, kind, slug: String(entry.slug), path: `/${kind === "article" ? "blog" : "cases"}/${entry.slug}/`,
        } };
      });
    },
    async readCounts(entryIds: readonly string[]): Promise<Record<string, string>> {
      if (!entryIds.length) return {};
      const rows = await db.select({ id: contentEntries.id, views: contentViewTotals.views }).from(contentEntries)
        .leftJoin(contentViewTotals, eq(contentViewTotals.entryId, contentEntries.id))
        .where(and(inArray(contentEntries.id, [...new Set(entryIds)]), eq(contentEntries.status, "published"), inArray(contentEntries.kind, ["article", "case"])));
      return Object.fromEntries(rows.map(row => [row.id, String(row.views ?? 0n)]));
    },
    async consumeRateLimit(input: { key: string; bucketStart: Date; windowSeconds: number; limit: number }): Promise<boolean> {
      const expiry = new Date(input.bucketStart.getTime() + input.windowSeconds * 1000);
      const result = await db.execute(sql`INSERT INTO content_view_rate_limits(key,bucket_start,count,expires_at)
        VALUES (${input.key},${input.bucketStart},1,${expiry})
        ON CONFLICT(key,bucket_start) DO UPDATE SET count=content_view_rate_limits.count+1
          WHERE content_view_rate_limits.count < ${input.limit}
        RETURNING count`);
      return result.rows.length === 1;
    },
    async cleanup(): Promise<{ sessions: number; rateBuckets: number }> {
      return db.transaction(async tx => {
        const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(4628801021) AS acquired`);
        if (!lock.rows[0]?.acquired) return { sessions: 0, rateBuckets: 0 };
        const now = options.now();
        const bucket = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
        const marker = await tx.execute(sql`INSERT INTO content_view_rate_limits(key,bucket_start,count,expires_at)
          VALUES ('cleanup',${bucket},1,${new Date(bucket.getTime() + 60_000)}) ON CONFLICT DO NOTHING RETURNING key`);
        if (!marker.rows.length) return { sessions: 0, rateBuckets: 0 };
        const sessions = await tx.execute(sql`DELETE FROM content_view_sessions WHERE session_hash IN
          (SELECT session_hash FROM content_view_sessions WHERE expires_at < ${new Date(now.getTime() - RETENTION_MS)} ORDER BY expires_at LIMIT 200) RETURNING session_hash`);
        const rates = await tx.execute(sql`DELETE FROM content_view_rate_limits WHERE (key,bucket_start) IN
          (SELECT key,bucket_start FROM content_view_rate_limits WHERE expires_at <= ${now} ORDER BY expires_at LIMIT 500) RETURNING key`);
        return { sessions: sessions.rows.length, rateBuckets: rates.rows.length };
      });
    },
  };
}

export type ContentViewsRepository = ReturnType<typeof createContentViewsRepository>;
