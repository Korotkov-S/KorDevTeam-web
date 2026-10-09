import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { adminUsers, contentEntries, contentMediaRefs, contentRelations, seoRecommendations, seoRecommendationExecutions } from "../db/schema";
import type { SeoDatabase } from "./repository";
import { hashExecutionJson, parseExecutionPlan, prepareExecutionPatch, publishedSnapshot, type PublishedSnapshot } from "./recommendationExecutionPlan";
import { appendRecommendationEvent, nextRecommendationTime, recommendationSnapshot } from "./recommendationHistory";

type Transaction = Parameters<Parameters<SeoDatabase["transaction"]>[0]>[0];
type Reader = SeoDatabase | Transaction;
type Recommendation = typeof seoRecommendations.$inferSelect;
type Execution = typeof seoRecommendationExecutions.$inferSelect;
export type RecommendationWork = { recommendation: Recommendation; execution: Execution | null; currentPage: PublishedSnapshot | null;
  state: "blocked" | "ready" | "applied" | "completed"; errorCode: string | null };
export type WorkSummary = Pick<RecommendationWork, "state" | "errorCode"> & { recommendationId: string; title: string; updatedAt: string; pagePath: string | null; executionId: string | null };
export type WorkPageInput = { limit?: number; cursor?: string | null };
export type WorkPage = { items: WorkSummary[]; nextCursor: string | null };

export async function readPublishedSnapshot(db: Reader, id: string, lock = false): Promise<PublishedSnapshot> {
  let query = db.select().from(contentEntries).where(eq(contentEntries.id, id));
  const [entry] = await (lock ? query.for("update") : query);
  if (!entry) throw Error("seo_execution_page_not_found");
  const relations = await db.select({ targetId: contentRelations.targetId, type: contentRelations.type, sortOrder: contentRelations.sortOrder }).from(contentRelations).where(eq(contentRelations.sourceId, id));
  const refs = await db.select({ mediaId: contentMediaRefs.mediaId, fieldPath: contentMediaRefs.fieldPath }).from(contentMediaRefs).where(eq(contentMediaRefs.entryId, id));
  return publishedSnapshot(entry, relations, refs);
}
export function executionWork(recommendation: Recommendation, execution: Execution | null, currentPage: PublishedSnapshot | null): RecommendationWork {
  const result: RecommendationWork = { recommendation, execution, currentPage, state: "blocked", errorCode: null };
  if (!execution) result.errorCode = "seo_execution_approval_required";
  else if (execution.supersededAt) result.errorCode = "seo_execution_approval_superseded";
  else if (hashExecutionJson(recommendationSnapshot(recommendation)) !== (execution.completedAt ? execution.completedRecommendationHash : execution.recommendationHash)) result.errorCode = "seo_execution_card_conflict";
  else if (!currentPage || hashExecutionJson(currentPage) !== (execution.appliedHash ?? execution.baseHash)) result.errorCode = "seo_execution_page_conflict";
  else if (execution.completedAt && recommendation.status === "implemented") result.state = "completed";
  else if (recommendation.status !== "accepted") result.errorCode = "seo_execution_status_conflict";
  else result.state = execution.appliedAt ? "applied" : "ready";
  return result;
}
async function currentPage(db: Reader, recommendation: Recommendation, execution: Execution | null, lock = false) {
  const id = execution?.contentEntryId ?? recommendation.executionPlan?.contentEntryId;
  if (!id) return null;
  try { return await readPublishedSnapshot(db, id, lock); }
  catch (error) { if (error instanceof Error && ["seo_execution_page_not_found", "seo_execution_page_unsupported"].includes(error.message)) return null; throw error; }
}
export function createRecommendationExecutionRepository(db: SeoDatabase) {
  const repository = {
    readPublishedSnapshot: (id: string) => { if (!z.uuid().safeParse(id).success) throw Error("seo_execution_command_invalid"); return readPublishedSnapshot(db, id); },
    async get(id: string): Promise<RecommendationWork> {
      if (!z.uuid().safeParse(id).success) throw Error("seo_execution_command_invalid");
      const [recommendation] = await db.select().from(seoRecommendations).where(eq(seoRecommendations.id, id));
      if (!recommendation) throw Error("seo_recommendation_not_found");
      const [execution] = await db.select().from(seoRecommendationExecutions).where(and(eq(seoRecommendationExecutions.recommendationId, id), isNull(seoRecommendationExecutions.supersededAt))).orderBy(desc(seoRecommendationExecutions.approvedAt)).limit(1);
      return executionWork(recommendation, execution ?? null, await currentPage(db, recommendation, execution ?? null));
    },
    async approve(input: { recommendationId: string; expectedUpdatedAt: string; expectedBaseVersion?: number; expectedBaseHash?: string }, actor: { adminUserId: string }): Promise<RecommendationWork> {
      const parsed = z.strictObject({ recommendationId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), expectedBaseVersion: z.number().int().positive().optional(), expectedBaseHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).safeParse(input);
      if (!parsed.success) throw Error("seo_execution_command_invalid");
      if (!z.strictObject({ adminUserId: z.uuid() }).safeParse(actor).success) throw Error("seo_actor_invalid");
      return db.transaction(async tx => {
        const [admin] = await tx.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.id, actor.adminUserId));
        if (!admin) throw Error("seo_actor_invalid");
        const [before] = await tx.select().from(seoRecommendations).where(eq(seoRecommendations.id, input.recommendationId)).for("update");
        if (!before) throw Error("seo_recommendation_not_found");
        if (+before.updatedAt !== +new Date(input.expectedUpdatedAt)) throw Error("seo_execution_card_conflict");
        if (!["new", "accepted"].includes(before.status)) throw Error("seo_execution_status_conflict");
        const [previous] = await tx.select().from(seoRecommendationExecutions).where(and(eq(seoRecommendationExecutions.recommendationId, before.id), isNull(seoRecommendationExecutions.supersededAt))).for("update");
        if (previous?.appliedAt) throw Error("seo_execution_already_applied");
        const plan = before.executionPlan ? parseExecutionPlan(before.executionPlan) : null;
        const page = plan ? await readPublishedSnapshot(tx, plan.contentEntryId, true) : null;
        if (plan && page) {
          if (before.pagePath !== plan.pagePath || input.expectedBaseVersion !== plan.baseVersion || input.expectedBaseHash !== plan.baseHash) throw Error("seo_execution_page_conflict");
          prepareExecutionPatch(page, plan);
        }
        const now = new Date();
        if (previous) await tx.update(seoRecommendationExecutions).set({ supersededAt: now }).where(eq(seoRecommendationExecutions.id, previous.id));
        const [recommendation] = await tx.update(seoRecommendations).set({ status: "accepted", updatedAt: nextRecommendationTime(before) }).where(eq(seoRecommendations.id, before.id)).returning();
        const event = await appendRecommendationEvent(tx, before, recommendation, "approval", previous ? "Owner explicitly approved updated variant" : "Owner approved recommendation", actor, now);
        let execution: Execution | null = null;
        if (plan && page) [execution] = await tx.insert(seoRecommendationExecutions).values({ recommendationId: before.id, approvalHistoryId: event.id,
          approvedByAdminUserId: actor.adminUserId, approvedAt: now, approvedRecommendation: recommendationSnapshot(recommendation), recommendationHash: hashExecutionJson(recommendationSnapshot(recommendation)),
          approvedPlan: plan, contentEntryId: page.entry.id, baseSnapshot: page, baseHash: hashExecutionJson(page) }).returning();
        return executionWork(recommendation, execution, page);
      });
    },
  };
  return repository;
}
export type RecommendationExecutionRepository = ReturnType<typeof createRecommendationExecutionRepository>;
