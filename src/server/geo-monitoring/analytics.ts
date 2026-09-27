import type { GeoPlatform, GeoRunMode } from "./contracts";

export type GeoAnalyticsRow = {
  runId: string;
  runStatus: "running" | "success" | "partial" | "failed";
  platform: GeoPlatform;
  mode: GeoRunMode;
  language: string;
  region: string;
  promptSetFingerprint: string;
  promptId: string;
  topicId: string;
  repetition: number;
  mentioned: boolean;
  cited: boolean;
  ownedCitationCount: number;
  totalCitationCount: number;
  expectedOwnedCitationCount: number;
  ownedEntityMentionCount: number;
  confirmedCompetitorMentionCount: number;
};

type Rate = { numerator: number; denominator: number; value: number | null };

function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}

function completeRows(rows: readonly GeoAnalyticsRow[]): GeoAnalyticsRow[] {
  const successful = rows.filter((row) => row.runStatus === "success");
  const groups = new Map<string, GeoAnalyticsRow[]>();
  for (const row of successful) {
    const key = `${row.runId}\u0000${row.promptId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const complete = new Set([...groups.entries()].filter(([, values]) => {
    const repetitions = new Set(values.map((row) => row.repetition));
    return values.length === 3 && repetitions.size === 3 && [1, 2, 3].every((value) => repetitions.has(value));
  }).map(([key]) => key));
  return successful.filter((row) => complete.has(`${row.runId}\u0000${row.promptId}`));
}

function bucket(promptIds: string[]) {
  const sorted = [...new Set(promptIds)].sort();
  return { prompts: sorted.length, promptIds: sorted };
}

export function summarizeGeoObservations(rows: readonly GeoAnalyticsRow[]) {
  const included = completeRows(rows);
  const byPrompt = new Map<string, GeoAnalyticsRow[]>();
  for (const row of included) byPrompt.set(row.promptId, [...(byPrompt.get(row.promptId) ?? []), row]);
  const strong: string[] = [];
  const strengthenSource: string[] = [];
  const restoreBrand: string[] = [];
  const attention: string[] = [];
  for (const [promptId, observations] of byPrompt) {
    const mentioned = observations.some((row) => row.mentioned);
    const cited = observations.some((row) => row.cited);
    const competitor = observations.some((row) => row.confirmedCompetitorMentionCount > 0);
    if (mentioned && cited) strong.push(promptId);
    else if (mentioned) strengthenSource.push(promptId);
    else if (cited) restoreBrand.push(promptId);
    else if (competitor) attention.push(promptId);
  }
  const ownedCitations = included.reduce((sum, row) => sum + row.ownedCitationCount, 0);
  const totalCitations = included.reduce((sum, row) => sum + row.totalCitationCount, 0);
  const expectedOwnedCitations = included.reduce((sum, row) => sum + row.expectedOwnedCitationCount, 0);
  const ownedMentions = included.reduce((sum, row) => sum + row.ownedEntityMentionCount, 0);
  const competitorMentions = included.reduce((sum, row) => sum + row.confirmedCompetitorMentionCount, 0);
  return {
    mentionRate: rate(included.filter((row) => row.mentioned).length, included.length),
    citationRate: rate(included.filter((row) => row.cited).length, included.length),
    citationShare: rate(ownedCitations, totalCitations),
    ownedSourceCoverage: rate(expectedOwnedCitations, ownedCitations),
    shareOfVoice: rate(ownedMentions, ownedMentions + competitorMentions),
    sample: {
      runs: new Set(included.map((row) => row.runId)).size,
      prompts: new Set(included.map((row) => row.promptId)).size,
      observations: included.length,
      requiredRepetitions: 3,
    },
    actionMatrix: {
      strong: bucket(strong),
      strengthenSource: bucket(strengthenSource),
      restoreBrand: bucket(restoreBrand),
      attention: bucket(attention),
    },
  };
}

export type GeoWeeklySnapshot = {
  date: string;
  platform: GeoPlatform;
  mode: GeoRunMode;
  language: string;
  region: string;
  topicId: string | null;
  promptSetFingerprint: string;
  promptIds: string[];
  mentionRate: number;
  citationRate: number;
};

export function compareGeoSnapshots(snapshots: readonly GeoWeeklySnapshot[]) {
  if (snapshots.length < 3) {
    return { status: "insufficient_baseline" as const, requiredSnapshots: 3, availableSnapshots: snapshots.length };
  }
  const sorted = [...snapshots].sort((left, right) => left.date.localeCompare(right.date));
  const first = sorted[0];
  if (!first) return { status: "insufficient_baseline" as const, requiredSnapshots: 3, availableSnapshots: 0 };
  const promptIds = [...first.promptIds].sort();
  const comparable = sorted.every((snapshot) => snapshot.platform === first.platform
    && snapshot.mode === first.mode
    && snapshot.language === first.language
    && snapshot.region === first.region
    && snapshot.topicId === first.topicId
    && snapshot.promptSetFingerprint === first.promptSetFingerprint
    && JSON.stringify([...snapshot.promptIds].sort()) === JSON.stringify(promptIds));
  if (!comparable) return { status: "incomparable_prompt_sets" as const };
  const last = sorted.at(-1)!;
  return {
    status: "comparable" as const,
    dimensions: {
      platform: first.platform,
      mode: first.mode,
      language: first.language,
      region: first.region,
      topicId: first.topicId,
      promptSetFingerprint: first.promptSetFingerprint,
      promptIds,
    },
    period: { from: first.date, to: last.date, snapshots: sorted.length },
    mentionRate: { first: first.mentionRate, last: last.mentionRate, delta: last.mentionRate - first.mentionRate },
    citationRate: { first: first.citationRate, last: last.citationRate, delta: last.citationRate - first.citationRate },
  };
}
