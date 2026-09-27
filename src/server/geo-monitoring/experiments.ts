export type ExperimentMilestone = 7 | 14 | 28;

export function milestoneLabel(milestone: ExperimentMilestone) {
  if (milestone === 7) return "early_signal" as const;
  if (milestone === 14) return "intermediate" as const;
  return "final" as const;
}

export function evaluateExperimentMetric(input: {
  milestone: ExperimentMilestone;
  baseline: number | null;
  result: number | null;
  direction: "increase" | "decrease";
  minimumDelta: number;
  baselineSample: number;
  resultSample: number;
  complete: boolean;
  confoundingChanges: string[];
}) {
  const delta = input.baseline === null || input.result === null ? null : input.result - input.baseline;
  const confounded = input.confoundingChanges.length > 0;
  let verdict: "pending" | "won" | "lost" | "inconclusive" = "pending";
  if (!input.complete || input.baseline === null || input.result === null || confounded) verdict = "inconclusive";
  else if (input.milestone === 28) {
    const directionalDelta = input.direction === "increase" ? delta! : -delta!;
    verdict = directionalDelta >= input.minimumDelta ? "won" : "lost";
  }
  return {
    milestone: input.milestone,
    label: milestoneLabel(input.milestone),
    baseline: { value: input.baseline, sample: input.baselineSample },
    result: { value: input.result, sample: input.resultSample },
    delta,
    direction: input.direction,
    minimumDelta: input.minimumDelta,
    complete: input.complete,
    confounded,
    confoundingChanges: input.confoundingChanges,
    verdict,
  };
}
