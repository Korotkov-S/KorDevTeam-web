import type { seoRankJobs, seoRankRuns } from "../db/schema";
export type RankJob = typeof seoRankJobs.$inferSelect;
export type RankPlan = {
  runId: string;
  checkDate: string;
  startedAt: Date;
  expiresAt: Date;
  jobs: RankJob[];
  quotaMetadata: Record<string, unknown>;
};
export type RankProgress = {
  runId: string;
  checkDate: string;
  status: "success" | "partial" | "failed";
  plannedCount: number;
  completedCount: number;
  storedCount: number;
  remainingCount: number;
  blockedCount: number;
  nextAttemptAt: Date | null;
  periodFrom: Date;
  periodTo: Date | null;
  errorCode: string | null;
  retryable: boolean;
};
export function moscowDate(now: Date): string {
  return new Date(now.getTime() + 10800000).toISOString().slice(0, 10);
}
export function rankWeek(now: Date) {
  const day = new Date(now.getTime() + 10800000);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const from = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 6);
  return { from, to: day.toISOString().slice(0, 10) };
}
export function summarizeRankPlan(
  run: typeof seoRankRuns.$inferSelect,
  jobs: RankJob[],
): RankProgress {
  const legacy =
    jobs.length === 0 && run.plannedCount > 0 && run.status !== "success";
  const storedCount = jobs.length
    ? jobs.filter((j) => j.state === "stored").length
    : run.storedCount;
  const blockedCount = legacy
    ? Math.max(0, run.plannedCount - storedCount)
    : jobs.filter((j) => j.state === "blocked" || j.state === "expired").length;
  const remainingCount = Math.max(0, run.plannedCount - storedCount);
  const retryable = remainingCount > blockedCount;
  const next =
    jobs
      .filter((j) => ["queued", "polling", "retry_wait"].includes(j.state))
      .map((j) => j.nextAttemptAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const checked = jobs
    .map((j) => j.checkedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  return {
    runId: run.id,
    checkDate: run.checkDate,
    status:
      remainingCount === 0 && !(jobs.length === 0 && run.errorCode)
        ? "success"
        : storedCount > 0 || retryable
          ? "partial"
          : "failed",
    plannedCount: run.plannedCount,
    completedCount: storedCount,
    storedCount,
    remainingCount,
    blockedCount,
    nextAttemptAt: next,
    periodFrom: run.startedAt,
    periodTo: checked[0] ?? run.completedAt,
    errorCode: legacy
      ? "legacy_resume_unavailable"
      : jobs.length
        ? (jobs.find((j) => j.errorCode)?.errorCode ?? null)
        : run.errorCode,
    retryable,
  };
}
