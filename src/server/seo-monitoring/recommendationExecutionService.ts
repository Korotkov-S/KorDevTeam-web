import { invalidateAllContentCaches } from "../content/service";
import type { CompleteExecutionCommand, ExecutionCommand } from "./recommendationExecutionPlan";
import { checkedCompleteExecutionCommand, completeExecutionHash, type RecommendationExecutionRepository } from "./recommendationExecutionRepository";
import { verifyPublishedExecution } from "./recommendationExecutionVerification";

export function createRecommendationExecutionService(repository: RecommendationExecutionRepository, options: {
  verify?: typeof verifyPublishedExecution; invalidate?: () => void;
} = {}) {
  const verify = options.verify ?? verifyPublishedExecution, invalidate = options.invalidate ?? invalidateAllContentCaches;
  return {
    get: repository.get, approve: repository.approve,
    async apply(command: ExecutionCommand, actor: { mcpTokenId: string }) {
      const result = await repository.apply(command, actor); invalidate(); return result;
    },
    async complete(input: CompleteExecutionCommand, actor: { mcpTokenId: string }) {
      const command = checkedCompleteExecutionCommand(input, actor);
      const work = await repository.get(command.recommendationId);
      if (!work.execution || work.execution.id !== command.executionId || work.execution.approvedRecommendation.updatedAt !== command.expectedUpdatedAt) throw Error("seo_execution_approval_required");
      if (work.state === "blocked") throw Error(work.errorCode!);
      if (work.state === "completed") {
        if (work.execution.completionHash !== completeExecutionHash(command)) throw Error("seo_execution_completion_conflict");
        return repository.completeVerified(command, work.execution.completion!, actor);
      }
      if (work.state !== "applied" || !work.execution.appliedSnapshot) throw Error("seo_execution_not_applied");
      try {
        const proof = await verify({ snapshot: work.execution.appliedSnapshot, criteria: work.execution.approvedPlan.criteria, criteriaEvidence: command.criteriaEvidence });
        return await repository.completeVerified(command, proof, actor);
      } catch (error) {
        await repository.recordVerificationFailure(command, error instanceof Error ? error.message : "seo_execution_verification_failed", actor);
        throw error;
      }
    },
  };
}
export type RecommendationExecutionService = ReturnType<typeof createRecommendationExecutionService>;
