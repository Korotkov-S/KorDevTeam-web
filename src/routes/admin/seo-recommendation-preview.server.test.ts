import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { fixture, acceptedFixture, executionTestUrl } from "../../../tests/helpers/seoExecution";
import { seoRecommendationHistory } from "../../server/db/schema";
import { readRecommendationPreviews } from "./seo-recommendation-preview.server";
const databaseTest = executionTestUrl ? test : test.skip;
databaseTest("approval preview binds actual recommendation and complete diff without mutating history", async () => {
  const f = await fixture(), before = await f.db.select().from(seoRecommendationHistory);
  const previews = await readRecommendationPreviews(f.repo, [{ id: f.recommendation.id }]);
  const preview = previews[f.recommendation.id];
  assert.equal(preview.canApprove, true); assert.equal(preview.supported, true);
  assert.equal(preview.recommendation?.updatedAt, f.recommendation.updatedAt.toISOString());
  assert.equal(preview.baseHash, f.plan.baseHash); assert.deepEqual(preview.diff, [{ fieldPath: "bodyMd", before: "Прежний текст", after: "Новый практический шаг" }]);
  assert.equal((await f.db.select().from(seoRecommendationHistory)).length, before.length);
});
databaseTest("revised approved variant needs a new explicit click; applied preview cannot reapprove", async () => {
  const f = await acceptedFixture();
  assert.equal((await readRecommendationPreviews(f.repo, [{ id: f.recommendation.id }]))[f.recommendation.id].canApprove, false);
  await f.repo.apply(f.command, f.executor);
  const preview = (await readRecommendationPreviews(f.repo, [{ id: f.recommendation.id }]))[f.recommendation.id];
  assert.equal(preview.state, "applied"); assert.equal(preview.canApprove, false); assert.equal(preview.supported, true);
  assert.equal(preview.execution?.appliedVersion, 2);
  assert.equal((await f.db.select().from(seoRecommendationHistory).where(eq(seoRecommendationHistory.eventType, "approval"))).length, 1);
});
