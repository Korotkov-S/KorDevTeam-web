import { createDb } from "../../src/server/db/client";
import { resetTestDatabase } from "../../src/server/db/testDatabase";
import { adminUsers, contentEntries, mcpTokens } from "../../src/server/db/schema";
import { createRecommendationHistoryRepository } from "../../src/server/seo-monitoring/recommendationHistory";
import { createRecommendationExecutionRepository } from "../../src/server/seo-monitoring/recommendationExecutionRepository";
import { hashExecutionJson, parseExecutionPlan } from "../../src/server/seo-monitoring/recommendationExecutionPlan";
export const executionTestUrl = process.env.TEST_DATABASE_URL ?? "";
const url = executionTestUrl;
export async function fixture() {
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
export async function acceptedFixture() {
  const f = await fixture();
  const [token] = await f.db.insert(mcpTokens).values({ adminUserId: f.admin.id, name: "executor", tokenHash: "b".repeat(64), tokenPrefix: "test", scopes: ["seo:read", "seo:write", "content:read", "content:write", "content:publish"] }).returning();
  const work = await f.repo.approve(f.approveInput, f.actor);
  return { ...f, work, executor: { mcpTokenId: token.id }, command: { recommendationId: f.recommendation.id, executionId: work.execution!.id, expectedUpdatedAt: work.recommendation.updatedAt.toISOString() } };
}
