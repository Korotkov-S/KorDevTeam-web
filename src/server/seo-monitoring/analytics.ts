import { combinedCtr, weightedPosition } from "./normalization";

type DateRange = { from: string; to: string };
type MetricRow = { date: string; clicks: number; impressions: number; position: number };

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("seo_date_invalid");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new Error("seo_date_invalid");
  return parsed;
}

function dateOffset(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildComparisonWindows(lastCompleteDate: string, days: number): {
  current: DateRange;
  previous: DateRange;
} {
  if (!Number.isSafeInteger(days) || days < 1 || days > 366) throw new Error("seo_date_range_invalid");
  return {
    current: { from: dateOffset(lastCompleteDate, 1 - days), to: lastCompleteDate },
    previous: { from: dateOffset(lastCompleteDate, 1 - (days * 2)), to: dateOffset(lastCompleteDate, -days) },
  };
}

export function aggregateDailySeries(rows: readonly MetricRow[], incompleteLatestDate?: string) {
  const grouped = new Map<string, MetricRow[]>();
  for (const row of rows) {
    parseDate(row.date);
    if (row.date === incompleteLatestDate) continue;
    const current = grouped.get(row.date) ?? [];
    current.push(row);
    grouped.set(row.date, current);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => {
    const impressions = values.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = values.reduce((sum, row) => sum + row.clicks, 0);
    return {
      date,
      clicks,
      impressions,
      ctr: combinedCtr(values),
      averagePosition: weightedPosition(values.map((row) => ({
        impressions: row.impressions,
        position: row.position,
      }))),
    };
  });
}

export type PositionBucket = "1-3" | "4-10" | "11-30" | "31-50" | ">50";

export function positionBucket(position: number): PositionBucket {
  if (!Number.isFinite(position) || position <= 0) throw new Error("seo_position_invalid");
  if (position <= 3) return "1-3";
  if (position <= 10) return "4-10";
  if (position <= 30) return "11-30";
  if (position <= 50) return "31-50";
  return ">50";
}

export function detectCannibalization(
  rows: readonly { pagePath: string; impressions: number }[],
  minimumImpressions: number,
): string[] {
  if (!Number.isSafeInteger(minimumImpressions) || minimumImpressions < 1) throw new Error("seo_threshold_invalid");
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.impressions) || row.impressions < 0) throw new Error("seo_metric_invalid");
    totals.set(row.pagePath, (totals.get(row.pagePath) ?? 0) + row.impressions);
  }
  const meaningful = [...totals].filter(([, impressions]) => impressions >= minimumImpressions)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return meaningful.length >= 2 ? meaningful.map(([pagePath]) => pagePath) : [];
}

export function detectPerformanceProblems(
  current: { impressions: number; ctr: number; averagePosition: number },
  previous: { impressions: number; ctr: number; averagePosition: number },
  options: { minimumImpressions: number; positionFall: number; lowCtr: number },
): Array<"position_fall" | "low_ctr"> {
  if (current.impressions < options.minimumImpressions) return [];
  const problems: Array<"position_fall" | "low_ctr"> = [];
  if (current.averagePosition - previous.averagePosition >= options.positionFall) problems.push("position_fall");
  if (current.ctr < options.lowCtr) problems.push("low_ctr");
  return problems;
}

export function suppressRecentAdvice(
  changes: readonly { pagePath: string; appliedAt: Date }[],
  pagePath: string,
  now: Date,
  cooldownDays: number,
): boolean {
  if (!Number.isSafeInteger(cooldownDays) || cooldownDays < 0 || !Number.isFinite(+now)) {
    throw new Error("seo_cooldown_invalid");
  }
  const cutoff = +now - (cooldownDays * 86_400_000);
  return changes.some((change) => change.pagePath === pagePath && +change.appliedAt >= cutoff && +change.appliedAt <= +now);
}
