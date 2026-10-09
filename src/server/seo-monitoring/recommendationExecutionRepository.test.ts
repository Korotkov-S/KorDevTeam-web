import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { adminUsers, contentEntries, seoChanges, mcpTokens, seoRecommendations, seoRecommendationHistory, seoRecommendationExecutions } from "../db/schema";
import { createRecommendationHistoryRepository } from "./recommendationHistory";
import { createRecommendationExecutionRepository } from "./recommendationExecutionRepository";
import { hashExecutionJson, parseExecutionPlan } from "./recommendationExecutionPlan";

const url = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = url ? test : test.skip;
async function fixture() {
  await resetTestDatabase(url);
  const db = createDb(url), history = createRecommendationHistoryRepository(db), repo = createRecommendationExecutionRepository(db);
  const [admin] = await db.insert(adminUsers).values({ login: "execution-test", passwordDigest: "unused", passwordSalt: "unused" }).returning();
  const [entry] = await db.insert(contentEntries).values({ kind: "article", slug: "audit", status: "published", title: "Аудит", seoTitle: "Аудит бизнеса", seoDescription: "Практика", bodyMd: "Прежний текст", payload: { h1: "Аудит" }, publishedAt: new Date() }).returning();
  const snapshot = await repo.readPublishedSnapshot(entry.id);
  const plan = parseExecutionPlan({ schemaVersion: 1, operation: "publish_patch", contentEntryId: entry.id, baseVersion: entry.version, baseHash: hashExecutionJson(snapshot), pagePath: "/blog/audit/", patch: { bodyMd: "Новый практический шаг" }, criteria: [{ id: "step", description: "Есть практический шаг" }] });
  const recommendation = await history.create({ title: "Добавить практику", rationale: "Проверяемая гипотеза", issueType: "content", confidence: "high", pagePath: plan.pagePath, fingerprint: "a".repeat(64), executionPlan: plan }, { operation: "test" });
  const approveInput = { recommendationId: recommendation.id, expectedUpdatedAt: recommendation.updatedAt.toISOString(), expectedBaseVersion: entry.version, expectedBaseHash: plan.baseHash };
  return { db, history, repo, admin, entry, snapshot, plan, recommendation, approveInput, actor: { adminUserId: admin.id } };
}
databaseTest("acceptance_atomically_freezes_human_card_and_page", async () => {
  const f = await fixture(); const work = await f.repo.approve(f.approveInput, f.actor);
  assert.equal(work.recommendation.status, "accepted"); assert.equal(work.state, "ready");
  assert.deepEqual(work.execution?.approvedPlan, f.plan); assert.deepEqual(work.execution?.baseSnapshot, f.snapshot);
  assert.equal(work.execution?.approvedByAdminUserId, f.admin.id);
  const events = await f.db.select().from(seoRecommendationHistory).where(eq(seoRecommendationHistory.recommendationId, f.recommendation.id));
  assert.equal(events.length, 2); assert.equal(events[1].eventType, "approval");
  assert.equal(work.execution?.approvalHistoryId, events[1].id);
});
databaseTest("stale_acceptance_fails_without_status_or_history_write", async () => {
  const f = await fixture();
  for (const input of [{ ...f.approveInput, expectedUpdatedAt: "2000-01-01T00:00:00Z" }, { ...f.approveInput, expectedBaseVersion: 99 }, { ...f.approveInput, expectedBaseHash: "0".repeat(64) }]) {
    await assert.rejects(f.repo.approve(input, f.actor), /seo_execution_.*conflict/);
  }
  assert.equal((await f.repo.get(f.recommendation.id)).recommendation.status, "new");
  assert.equal((await f.db.select().from(seoRecommendationExecutions)).length, 0);
  assert.equal((await f.db.select().from(seoRecommendationHistory)).length, 1);
});
databaseTest("mcp_status_acceptance_is_not_human_authority", async () => {
  const f = await fixture(); await f.history.status(f.recommendation.id, "new", "accepted", { mcpTokenId: "10000000-0000-4000-8000-000000000001" });
  assert.equal((await f.repo.get(f.recommendation.id)).errorCode, "seo_execution_approval_required");
  assert.equal((await f.db.select().from(seoRecommendationExecutions)).length, 0);
  await assert.rejects(f.repo.approve(f.approveInput, { mcpTokenId: "10000000-0000-4000-8000-000000000001" } as never), /seo_actor_invalid/);
});
databaseTest("old_accepted_is_blocked", async () => {
  const f = await fixture(); await f.db.update(seoRecommendations).set({ executionPlan: null, status: "accepted" }).where(eq(seoRecommendations.id, f.recommendation.id));
  assert.equal((await f.repo.get(f.recommendation.id)).state, "blocked");
  assert.equal((await f.db.select().from(seoRecommendationExecutions)).length, 0);
});
databaseTest("reapproval_preserves_previous_approval", async () => {
  const f = await fixture(); const first = await f.repo.approve(f.approveInput, f.actor);
  const second = await f.repo.approve({ ...f.approveInput, expectedUpdatedAt: first.recommendation.updatedAt.toISOString() }, f.actor);
  assert.notEqual(first.execution?.id, second.execution?.id);
  const rows = await f.db.select().from(seoRecommendationExecutions);
  assert.equal(rows.length, 2); assert.equal(rows.filter(r => r.supersededAt !== null).length, 1);
  assert.deepEqual(rows.find(r => r.id === first.execution?.id)?.approvedPlan, f.plan);
});
databaseTest("changed_card_or_page_blocks_execution", async () => {
  const f = await fixture(); const accepted = await f.repo.approve(f.approveInput, f.actor);
  await f.history.revise({ id: f.recommendation.id, expectedUpdatedAt: accepted.recommendation.updatedAt.toISOString(), title: "Изменено", rationale: "Другое", confidence: "high", evidence: {}, reason: "Новый факт" }, { operation: "test" });
  assert.equal((await f.repo.get(f.recommendation.id)).errorCode, "seo_execution_card_conflict");
  // Restore the exact frozen card only in the test to isolate the independent page guard.
  await f.db.update(seoRecommendations).set({ title: accepted.recommendation.title, rationale: accepted.recommendation.rationale, updatedAt: accepted.recommendation.updatedAt }).where(eq(seoRecommendations.id, f.recommendation.id));
  await f.db.update(contentEntries).set({ bodyMd: "Ручная правка", version: 2 }).where(eq(contentEntries.id, f.entry.id));
  assert.equal((await f.repo.get(f.recommendation.id)).errorCode, "seo_execution_page_conflict");
});
databaseTest("generic_status_revision_and_reconcile_cannot_implement", async () => {
  const f = await fixture(); const work = await f.repo.approve(f.approveInput, f.actor);
  const revision = { id: f.recommendation.id, expectedUpdatedAt: work.recommendation.updatedAt.toISOString(), title: f.recommendation.title, rationale: f.recommendation.rationale, confidence: "high" as const, evidence: {}, reason: "Попытка обхода", status: "implemented" as const };
  await assert.rejects(f.history.status(f.recommendation.id, "accepted", "implemented", { operation: "test" }), /seo_recommendation_transition_invalid/);
  await assert.rejects(f.history.revise(revision, { operation: "test" }), /seo_recommendation_transition_invalid/);
  await assert.rejects(f.history.reconcile([revision], { operation: "test" }), /seo_recommendation_transition_invalid/);
  assert.equal((await f.repo.get(f.recommendation.id)).recommendation.status, "accepted");
});
databaseTest("ledger_rejects_partial_application_or_completion", async () => {
  const f = await fixture(); const work = await f.repo.approve(f.approveInput, f.actor);
  for (const fields of [{ appliedAt: new Date() }, { completedAt: new Date() }, { appliedVersion: 2 }, { completionHash: "a".repeat(64) }]) {
    await assert.rejects(f.db.update(seoRecommendationExecutions).set(fields).where(eq(seoRecommendationExecutions.id, work.execution!.id)));
  }
  const [token] = await f.db.insert(mcpTokens).values({ adminUserId: f.admin.id, name: "test", tokenHash: "a".repeat(64), tokenPrefix: "test", scopes: ["seo:read"] }).returning();
  const [change] = await f.db.insert(seoChanges).values({ pagePath: f.plan.pagePath, type: "content", summary: "test" }).returning();
  await assert.rejects(f.db.update(seoRecommendationExecutions).set({ appliedAt: new Date(), appliedSnapshot: f.snapshot, appliedChangeId: change.id, appliedByMcpTokenId: token.id }).where(eq(seoRecommendationExecutions.id, work.execution!.id)));
});
databaseTest("revision_keeps_plan_on_omission_and_clears_only_explicit_null", async () => {
  const f = await fixture();
  const command = { id: f.recommendation.id, expectedUpdatedAt: f.recommendation.updatedAt.toISOString(), title: "Свежие факты", rationale: "Факты", confidence: "high" as const, evidence: {}, reason: "Уточнение" };
  const result = await f.history.revise(command, { operation: "test" });
  assert.deepEqual(result.item.executionPlan, f.plan);
  const cleared = await f.history.revise({ ...command, expectedUpdatedAt: result.item.updatedAt.toISOString(), executionPlan: null }, { operation: "test" });
  assert.equal(cleared.item.executionPlan, null);
  const history = await f.history.list({ recommendationId: f.recommendation.id, limit: 10, cursor: null });
  assert.deepEqual(history.items[0].beforeSnapshot?.executionPlan, f.plan);
});
