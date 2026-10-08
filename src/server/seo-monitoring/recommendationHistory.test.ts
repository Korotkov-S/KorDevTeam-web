import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { resetTestDatabase } from "../db/testDatabase";
import { seoRecommendations } from "../db/schema";
import { createSeoRepository } from "./repository";
import { createRecommendationHistoryRepository, validateRecommendationRevisions, type RecommendationRevision } from "./recommendationHistory";

const url = process.env.TEST_DATABASE_URL ?? "";
const actor = { operation: "test-reconcile" };
const command = { title: "Old title", rationale: "Old evidence", issueType: "coverage", evidence: { covered: 29 }, confidence: "high" as const, fingerprint: "a".repeat(64) };
test("finite revision evidence cannot silently serialize Infinity into null", () => {
  const input = { id: "00000000-0000-4000-8000-000000000001", expectedUpdatedAt: "2026-10-08T12:00:00Z", title: "Current", rationale: "Audit", confidence: "high", reason: "Facts", evidence: JSON.parse('{"impressions":1e400}') };
  assert.throws(() => validateRecommendationRevisions([input]), /seo_recommendation_batch_invalid/);
});
async function fixture() {
  await resetTestDatabase(url); const db = createDb(url); const repo = createSeoRepository(db);
  const row = await repo.createRecommendation(command);
  const history = createRecommendationHistoryRepository(db);
  const revision: RecommendationRevision = { id: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), title: "All pages covered", rationale: "Official saved audit", evidence: { covered: 78 }, confidence: "high", status: "dismissed", reason: "Resolved by approved core expansion" };
  return { db, repo, history, row, revision };
}
(url ? test : test.skip)("guarded revision preserves identity and before evidence; exact replay is a no-op", async () => {
  const f = await fixture(); const result = await f.history.revise(f.revision, actor);
  assert.equal(result.unchanged, false); assert.equal(result.item.status, "dismissed");
  assert.equal(result.item.fingerprint, f.row.fingerprint); assert.equal(result.item.issueType, "coverage");
  const events = await f.history.list({ recommendationId: f.row.id, limit: 100, cursor: null });
  assert.equal(events.items.length, 2); assert.equal(events.items[0].beforeSnapshot?.title, "Old title");
  assert.deepEqual(events.items[0].beforeSnapshot?.evidence, { covered: 29 });
  assert.deepEqual(events.items[0].afterSnapshot.evidence, { covered: 78 });
  assert.deepEqual(events.items[0].actor, actor);
  assert.equal((await f.history.revise(f.revision, actor)).unchanged, true);
  assert.equal((await f.history.list({ recommendationId: f.row.id, limit: 100, cursor: null })).items.length, 2);
  await assert.rejects(f.history.revise({ ...f.revision, title: "Stale overwrite" }, actor), /seo_recommendation_revision_conflict/);
});
(url ? test : test.skip)("ordinary status and dedup refresh keep history and strictly advance update tokens", async () => {
  const f = await fixture();
  await f.db.update(seoRecommendations).set({ updatedAt: new Date("2099-01-01T00:00:00Z") }).where(eq(seoRecommendations.id, f.row.id));
  const refreshed = await f.repo.createRecommendation({ ...command, rationale: "Fresh rationale" });
  assert.equal(refreshed.id, f.row.id); assert.equal(refreshed.updatedAt.toISOString(), "2099-01-01T00:00:00.001Z");
  const accepted = await f.repo.updateRecommendationStatus(f.row.id, "new", "accepted", actor);
  assert.equal(accepted.updatedAt.toISOString(), "2099-01-01T00:00:00.002Z");
  const events = await f.history.list({ recommendationId: f.row.id, limit: 100, cursor: null });
  assert.deepEqual(events.items.map(e => e.eventType), ["status", "refreshed", "created"]);
  assert.equal(events.items[0].beforeSnapshot?.status, "new");
  await assert.rejects(f.history.revise({ ...f.revision, expectedUpdatedAt: refreshed.updatedAt.toISOString() }, actor), /seo_recommendation_revision_conflict/);
});
(url ? test : test.skip)("batch rollback preserves earlier cards and rejects invalid transitions and oversized input", async () => {
  const f = await fixture(); const other = await f.repo.createRecommendation({ ...command, fingerprint: "b".repeat(64) });
  await assert.rejects(f.history.reconcile([f.revision, { ...f.revision, id: other.id, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }], actor), /seo_recommendation_revision_conflict/);
  const [still] = await f.db.select().from(seoRecommendations).where(eq(seoRecommendations.id, f.row.id));
  assert.equal(still.title, "Old title");
  assert.equal((await f.history.list({ recommendationId: f.row.id, limit: 100, cursor: null })).items.length, 1);
  await assert.rejects(f.history.revise({ ...f.revision, status: "implemented" }, actor), /seo_recommendation_transition_invalid/);
  await assert.rejects(f.history.reconcile(Array.from({ length: 101 }, () => f.revision), actor), /seo_recommendation_batch_invalid/);
  await assert.rejects(f.history.revise({ ...f.revision, reason: "" }, actor), /seo_recommendation_revision_invalid/);
});
(url ? test : test.skip)("history pagination stays scoped to one recommendation", async () => {
  const f = await fixture(); const other = await f.repo.createRecommendation({ ...command, fingerprint: "b".repeat(64) });
  await f.history.revise(f.revision, actor);
  const first = await f.history.list({ recommendationId: f.row.id, limit: 1, cursor: null });
  const next = await f.history.list({ recommendationId: f.row.id, limit: 1, cursor: first.nextCursor });
  assert.equal(first.items[0].eventType, "revised"); assert.equal(next.items[0].eventType, "created");
  assert.notEqual(first.items[0].recommendationId, other.id); assert.equal(next.nextCursor, null);
  await assert.rejects(f.history.list({ recommendationId: f.row.id, limit: 101, cursor: null }), /seo_limit_invalid/);
  await assert.rejects(f.history.list({ recommendationId: f.row.id, limit: 1, cursor: "bad" }), /seo_cursor_invalid/);
});

(url ? test : test.skip)("two concurrent revisions cannot overwrite one another", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.history.revise({ ...f.revision, status: "new", title: "First" }, actor), f.history.revise({ ...f.revision, status: "new", title: "Second" }, actor)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.match(rejected.reason.message, /seo_recommendation_revision_conflict/);
  assert.equal((await f.history.list({ recommendationId: f.row.id, limit: 100, cursor: null })).items.length, 2);
});

(url ? test : test.skip)("history cannot appear under a different current page filter", async () => {
  const f = await fixture();
  await f.db.update(seoRecommendations).set({ pagePath: "/services/a/" }).where(eq(seoRecommendations.id, f.row.id));
  assert.equal((await f.history.list({ recommendationId: f.row.id, pagePath: "/services/b/", limit: 100, cursor: null })).items.length, 0);
  assert.equal((await f.history.list({ recommendationId: f.row.id, pagePath: "/services/a/", limit: 100, cursor: null })).items.length, 1);
});
