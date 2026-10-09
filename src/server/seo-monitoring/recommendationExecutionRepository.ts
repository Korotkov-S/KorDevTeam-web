import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { adminUsers, contentEntries, contentMediaRefs, contentRelations, geoExperiments, seoChanges, seoRecommendations, seoRecommendationExecutions } from "../db/schema";
import type { SeoDatabase } from "./repository";
import { hashExecutionJson, parseExecutionPlan, prepareExecutionPatch, publishedSnapshot, type ExecutionCommand, type CompleteExecutionCommand, type PublicExecutionProof, type PublishedSnapshot } from "./recommendationExecutionPlan";
import { appendRecommendationEvent, nextRecommendationTime, recommendationSnapshot } from "./recommendationHistory";
import { saveContentInTransaction } from "../admin/contentWrite";
import { linkApprovedGeoExperimentInTransaction } from "../geo-monitoring/repository";
import { criterionEvidenceSchema, completionEvidence } from "./recommendationExecutionVerification";

type Transaction = Parameters<Parameters<SeoDatabase["transaction"]>[0]>[0];
type Reader = SeoDatabase | Transaction;
type Recommendation = typeof seoRecommendations.$inferSelect;
type Execution = typeof seoRecommendationExecutions.$inferSelect;
export type RecommendationWork = { recommendation: Recommendation; execution: Execution | null; currentPage: PublishedSnapshot | null;
  state: "blocked" | "ready" | "applied" | "completed"; errorCode: string | null };
export type WorkSummary = Pick<RecommendationWork, "state" | "errorCode"> & { recommendationId: string; title: string; updatedAt: string; pagePath: string | null; executionId: string | null };
export type WorkPageInput = { limit?: number; cursor?: string | null };
export type WorkPage = { items: WorkSummary[]; nextCursor: string | null };
const workCursorSchema = z.strictObject({ v: z.literal(1), queue: z.literal("seo-accepted-v1"), id: z.uuid(), createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/).refine(v => Number.isFinite(+new Date(v))) });
function workCursor(value: string | null | undefined) {
  if (value == null) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw Error();
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw Error();
    return workCursorSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch { throw Error("seo_cursor_invalid"); }
}
export const executionCommandSchema = z.strictObject({ recommendationId: z.uuid(), executionId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }) });
export const completeExecutionCommandSchema = executionCommandSchema.extend({ criteriaEvidence: criterionEvidenceSchema });
export function checkedCompleteExecutionCommand(input: CompleteExecutionCommand, actor: { mcpTokenId: string }) {
  const parsed = completeExecutionCommandSchema.safeParse(input);
  if (!parsed.success) throw Error("seo_execution_command_invalid");
  const { criteriaEvidence: _evidence, ...base } = parsed.data;
  checkedExecutionCommand(base, actor);
  return { ...base, expectedUpdatedAt: new Date(base.expectedUpdatedAt).toISOString(), criteriaEvidence: completionEvidence(parsed.data.criteriaEvidence) };
}
export const completeExecutionHash = (command: CompleteExecutionCommand) => hashExecutionJson({ ...command, expectedUpdatedAt: new Date(command.expectedUpdatedAt).toISOString(), criteriaEvidence: completionEvidence(command.criteriaEvidence) });
export function checkedExecutionCommand(input: ExecutionCommand, actor: { mcpTokenId: string }) {
  if (!executionCommandSchema.safeParse(input).success) throw Error("seo_execution_command_invalid");
  if (!z.strictObject({ mcpTokenId: z.uuid() }).safeParse(actor).success) throw Error("seo_actor_invalid");
}
async function lockedExecution(tx: Transaction, command: ExecutionCommand) {
  const [recommendation] = await tx.select().from(seoRecommendations).where(eq(seoRecommendations.id, command.recommendationId)).for("update");
  if (!recommendation) throw Error("seo_recommendation_not_found");
  const [execution] = await tx.select().from(seoRecommendationExecutions).where(and(eq(seoRecommendationExecutions.id, command.executionId), eq(seoRecommendationExecutions.recommendationId, recommendation.id))).for("update");
  if (!execution || execution.supersededAt) throw Error("seo_execution_approval_required");
  if (execution.approvedRecommendation.updatedAt !== new Date(command.expectedUpdatedAt).toISOString()) throw Error("seo_execution_card_conflict");
  return { recommendation, execution };
}

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
  let id = execution?.contentEntryId ?? recommendation.executionPlan?.contentEntryId;
  if (!id) {
    const path = /^\/(blog|cases|services)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(recommendation.pagePath ?? "");
    if (path) {
      const kind = path[1] === "blog" ? "article" : path[1] === "cases" ? "case" : "service";
      const [entry] = await db.select({ id: contentEntries.id }).from(contentEntries)
        .where(and(eq(contentEntries.kind, kind), eq(contentEntries.slug, path[2]), eq(contentEntries.status, "published"))).limit(1);
      id = entry?.id;
    }
  }
  if (!id) return null;
  try { return await readPublishedSnapshot(db, id, lock); }
  catch (error) { if (error instanceof Error && ["seo_execution_page_not_found", "seo_execution_page_unsupported"].includes(error.message)) return null; throw error; }
}
export function createRecommendationExecutionRepository(db: SeoDatabase) {
  const repository = {
    async list(input: WorkPageInput = {}): Promise<WorkPage> {
      const limit = input.limit ?? 25;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("seo_limit_invalid");
      const cursor = workCursor(input.cursor);
      const rows = await db.select({ id: seoRecommendations.id,
        createdAt: sql<string>`to_char(${seoRecommendations.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
        .from(seoRecommendations).where(and(eq(seoRecommendations.status, "accepted"), cursor
          ? sql`(${seoRecommendations.createdAt}, ${seoRecommendations.id}) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined))
        .orderBy(asc(seoRecommendations.createdAt), asc(seoRecommendations.id)).limit(limit + 1);
      const selected = rows.slice(0, limit);
      const items = await Promise.all(selected.map(async row => {
        const work = await repository.get(row.id);
        return { recommendationId: row.id, title: work.recommendation.title, updatedAt: work.recommendation.updatedAt.toISOString(),
          pagePath: work.recommendation.pagePath, executionId: work.execution?.id ?? null, state: work.state, errorCode: work.errorCode };
      }));
      const last = selected.at(-1);
      return { items, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ v: 1, queue: "seo-accepted-v1", ...last })).toString("base64url") : null };
    },
    readPublishedSnapshot: (id: string) => { if (!z.uuid().safeParse(id).success) throw Error("seo_execution_command_invalid"); return readPublishedSnapshot(db, id); },
    async get(id: string): Promise<RecommendationWork> {
      if (!z.uuid().safeParse(id).success) throw Error("seo_execution_command_invalid");
      const [recommendation] = await db.select().from(seoRecommendations).where(eq(seoRecommendations.id, id));
      if (!recommendation) throw Error("seo_recommendation_not_found");
      const [execution] = await db.select().from(seoRecommendationExecutions).where(and(eq(seoRecommendationExecutions.recommendationId, id), isNull(seoRecommendationExecutions.supersededAt))).orderBy(desc(seoRecommendationExecutions.approvedAt)).limit(1);
      return executionWork(recommendation, execution ?? null, await currentPage(db, recommendation, execution ?? null));
    },
    async approve(input: { recommendationId: string; expectedUpdatedAt: string; expectedBaseVersion?: number; expectedBaseHash?: string; mode?: "consideration" }, actor: { adminUserId: string }): Promise<RecommendationWork> {
      const parsed = z.strictObject({ recommendationId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), expectedBaseVersion: z.number().int().positive().optional(), expectedBaseHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), mode: z.literal("consideration").optional() }).safeParse(input);
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
        const plan = input.mode !== "consideration" && before.executionPlan ? parseExecutionPlan(before.executionPlan) : null;
        const page = plan ? await readPublishedSnapshot(tx, plan.contentEntryId, true) : null;
        if (plan && page) {
          if (before.pagePath !== plan.pagePath || input.expectedBaseVersion !== plan.baseVersion || input.expectedBaseHash !== plan.baseHash) throw Error("seo_execution_page_conflict");
          prepareExecutionPatch(page, plan);
        }
        const now = new Date();
        if (previous) await tx.update(seoRecommendationExecutions).set({ supersededAt: now }).where(eq(seoRecommendationExecutions.id, previous.id));
        const [recommendation] = await tx.update(seoRecommendations).set({ status: "accepted", updatedAt: nextRecommendationTime(before) }).where(eq(seoRecommendations.id, before.id)).returning();
        const event = await appendRecommendationEvent(tx, before, recommendation, "approval", input.mode === "consideration" ? "Owner accepted for consideration only; publication not authorized" : previous ? "Owner explicitly approved updated variant" : "Owner approved recommendation", actor, now);
        let execution: Execution | null = null;
        if (plan && page) [execution] = await tx.insert(seoRecommendationExecutions).values({ recommendationId: before.id, approvalHistoryId: event.id,
          approvedByAdminUserId: actor.adminUserId, approvedAt: now, approvedRecommendation: recommendationSnapshot(recommendation), recommendationHash: hashExecutionJson(recommendationSnapshot(recommendation)),
          approvedPlan: plan, contentEntryId: page.entry.id, baseSnapshot: page, baseHash: hashExecutionJson(page) }).returning();
        return executionWork(recommendation, execution, page);
      });
    },
    async apply(command: ExecutionCommand, actor: { mcpTokenId: string }) {
      checkedExecutionCommand(command, actor);
      return db.transaction(async tx => {
        const { recommendation, execution } = await lockedExecution(tx, command);
        const prepared = prepareExecutionPatch(execution.baseSnapshot, execution.approvedPlan);
        const relatedSlugs = prepared.command.kind === "article" ? prepared.command.payload.relatedArticleSlugs ?? [] : [];
        const relatedArticles = relatedSlugs.length ? await tx.select({ id: contentEntries.id }).from(contentEntries).where(and(eq(contentEntries.kind, "article"), inArray(contentEntries.slug, relatedSlugs))) : [];
        const ids = [...new Set([execution.contentEntryId, ...prepared.command.relations.map(r => r.targetId), ...relatedArticles.map(r => r.id)])].sort();
        const entries = await tx.select().from(contentEntries).where(inArray(contentEntries.id, ids)).orderBy(asc(contentEntries.id)).for("update");
        const page = await currentPage(tx, recommendation, execution);
        const work = executionWork(recommendation, execution, page);
        if (work.state === "blocked") throw Error(work.errorCode!);
        if (execution.appliedAt) return { work, unchanged: true };
        const kindForType = { related_article: "article", related_case: "case", related_service: "service", related_faq: "faq" };
        for (const relation of prepared.command.relations) {
          const target = entries.find(e => e.id === relation.targetId);
          if (!target || target.id === execution.contentEntryId || target.status !== "published" || target.kind !== kindForType[relation.type]) throw Error("seo_execution_relation_invalid");
        }
        for (const slug of relatedSlugs) if (!entries.some(e => e.kind === "article" && e.slug === slug && e.status === "published" && e.id !== execution.contentEntryId)) throw Error("seo_execution_relation_invalid");
        // Match the existing GEO lock order: linked experiment rows, then the shared page lock.
        const linked = await tx.select().from(geoExperiments).where(eq(geoExperiments.recommendationId, recommendation.id)).orderBy(asc(geoExperiments.id)).for("update");
        if (linked.length > 1 || linked.some(e => e.status !== "approved" || !e.approvedByAdminUserId || e.pagePath !== recommendation.pagePath)) throw Error("geo_experiment_state_invalid");
        if (recommendation.issueType.startsWith("geo_") && !linked.length) throw Error("geo_experiment_state_invalid");
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${execution.approvedPlan.pagePath}, 706024))`);
        const cutoff = new Date(Date.now() - 14 * 86_400_000);
        const [nearby] = await tx.select({ id: geoExperiments.id }).from(geoExperiments).where(and(eq(geoExperiments.pagePath, execution.approvedPlan.pagePath), gte(geoExperiments.implementedAt, cutoff))).limit(1);
        if (nearby) throw Error("geo_experiment_page_cooldown");
        if (linked.length) {
          const [recent] = await tx.select({ id: seoChanges.id }).from(seoChanges).where(and(eq(seoChanges.pagePath, execution.approvedPlan.pagePath), gte(seoChanges.appliedAt, cutoff))).limit(1);
          if (recent) throw Error("geo_experiment_page_cooldown");
        }
        const result = await saveContentInTransaction(tx, prepared.command, actor);
        const change = result.publicationChanges.find(c => c.contentEntryId === execution.contentEntryId && c.contentVersion === result.entry.version && c.pagePath === execution.approvedPlan.pagePath);
        if (!change) throw Error("seo_execution_change_missing");
        for (const experiment of linked) await linkApprovedGeoExperimentInTransaction(tx, { id: experiment.id, seoChangeId: change.id });
        const applied = await readPublishedSnapshot(tx, execution.contentEntryId);
        const now = new Date();
        const [updated] = await tx.update(seoRecommendationExecutions).set({ appliedSnapshot: applied, appliedVersion: applied.entry.version, appliedHash: hashExecutionJson(applied), appliedChangeId: change.id, appliedByMcpTokenId: actor.mcpTokenId, appliedAt: now }).where(eq(seoRecommendationExecutions.id, execution.id)).returning();
        await appendRecommendationEvent(tx, recommendation, recommendation, "execution_applied", `Applied approved execution ${execution.id}; CMS change ${change.id}; version ${applied.entry.version}`, actor, now);
        return { work: executionWork(recommendation, updated, applied), unchanged: false };
      });
    },
    async completeVerified(input: CompleteExecutionCommand, proof: PublicExecutionProof, actor: { mcpTokenId: string }) {
      const command = checkedCompleteExecutionCommand(input, actor), completionHash = completeExecutionHash(command);
      return db.transaction(async tx => {
        const { recommendation, execution } = await lockedExecution(tx, command);
        const page = await currentPage(tx, recommendation, execution, true);
        const work = executionWork(recommendation, execution, page);
        if (work.state === "blocked") throw Error(work.errorCode!);
        if (execution.completedAt) {
          if (execution.completionHash !== completionHash) throw Error("seo_execution_completion_conflict");
          return { work, unchanged: true };
        }
        if (work.state !== "applied" || !page || !execution.appliedChangeId) throw Error("seo_execution_not_applied");
        const [change] = await tx.select().from(seoChanges).where(eq(seoChanges.id, execution.appliedChangeId)).for("share");
        if (!change || change.contentEntryId !== execution.contentEntryId || change.contentVersion !== execution.appliedVersion || change.pagePath !== execution.approvedPlan.pagePath || change.actorMcpTokenId !== execution.appliedByMcpTokenId || change.actorAdminUserId !== null) throw Error("seo_execution_change_invalid");
        const parsed = z.strictObject({ checkedAt: z.iso.datetime({ offset: true }), url: z.string(), httpStatus: z.literal(200), responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
          contentEntryId: z.uuid(), contentVersion: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), criteriaEvidence: criterionEvidenceSchema,
          checks: z.strictObject({ identity: z.literal(true), metadata: z.literal(true), canonical: z.literal(true), robots: z.literal(true), criteria: z.literal(true) }) }).safeParse(proof);
        if (!parsed.success || proof.url !== page.publicContract.url || proof.contentEntryId !== page.entry.id || proof.contentVersion !== page.entry.version || proof.contentHash !== execution.appliedHash || hashExecutionJson(completionEvidence(proof.criteriaEvidence)) !== hashExecutionJson(command.criteriaEvidence)) throw Error("seo_execution_verification_failed");
        const now = new Date();
        const [completedRecommendation] = await tx.update(seoRecommendations).set({ status: "implemented", updatedAt: nextRecommendationTime(recommendation) }).where(eq(seoRecommendations.id, recommendation.id)).returning();
        const [completedExecution] = await tx.update(seoRecommendationExecutions).set({ completion: proof, completionHash, completedRecommendationHash: hashExecutionJson(recommendationSnapshot(completedRecommendation)), completedAt: now }).where(eq(seoRecommendationExecutions.id, execution.id)).returning();
        await appendRecommendationEvent(tx, recommendation, completedRecommendation, "execution_verified", `Verified execution ${execution.id}; CMS change ${change.id}; version ${page.entry.version}`, actor, now);
        return { work: executionWork(completedRecommendation, completedExecution, page), unchanged: false };
      });
    },
    async recordVerificationFailure(input: CompleteExecutionCommand, errorCode: string, actor: { mcpTokenId: string }) {
      const command = checkedCompleteExecutionCommand(input, actor);
      const code = /^seo_execution_[a-z_]{1,80}$/.test(errorCode) ? errorCode : "seo_execution_verification_failed";
      await db.transaction(async tx => {
        const { recommendation, execution } = await lockedExecution(tx, command);
        if (execution.completedAt) return;
        const now = new Date();
        await tx.update(seoRecommendationExecutions).set({ lastVerificationAttempt: { checkedAt: now.toISOString(), errorCode: code } }).where(eq(seoRecommendationExecutions.id, execution.id));
        await appendRecommendationEvent(tx, recommendation, recommendation, "execution_failed", `Execution ${execution.id}: ${code}`, actor, now);
      });
    },
  };
  return repository;
}
export type RecommendationExecutionRepository = ReturnType<typeof createRecommendationExecutionRepository>;
