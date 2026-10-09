import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { acceptedFixture, executionTestUrl } from "../../../tests/helpers/seoExecution";
import { contentEntries, seoChanges, seoRecommendationHistory } from "../db/schema";
import { createRecommendationExecutionService } from "./recommendationExecutionService";
import { verifyPublishedExecution } from "./recommendationExecutionVerification";
const databaseTest = executionTestUrl ? test : test.skip;
function html(s: Awaited<ReturnType<typeof acceptedFixture>>["snapshot"]) { return `<html><head><title>${s.publicContract.title}</title><meta name="description" content="${s.publicContract.description}"><meta name="robots" content="index, follow"><link rel="canonical" href="${s.publicContract.canonical}"></head><body><div data-kordev-content-entry-id="${s.entry.id}" data-kordev-content-version="${s.entry.version}"><h1>${s.publicContract.h1}</h1><p>Новый практический шаг</p></div></body></html>`; }
async function applied() {
  const f = await acceptedFixture(); await f.repo.apply(f.command, f.executor);
  return { ...f, complete: { ...f.command, criteriaEvidence: [{ criterionId: "step", excerpt: "Новый практический шаг", sourceUrl: f.snapshot.publicContract.url }] } };
}
databaseTest("matching_public_version_completes_once", async () => {
  const f = await applied(); let requests = 0;
  const service = createRecommendationExecutionService(f.repo, { invalidate: () => {}, verify: (input) => verifyPublishedExecution(input, (async () => { requests++; return new Response(html(input.snapshot), { headers: { "content-type": "text/html" } }); }) as typeof fetch) });
  const result = await service.complete(f.complete, f.executor);
  assert.equal(result.work.state, "completed"); assert.equal(result.work.recommendation.status, "implemented");
  assert.equal((await service.complete(f.complete, f.executor)).unchanged, true); assert.equal(requests, 1);
  assert.equal((await f.db.select().from(seoChanges)).length, 1);
  assert.equal((await f.db.select().from(seoRecommendationHistory)).filter(e => e.eventType === "execution_verified").length, 1);
  await assert.rejects(service.complete({ ...f.complete, criteriaEvidence: [{ ...f.complete.criteriaEvidence[0], excerpt: "Другая выдержка" }] }, f.executor), /seo_execution_completion_conflict/);
});
databaseTest("page_changed_during_verification_cannot_complete", async () => {
  const f = await applied();
  const service = createRecommendationExecutionService(f.repo, { invalidate: () => {}, verify: async input => {
    const proof = await verifyPublishedExecution(input, (async () => new Response(html(input.snapshot), { headers: { "content-type": "text/html" } })) as typeof fetch);
    await f.db.update(contentEntries).set({ version: 3, bodyMd: "Ручная правка" }).where(eq(contentEntries.id, f.entry.id)); return proof;
  } });
  await assert.rejects(service.complete(f.complete, f.executor), /seo_execution_page_conflict/);
  assert.equal((await f.repo.get(f.recommendation.id)).recommendation.status, "accepted");
});
databaseTest("failed_verification_preserves_accepted_and_applied_result", async () => {
  const f = await applied(); const before = await f.repo.get(f.recommendation.id);
  const service = createRecommendationExecutionService(f.repo, { invalidate: () => {}, verify: async () => { throw Error("seo_execution_verification_failed"); } });
  await assert.rejects(service.complete(f.complete, f.executor), /seo_execution_verification_failed/);
  const after = await f.repo.get(f.recommendation.id);
  assert.equal(after.state, "applied"); assert.equal(after.recommendation.updatedAt.toISOString(), before.recommendation.updatedAt.toISOString());
  assert.equal(after.execution?.appliedHash, before.execution?.appliedHash); assert.equal(after.execution?.completion, null);
  assert.equal(after.execution?.lastVerificationAttempt?.errorCode, "seo_execution_verification_failed");
});
databaseTest("wrong_change_id_cannot_complete", async () => {
  const f = await applied(); const work = await f.repo.get(f.recommendation.id);
  await f.db.update(seoChanges).set({ contentVersion: 999 }).where(eq(seoChanges.id, work.execution!.appliedChangeId!));
  const service = createRecommendationExecutionService(f.repo, { invalidate: () => {}, verify: input => verifyPublishedExecution(input, (async () => new Response(html(input.snapshot), { headers: { "content-type": "text/html" } })) as typeof fetch) });
  await assert.rejects(service.complete(f.complete, f.executor), /seo_execution_change_invalid/);
  assert.equal((await f.repo.get(f.recommendation.id)).recommendation.status, "accepted");
});
