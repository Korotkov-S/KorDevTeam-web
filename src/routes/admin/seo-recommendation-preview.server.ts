import type { RecommendationExecutionService } from "../../server/seo-monitoring/recommendationExecutionService";
import { prepareExecutionPatch } from "../../server/seo-monitoring/recommendationExecutionPlan";
import type { RecommendationPreview } from "./seo-recommendation-card";

export async function readRecommendationPreviews(service: Pick<RecommendationExecutionService, "get"> | undefined, items: Array<{ id: string }>) {
  if (!service) return {};
  return Object.fromEntries(await Promise.all(items.map(async item => {
    const work = await service.get(item.id), execution = work.execution;
    const result: RecommendationPreview = { recommendation: { ...work.recommendation, updatedAt: work.recommendation.updatedAt.toISOString() }, state: work.state, errorCode: work.errorCode, supported: false, canApprove: false,
      baseVersion: null, baseHash: null, diff: [], criteria: [], execution: execution ? { id: execution.id, approvedAt: execution.approvedAt.toISOString(),
        appliedAt: execution.appliedAt?.toISOString() ?? null, appliedVersion: execution.appliedVersion, appliedChangeId: execution.appliedChangeId,
        completedAt: execution.completedAt?.toISOString() ?? null, lastVerificationError: execution.lastVerificationAttempt?.errorCode ?? null } : null };
    const plan = execution?.appliedAt ? execution.approvedPlan : work.recommendation.executionPlan;
    const page = execution?.appliedAt ? execution.baseSnapshot : work.currentPage;
    if (plan && page) {
      try {
        if (work.recommendation.pagePath !== plan.pagePath) throw Error("seo_execution_page_conflict");
        const prepared = prepareExecutionPatch(page, plan);
        result.supported = true; result.diff = prepared.diff; result.criteria = plan.criteria; result.baseVersion = plan.baseVersion; result.baseHash = plan.baseHash;
        result.canApprove = !execution?.appliedAt && ["new", "accepted"].includes(work.recommendation.status) && work.state !== "ready";
      } catch { result.errorCode = "seo_execution_page_conflict"; }
    }
    return [item.id, result];
  })));
}
