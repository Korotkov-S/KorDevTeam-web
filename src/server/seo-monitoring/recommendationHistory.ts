import { asc, desc, eq, inArray, and, sql, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { seoRecommendations, seoRecommendationHistory } from "../db/schema";
import type { SeoDatabase } from "./repository";

type Transaction = Parameters<Parameters<SeoDatabase["transaction"]>[0]>[0];
type Row = typeof seoRecommendations.$inferSelect;
type Status = Row["status"];
type Create = Omit<typeof seoRecommendations.$inferInsert, "id" | "status" | "createdAt" | "updatedAt">;
export type RecommendationActor = { adminUserId?: string; mcpTokenId?: string; operation?: string };
const statuses = z.enum(["new", "accepted", "rejected", "implemented", "dismissed"]);
function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(v => jsonValue(v, depth + 1));
  return !!value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.values(value).every(v => jsonValue(v, depth + 1));
}
const revisionSchema = z.object({
  id: z.string().uuid(), expectedUpdatedAt: z.string().datetime({ offset: true }),
  title: z.string().trim().min(1).max(300), rationale: z.string().trim().min(1).max(5000),
  evidence: z.record(z.string(), z.unknown()).refine(v => jsonValue(v) && Buffer.byteLength(JSON.stringify(v), "utf8") <= 16384),
  confidence: z.enum(["low", "medium", "high"]), status: statuses.optional(), reason: z.string().trim().min(1).max(2000),
}).strict();
export type RecommendationRevision = z.infer<typeof revisionSchema>;
const transitions: Record<Status, Status[]> = { new: ["accepted", "rejected", "dismissed"], accepted: ["implemented", "dismissed"], rejected: [], implemented: [], dismissed: [] };
const legacyActor = { operation: "legacy-repository" };
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function checkedActor(actor: RecommendationActor): Record<string, string> {
  const s = z.object({ adminUserId: z.string().uuid().optional(), mcpTokenId: z.string().uuid().optional(), operation: z.string().trim().min(1).max(120).optional() }).strict().safeParse(actor);
  if (!s.success || Object.values(s.data).filter(Boolean).length !== 1) throw Error("seo_actor_invalid");
  return s.data as Record<string, string>;
}
export function validateRecommendationRevisions(value: unknown): RecommendationRevision[] {
  try {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 1048576) throw Error();
    const rows = z.array(revisionSchema).min(1).max(100).parse(value);
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw Error();
    return rows;
  } catch { throw Error("seo_recommendation_batch_invalid"); }
}
const snapshot = (row: Row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
const nextTime = (current: Row) => new Date(Math.max(Date.now(), +current.updatedAt + 1));
async function event(tx: Transaction, before: Row | null, after: Row, eventType: string, reason: string, actor: Record<string, string>) {
  await tx.insert(seoRecommendationHistory).values({ recommendationId: after.id, beforeSnapshot: before ? snapshot(before) : null, afterSnapshot: snapshot(after), eventType, reason, actor, createdAt: after.updatedAt });
}
async function revise(tx: Transaction, c: RecommendationRevision, actor: Record<string, string>) {
  const [current] = await tx.select().from(seoRecommendations).where(eq(seoRecommendations.id, c.id)).for("update");
  if (!current) throw Error("seo_recommendation_not_found");
  const fields = { title: c.title, rationale: c.rationale, evidence: c.evidence, confidence: c.confidence, status: c.status ?? current.status };
  if (stable(fields) === stable({ title: current.title, rationale: current.rationale, evidence: current.evidence, confidence: current.confidence, status: current.status })) return { item: current, unchanged: true };
  if (+current.updatedAt !== +new Date(c.expectedUpdatedAt)) throw Error("seo_recommendation_revision_conflict");
  if (fields.status !== current.status && !transitions[current.status].includes(fields.status)) throw Error("seo_recommendation_transition_invalid");
  const [updated] = await tx.update(seoRecommendations).set({ ...fields, updatedAt: nextTime(current) }).where(eq(seoRecommendations.id, c.id)).returning();
  await event(tx, current, updated, "revised", c.reason, actor);
  return { item: updated, unchanged: false };
}
export function createRecommendationHistoryRepository(db: SeoDatabase) {
  return {
    async create(command: Create, actor: RecommendationActor = legacyActor) {
      const identity = checkedActor(actor);
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${command.fingerprint}))`);
        const [current] = await tx.select().from(seoRecommendations).where(and(eq(seoRecommendations.fingerprint, command.fingerprint), inArray(seoRecommendations.status, ["new", "accepted"]))).orderBy(desc(seoRecommendations.createdAt)).limit(1).for("update");
        if (current) {
          const fields = { title: command.title, rationale: command.rationale, evidence: command.evidence ?? {}, confidence: command.confidence };
          if (stable(fields) === stable({ title: current.title, rationale: current.rationale, evidence: current.evidence, confidence: current.confidence })) return current;
          const [updated] = await tx.update(seoRecommendations).set({ ...fields, updatedAt: nextTime(current) }).where(eq(seoRecommendations.id, current.id)).returning();
          await event(tx, current, updated, "refreshed", "Same-fingerprint evidence refreshed", identity); return updated;
        }
        const [created] = await tx.insert(seoRecommendations).values(command).returning();
        await event(tx, null, created, "created", "Recommendation created", identity); return created;
      });
    },
    async status(id: string, expectedStatus: Status, status: Status, actor: RecommendationActor = legacyActor) {
      const identity = checkedActor(actor);
      return db.transaction(async tx => {
        const [current] = await tx.select().from(seoRecommendations).where(eq(seoRecommendations.id, id)).for("update");
        if (!current) throw Error("seo_recommendation_not_found");
        if (current.status !== expectedStatus) throw Error("seo_recommendation_status_conflict");
        if (!transitions[current.status].includes(status)) throw Error("seo_recommendation_transition_invalid");
        const [updated] = await tx.update(seoRecommendations).set({ status, updatedAt: nextTime(current) }).where(eq(seoRecommendations.id, id)).returning();
        await event(tx, current, updated, "status", `Status ${current.status} → ${status}`, identity); return updated;
      });
    },
    async revise(command: RecommendationRevision, actor: RecommendationActor) {
      const parsed = revisionSchema.safeParse(command); if (!parsed.success) throw Error("seo_recommendation_revision_invalid");
      const identity = checkedActor(actor); return db.transaction(tx => revise(tx, parsed.data, identity));
    },
    async reconcile(commands: unknown, actor: RecommendationActor) {
      const rows = validateRecommendationRevisions(commands), identity = checkedActor(actor);
      return db.transaction(async tx => {
        await tx.select({ id: seoRecommendations.id }).from(seoRecommendations).where(inArray(seoRecommendations.id, rows.map(r => r.id))).orderBy(asc(seoRecommendations.id)).for("update");
        let revised = 0, unchanged = 0;
        for (const row of rows) { if ((await revise(tx, row, identity)).unchanged) unchanged++; else revised++; }
        return { revised, unchanged };
      });
    },
    async list(input: { recommendationId: string; pagePath?: string; limit: number; cursor: string | null }) {
      if (!z.string().uuid().safeParse(input.recommendationId).success) throw Error("seo_recommendation_invalid");
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw Error("seo_limit_invalid");
      if (input.cursor !== null && (!/^(0|[1-9][0-9]*)$/.test(input.cursor) || !Number.isSafeInteger(Number(input.cursor)))) throw Error("seo_cursor_invalid");
      const offset = Number(input.cursor ?? 0);
      const rows = await db.select(getTableColumns(seoRecommendationHistory)).from(seoRecommendationHistory)
        .innerJoin(seoRecommendations, eq(seoRecommendations.id, seoRecommendationHistory.recommendationId))
        .where(and(eq(seoRecommendationHistory.recommendationId, input.recommendationId), input.pagePath ? eq(seoRecommendations.pagePath, input.pagePath) : undefined))
        .orderBy(desc(seoRecommendationHistory.createdAt), desc(seoRecommendationHistory.id)).limit(input.limit + 1).offset(offset);
      return { items: rows.slice(0, input.limit), nextCursor: rows.length > input.limit ? String(offset + input.limit) : null };
    },
  };
}
export type RecommendationHistoryRow = typeof seoRecommendationHistory.$inferSelect;
