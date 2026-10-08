import { buildGeoSnapshots, compareGeoSnapshots, geoCohortKey, projectGeoSnapshots, summarizeGeoSnapshots,
  type GeoAnalyticsRow, type GeoScope, type GeoSnapshot } from "./analytics";
import type { GeoPlatform } from "./contracts";

type CatalogPrompt = { id: string; category: string; language: string; region: string; topicId: string };

export function summarizeGeoControl(input: {
  rows: readonly GeoAnalyticsRow[]; prompts: readonly CatalogPrompt[]; platforms: readonly GeoPlatform[]; filters: GeoScope;
}) {
  const snapshots = projectGeoSnapshots(buildGeoSnapshots(input.rows), input.filters);
  const prompts = input.prompts.filter(prompt => (!input.filters.language || prompt.language === input.filters.language)
    && (!input.filters.region || prompt.region === input.filters.region)
    && (!input.filters.topicId || prompt.topicId === input.filters.topicId)
    && (!input.filters.promptIds?.length || input.filters.promptIds.includes(prompt.id)));
  const coverage = input.platforms.filter(platform => !input.filters.platform || platform === input.filters.platform)
    .flatMap(platform => (["brand", "nonbrand"] as const).map(category => {
      const ids = prompts.filter(prompt => (prompt.category === "brand") === (category === "brand")).map(prompt => prompt.id);
      const latest = new Map<string, GeoSnapshot>();
      for (const snapshot of [...snapshots].sort((a, b) => a.date.localeCompare(b.date) || a.runId.localeCompare(b.runId))) {
        if (snapshot.platform !== platform) continue;
        for (const id of snapshot.promptIds) {
          if (ids.includes(id)) latest.set(id, { ...snapshot, rows: snapshot.rows.filter(row => row.promptId === id) });
        }
      }
      // One latest eligible triple per catalogue question, even when several questions share a run.
      const rows = [...latest.values()].flatMap(snapshot => snapshot.rows);
      const rate = (numerator: number) => ({ numerator, denominator: rows.length, value: rows.length ? numerator / rows.length : null });
      return { platform, category, plannedQuestions: ids.length, checkedQuestions: latest.size,
        uncheckedQuestions: ids.length - latest.size, mentionRate: rate(rows.filter(row => row.mentioned).length),
        citationRate: rate(rows.filter(row => row.cited).length), descriptiveOnly: true as const };
    }));
  const groups = new Map<string, GeoSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = geoCohortKey(snapshot), group = groups.get(key) ?? [];
    group.push(snapshot); groups.set(key, group);
  }
  const cohorts = [...groups.values()].map(group => {
    const first = group[0]!;
    const runIds = [...new Set(group.map(snapshot => snapshot.runId))];
    return { platform: first.platform, surface: first.surface, mode: first.mode, language: first.language,
      region: first.region, sessionPersonalized: first.sessionPersonalized, topicId: first.topicId,
      promptIds: first.promptIds, fullPromptIds: first.fullPromptIds, promptSetFingerprint: first.promptSetFingerprint,
      definitionFingerprint: first.definitionFingerprint, runIds, completeSnapshots: runIds.length,
      requiredSnapshots: 3, decisionReady: runIds.length >= 3, comparison: compareGeoSnapshots(group),
      metrics: summarizeGeoSnapshots(group) };
  });
  return { coverage, cohorts, descriptiveOnly: true as const, shareOfVoiceScope: "confirmed_tracked_entities" as const };
}
