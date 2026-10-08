import { createHash } from "node:crypto";
import type { GeoPlatform, GeoRunMode } from "./contracts";

export type GeoAnalyticsRow = {
  runId: string;
  runStatus: "running" | "success" | "partial" | "failed";
  platform: GeoPlatform;
  surface: string;
  mode: GeoRunMode;
  language: string;
  region: string;
  promptSetFingerprint: string;
  runPromptIds: string[];
  plannedCount: number;
  completedCount: number;
  storedCount: number;
  runStartedAt: Date | string;
  runCompletedAt: Date | string | null;
  runSessionPersonalized: boolean | null;
  runComparisonEligible: boolean;
  promptId: string;
  topicId: string;
  category: string;
  promptText: string;
  promptUpdatedAt: Date | string;
  sessionPersonalized: boolean;
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

export type GeoScope = {
  platform?: GeoPlatform; surface?: string; mode?: GeoRunMode; language?: string; region?: string;
  topicId?: string; promptIds?: string[]; promptSetFingerprint?: string; sessionPersonalized?: boolean;
};

const iso = (date: Date | string | null) => {
  const time = date === null ? NaN : new Date(date).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const sortedIds = (ids: readonly string[]) => [...ids].sort();

export type GeoSnapshot = {
  runId: string; date: string; platform: GeoPlatform; surface: string; mode: GeoRunMode;
  language: string; region: string; sessionPersonalized: boolean; topicId: string | null;
  promptSetFingerprint: string; promptIds: string[]; fullPromptIds: string[]; definitionFingerprint: string;
  rows: GeoAnalyticsRow[]; mentionRate: number; citationRate: number;
};

// Validate the entire original plan before any topic/prompt/personalization projection.
export function buildGeoSnapshots(rows: readonly GeoAnalyticsRow[]): GeoSnapshot[] {
  const runs = new Map<string, GeoAnalyticsRow[]>();
  for (const row of rows) {
    const group = runs.get(row.runId) ?? [];
    group.push(row); runs.set(row.runId, group);
  }
  const snapshots: GeoSnapshot[] = [];
  for (const [runId, group] of runs) {
    const first = group[0]!;
    const started = iso(first.runStartedAt), completed = iso(first.runCompletedAt);
    const ids = first.runPromptIds ? sortedIds(first.runPromptIds) : [];
    if (first.runStatus !== "success" || first.runComparisonEligible === false || !started || !completed
      || completed < started || !ids.length || new Set(ids).size !== ids.length
      || first.plannedCount !== ids.length * 3 || first.completedCount !== first.plannedCount
      || first.storedCount !== first.plannedCount || group.length !== first.plannedCount
      || typeof first.sessionPersonalized !== "boolean" || !first.surface?.trim()) continue;
    const runKey = (row: GeoAnalyticsRow) => JSON.stringify([row.runStatus, row.platform, row.surface, row.mode,
      row.language, row.region, row.promptSetFingerprint, sortedIds(row.runPromptIds ?? []),
      row.plannedCount, row.completedCount, row.storedCount, iso(row.runStartedAt), iso(row.runCompletedAt),
      row.runSessionPersonalized, row.runComparisonEligible, row.sessionPersonalized]);
    const key = runKey(first);
    if (group.some(row => runKey(row) !== key || !ids.includes(row.promptId)
      || (row.runSessionPersonalized !== null && row.runSessionPersonalized !== row.sessionPersonalized)
      || !iso(row.promptUpdatedAt) || iso(row.promptUpdatedAt)! > started)) continue;
    const definitions: unknown[] = [];
    let valid = true;
    for (const id of ids) {
      const triple = group.filter(row => row.promptId === id);
      const definition = (row: GeoAnalyticsRow) => JSON.stringify([row.promptText, iso(row.promptUpdatedAt), row.topicId, row.category]);
      if (triple.length !== 3 || new Set(triple.map(row => row.repetition)).size !== 3
        || ![1, 2, 3].every(repetition => triple.some(row => row.repetition === repetition))
        || triple.some(row => definition(row) !== definition(triple[0]!))) { valid = false; break; }
      definitions.push([id, definition(triple[0]!)]);
    }
    if (!valid) continue;
    snapshots.push({ runId, date: completed, platform: first.platform, surface: first.surface, mode: first.mode,
      language: first.language, region: first.region, sessionPersonalized: first.sessionPersonalized, topicId: null,
      promptSetFingerprint: first.promptSetFingerprint, promptIds: ids, fullPromptIds: ids,
      definitionFingerprint: createHash("sha256").update(JSON.stringify(definitions)).digest("hex"), rows: group,
      mentionRate: group.filter(row => row.mentioned).length / group.length,
      citationRate: group.filter(row => row.cited).length / group.length });
  }
  return snapshots;
}

export function projectGeoSnapshots(snapshots: readonly GeoSnapshot[], filters: GeoScope = {}): GeoSnapshot[] {
  return snapshots.flatMap(snapshot => {
    if ((filters.platform && snapshot.platform !== filters.platform) || (filters.surface && snapshot.surface !== filters.surface)
      || (filters.mode && snapshot.mode !== filters.mode) || (filters.language && snapshot.language !== filters.language)
      || (filters.region && snapshot.region !== filters.region)
      || (filters.promptSetFingerprint && snapshot.promptSetFingerprint !== filters.promptSetFingerprint)
      || (filters.sessionPersonalized !== undefined && snapshot.sessionPersonalized !== filters.sessionPersonalized)) return [];
    const rows = snapshot.rows.filter(row => (!filters.topicId || row.topicId === filters.topicId)
      && (!filters.promptIds?.length || filters.promptIds.includes(row.promptId)));
    if (!rows.length) return [];
    return [{ ...snapshot, topicId: filters.topicId ?? null, rows,
      promptIds: sortedIds([...new Set(rows.map(row => row.promptId))]),
      mentionRate: rows.filter(row => row.mentioned).length / rows.length,
      citationRate: rows.filter(row => row.cited).length / rows.length }];
  });
}

export function geoCohortKey(snapshot: GeoSnapshot) {
  return JSON.stringify([snapshot.platform, snapshot.surface, snapshot.mode, snapshot.language, snapshot.region,
    snapshot.sessionPersonalized, snapshot.topicId, snapshot.promptSetFingerprint, snapshot.definitionFingerprint,
    sortedIds(snapshot.fullPromptIds), sortedIds(snapshot.promptIds)]);
}

function bucket(promptIds: string[]) {
  const sorted = [...new Set(promptIds)].sort();
  return { prompts: sorted.length, promptIds: sorted };
}

export function summarizeGeoObservations(rows: readonly GeoAnalyticsRow[], filters: GeoScope = {}) {
  return summarizeGeoSnapshots(projectGeoSnapshots(buildGeoSnapshots(rows), filters));
}

export function summarizeGeoSnapshots(snapshots: readonly GeoSnapshot[]) {
  const included = [...new Map(snapshots.map(snapshot => [snapshot.runId, snapshot])).values()].flatMap(snapshot => snapshot.rows);
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

export type GeoWeeklySnapshot = GeoSnapshot;

export function compareGeoSnapshots(snapshots: readonly GeoWeeklySnapshot[]) {
  const unique = [...new Map(snapshots.map(snapshot => [snapshot.runId, snapshot])).values()];
  if (unique.length < 3) {
    return { status: "insufficient_baseline" as const, requiredSnapshots: 3, availableSnapshots: unique.length };
  }
  const sorted = unique.sort((left, right) => left.date.localeCompare(right.date) || left.runId.localeCompare(right.runId));
  const first = sorted[0];
  if (!first) return { status: "insufficient_baseline" as const, requiredSnapshots: 3, availableSnapshots: 0 };
  const promptIds = [...first.promptIds].sort();
  const comparable = sorted.every(snapshot => geoCohortKey(snapshot) === geoCohortKey(first));
  if (!comparable) return { status: "incomparable_prompt_sets" as const };
  const last = sorted.at(-1)!;
  return {
    status: "comparable" as const,
    dimensions: {
      platform: first.platform,
      surface: first.surface,
      sessionPersonalized: first.sessionPersonalized,
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
