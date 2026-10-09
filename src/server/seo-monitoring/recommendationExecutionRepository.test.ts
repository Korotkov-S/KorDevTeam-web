import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { adminUsers, contentEntries, contentRevisions, contentRelations, geoExperiments, seoChanges, mcpTokens, seoRecommendations, seoRecommendationHistory, seoRecommendationExecutions } from "../db/schema";
import { createRecommendationHistoryRepository } from "./recommendationHistory";
import { createRecommendationExecutionRepository } from "./recommendationExecutionRepository";
import { hashExecutionJson, parseExecutionPlan } from "./recommendationExecutionPlan";
import { fixture, acceptedFixture } from "../../../tests/helpers/seoExecution";

const url = process.env.TEST_DATABASE_URL ?? "";
const databaseTest = url ? test : test.skip;
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
databaseTest("apply_publishes_exact_patch_and_records_its_cms_change_once", async () => {
  const f = await acceptedFixture(); const result = await f.repo.apply(f.command, f.executor);
  assert.equal(result.unchanged, false); assert.equal(result.work.state, "applied");
  assert.equal(result.work.currentPage?.entry.version, 2); assert.equal(result.work.currentPage?.entry.bodyMd, "Новый практический шаг");
  assert.equal(result.work.recommendation.updatedAt.toISOString(), f.command.expectedUpdatedAt);
  const changes = await f.db.select().from(seoChanges);
  assert.equal(changes.length, 1); assert.equal(changes[0].id, result.work.execution?.appliedChangeId);
  assert.equal(changes[0].actorMcpTokenId, f.executor.mcpTokenId); assert.equal(changes[0].actorAdminUserId, null);
  assert.equal(changes[0].contentVersion, 2); assert.equal((await f.db.select().from(contentRevisions)).length, 1);
  await assert.rejects(f.repo.approve({ ...f.approveInput, expectedUpdatedAt: result.work.recommendation.updatedAt.toISOString() }, f.actor), /seo_execution_already_applied/);
});
databaseTest("publication_failure_rolls_back_execution_revision_relations_and_change", async () => {
  const f = await acceptedFixture();
  await f.db.execute(sql`CREATE FUNCTION fail_execution_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test_failure'; END $$`);
  await f.db.execute(sql`CREATE TRIGGER fail_execution_change BEFORE INSERT ON seo_changes FOR EACH ROW EXECUTE FUNCTION fail_execution_change()`);
  await assert.rejects(f.repo.apply(f.command, f.executor));
  assert.deepEqual(await f.repo.readPublishedSnapshot(f.entry.id), f.snapshot);
  assert.equal((await f.repo.get(f.recommendation.id)).state, "ready");
  assert.equal((await f.db.select().from(contentRevisions)).length, 0);
  assert.equal((await f.db.select().from(contentRelations)).length, 0);
  assert.equal((await f.db.select().from(seoChanges)).length, 0);
});
databaseTest("concurrent_apply_has_one_version_and_event", async () => {
  const f = await acceptedFixture(); const results = await Promise.all([f.repo.apply(f.command, f.executor), f.repo.apply(f.command, f.executor)]);
  assert.equal(results.filter(r => r.unchanged).length, 1);
  assert.equal((await f.repo.readPublishedSnapshot(f.entry.id)).entry.version, 2);
  assert.equal((await f.db.select().from(seoChanges)).length, 1);
});
databaseTest("lost_response_replay_returns_saved_application", async () => {
  const f = await acceptedFixture(); const first = await f.repo.apply(f.command, f.executor);
  const replay = await f.repo.apply(f.command, f.executor);
  assert.equal(replay.unchanged, true); assert.deepEqual(replay.work.execution, first.work.execution);
  assert.equal((await f.db.select().from(contentRevisions)).length, 1);
});
databaseTest("two_approvals_on_one_base_version_cannot_both_apply", async () => {
  const f = await acceptedFixture();
  const other = await f.history.create({ title: "Вторая", rationale: "Гипотеза", issueType: "content", pagePath: f.plan.pagePath, confidence: "high", fingerprint: "c".repeat(64), executionPlan: f.plan }, { operation: "test" });
  const second = await f.repo.approve({ ...f.approveInput, recommendationId: other.id, expectedUpdatedAt: other.updatedAt.toISOString() }, f.actor);
  await f.repo.apply(f.command, f.executor);
  await assert.rejects(f.repo.apply({ recommendationId: other.id, executionId: second.execution!.id, expectedUpdatedAt: second.recommendation.updatedAt.toISOString() }, f.executor), /seo_execution_page_conflict/);
  assert.equal((await f.db.select().from(seoChanges)).length, 1);
});
databaseTest("unpublished_relation_target_blocks_apply", async () => {
  const f = await fixture(); const [target] = await f.db.insert(contentEntries).values({ kind: "article", status: "published", slug: "related", title: "Связь" }).returning();
  const plan = parseExecutionPlan({ ...f.plan, patch: { relations: [{ targetId: target.id, type: "related_article", sortOrder: 0 }] } });
  const revised = await f.history.revise({ id: f.recommendation.id, expectedUpdatedAt: f.recommendation.updatedAt.toISOString(), title: f.recommendation.title, rationale: f.recommendation.rationale, confidence: "high", evidence: {}, reason: "Связь", executionPlan: plan }, { operation: "test" });
  const work = await f.repo.approve({ ...f.approveInput, expectedUpdatedAt: revised.item.updatedAt.toISOString() }, f.actor);
  await f.db.update(contentEntries).set({ status: "draft" }).where(eq(contentEntries.id, target.id));
  await assert.rejects(f.repo.apply({ recommendationId: f.recommendation.id, executionId: work.execution!.id, expectedUpdatedAt: work.recommendation.updatedAt.toISOString() }, { mcpTokenId: "10000000-0000-4000-8000-000000000001" }), /seo_execution_relation_invalid/);
  assert.equal((await f.repo.readPublishedSnapshot(f.entry.id)).entry.version, 1);
});
databaseTest("later_manual_edit_does_not_republish_or_claim_current_success", async () => {
  const f = await acceptedFixture(); await f.repo.apply(f.command, f.executor);
  await f.db.update(contentEntries).set({ bodyMd: "Ручная правка", version: 3 }).where(eq(contentEntries.id, f.entry.id));
  await assert.rejects(f.repo.apply(f.command, f.executor), /seo_execution_page_conflict/);
  assert.equal((await f.repo.readPublishedSnapshot(f.entry.id)).entry.bodyMd, "Ручная правка");
  assert.equal((await f.db.select().from(seoChanges)).length, 1);
});
const experimentFields = { pagePath: "/blog/audit/", actionType: "content_answer" as const, hypothesis: "Проверка", platform: "yandex_alice" as const, mode: "live_ui" as const, language: "ru", region: "RU", promptSetFingerprint: "d".repeat(64), primaryMetric: "citation_rate" as const, direction: "increase" as const, minimumDelta: "0.01", expectedSignal: "Цитирование" };
databaseTest("geo_page_interval_cannot_be_bypassed_by_another_prompt_set", async () => {
  const f = await acceptedFixture();
  const [change] = await f.db.insert(seoChanges).values({ pagePath: f.plan.pagePath, type: "content", summary: "Предыдущее изменение" }).returning();
  const previous = await f.history.create({ title: "Предыдущая", rationale: "История", issueType: "geo_content", confidence: "high", fingerprint: "e".repeat(64) }, { operation: "test" });
  await f.db.insert(geoExperiments).values({ ...experimentFields, recommendationId: previous.id, status: "completed", implementedAt: new Date(), seoChangeId: change.id });
  await assert.rejects(f.repo.apply(f.command, f.executor), /geo_experiment_page_cooldown/);
  assert.equal((await f.repo.readPublishedSnapshot(f.entry.id)).entry.version, 1);
});
databaseTest("unapproved_linked_geo_experiment_cannot_execute", async () => {
  const f = await acceptedFixture(); await f.db.insert(geoExperiments).values({ ...experimentFields, recommendationId: f.recommendation.id, status: "proposed" });
  await assert.rejects(f.repo.apply(f.command, f.executor), /geo_experiment_state_invalid/);
  assert.equal((await f.db.select().from(seoChanges)).length, 0);
});
