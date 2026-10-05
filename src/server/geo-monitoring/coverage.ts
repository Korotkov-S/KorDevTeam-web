import type { GeoPlatform } from "./contracts";
export const GEO_SURFACES: Record<GeoPlatform, string> = {
  yandex_alice: "alice_web",
  google_ai: "google_ai_mode",
  bing_copilot: "bing_copilot_search",
  chatgpt_search: "chatgpt_search_web",
};
export const COVERAGE_PLATFORMS = [
  "yandex_alice",
  "google_ai",
  "bing_copilot",
  "chatgpt_search",
] as const;
export function missingRepetitions(stored: number[]): Array<1 | 2 | 3> {
  return ([1, 2, 3] as const).filter((n) => !stored.includes(n));
}
export function geoAvailabilityRetry(
  now: Date,
  attempt: number,
  errorCode: string,
): Date | null {
  if (
    errorCode !== "platform_unavailable" &&
    errorCode !== "browser_unavailable"
  )
    return null;
  return attempt < 3
    ? new Date(+now + [30, 120][Math.max(0, attempt - 1)] * 60000)
    : null;
}
export function shouldRefreshFreeSeo(
  lastRefresh: Date | null,
  now: Date,
): boolean {
  const day = (d: Date) => new Date(+d + 10800000).toISOString().slice(0, 10);
  return !lastRefresh || day(lastRefresh) !== day(now);
}
export function coverageTotals(
  items: Array<{ state: string; completedRepetitions: number }>,
) {
  const completeCount = items.filter((j) => j.state === "complete").length;
  const cancelledCount = items.filter((j) => j.state === "cancelled").length;
  return {
    plannedCount: items.length,
    completeCount,
    remainingCount: items.length - completeCount - cancelledCount,
    blockedCount: items.filter((j) => j.state === "blocked").length,
    cancelledCount,
    storedCount: items.reduce((n, j) => n + j.completedRepetitions, 0),
    plannedAnswers: items.length * 3,
    minimumDays: Math.ceil((items.length * 3) / 18),
    goalDays: 28,
  };
}
