export type EffectSource = "yandex_webmaster" | "google_search_console";
export type EffectStatus = "not_applicable" | "pending_period" | "pending_source" | "pending_coverage" | "pending_refresh" | "pending_provenance"
  | "confounded" | "incompatible" | "insufficient_data" | "improved" | "declined" | "no_material_change";
type Window = { from: string; to: string };
export type EffectMetric = { queryId: string; date: string; regionCode: string; device: string; impressions: number; clicks: number; averagePosition: number };
export type EffectRun = { id: string; status: string; requestedFrom: string; requestedTo: string; startedAt: string; completedAt: string | null };
type Sample = { queryId: string; impressions: number; clicks: number; averagePosition: number | null };
export type EffectBaseline = { window: Window; complete: boolean; capturedAt: string; retrospective: boolean;
  impressions: number; clicks: number; ctr: number | null; averagePosition: number | null; queries: Sample[]; runIds: string[] };
export type EffectInput = {
  source: EffectSource; checkpoint: 7 | 14 | 28; now: string;
  change: { id: string; pagePath: string; type: string; appliedAt: string; contentVersion: number | null };
  publication: { pagePath: string; version: number; indexable: boolean } | null;
  cohort: string[]; currentCohort: string[]; baseline?: EffectBaseline;
  subsequentChanges: string[]; runs: EffectRun[]; metrics: EffectMetric[];
  index: { status: string; checkedAt: string; lastCrawlAt: string | null; publishedVersion: number; pagePath: string;
    technical?: { httpStatus: number | null; canonical: string | null; noindex: boolean | null; robotsAllowed: boolean | null; errorCode: string | null } } | null;
};
export const EFFECT_POLICY = { version: 1, minImpressionsPerQuery: 100, minPositionEffect: 1, maxEvidenceAgeHours: 36,
  metric: "equal_query_mean_impression_weighted_position", scope: "Russia / actual devices / frozen assigned queries", causal: false } as const;
const DAY = 86400000;
const shift = (day: string, n: number) => new Date(+new Date(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
function calendarDay(iso: string, source: EffectSource) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: source === "yandex_webmaster" ? "Europe/Moscow" : "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const field = (name: string) => parts.find(p => p.type === name)!.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}
export function seoEffectWindows(appliedAt: string, source: EffectSource, checkpoint: 7 | 14 | 28) {
  const day = calendarDay(appliedAt, source);
  return { before: { from: shift(day, -checkpoint), to: shift(day, -1) }, after: { from: shift(day, 1), to: shift(day, checkpoint) } };
}
function covered(window: Window, runs: EffectRun[]) {
  for (let day = window.from; day <= window.to; day = shift(day, 1)) {
    if (!runs.some(r => r.status === "success" && r.completedAt && r.requestedFrom <= day && r.requestedTo >= day)) return false;
  }
  return true;
}
function sample(window: Window, input: EffectInput) {
  const allowedDevices = input.source === "yandex_webmaster" ? ["desktop", "mobile"] : ["desktop", "mobile", "tablet"];
  const queries = input.cohort.map(queryId => {
    const rows = input.metrics.filter(r => r.queryId === queryId && r.regionCode === "ru" && allowedDevices.includes(r.device)
      && r.date >= window.from && r.date <= window.to);
    const impressions = rows.reduce((n, r) => n + r.impressions, 0);
    return { queryId, impressions, clicks: rows.reduce((n, r) => n + r.clicks, 0),
      averagePosition: impressions ? rows.reduce((n, r) => n + r.impressions * r.averagePosition, 0) / impressions : null };
  });
  const impressions = queries.reduce((n, q) => n + q.impressions, 0), clicks = queries.reduce((n, q) => n + q.clicks, 0);
  return { queries, impressions, clicks, ctr: impressions ? clicks / impressions : null,
    averagePosition: queries.length && queries.every(q => q.averagePosition !== null)
      ? queries.reduce((n, q) => n + q.averagePosition!, 0) / queries.length : null };
}

export function evaluateSeoEffect(input: EffectInput) {
  const now = +new Date(input.now), applied = +new Date(input.change.appliedAt);
  if (!Number.isFinite(now) || !Number.isFinite(applied) || ![7, 14, 28].includes(input.checkpoint)
    || new Set(input.cohort).size !== input.cohort.length) throw Error("seo_effect_input_invalid");
  const today = calendarDay(input.now, input.source);
  const windows = seoEffectWindows(input.change.appliedAt, input.source, input.checkpoint);
  const runs = input.runs.filter(r => r.completedAt === null || +new Date(r.completedAt) <= now);
  const latest = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))[0];
  const sourceReady = !!latest && latest.status === "success" && latest.completedAt !== null
    && now >= +new Date(latest.startedAt) && now - +new Date(latest.startedAt) <= EFFECT_POLICY.maxEvidenceAgeHours * 3600000;
  const baseline: EffectBaseline = input.baseline?.complete ? input.baseline : { window: windows.before,
    complete: sourceReady && covered(windows.before, runs), capturedAt: input.now, retrospective: now > applied,
    ...sample(windows.before, input), runIds: runs.filter(r => r.status === "success" && r.requestedFrom <= windows.before.to && r.requestedTo >= windows.before.from).map(r => r.id).sort() };
  const after = { window: windows.after, complete: sourceReady && covered(windows.after, runs), ...sample(windows.after, input) };
  let status: EffectStatus;
  const index = input.index, publication = input.publication;
  if (input.change.type === "other") status = "not_applicable";
  else if (windows.after.to >= today) status = "pending_period";
  else if (!sourceReady) status = "pending_source";
  else if (!baseline.complete || !after.complete) status = "pending_coverage";
  else if (input.change.contentVersion === null) status = "pending_provenance";
  else if (!publication || !publication.indexable || input.cohort.some(id => !input.currentCohort.includes(id))) status = "incompatible";
  else if (input.subsequentChanges.some(at => +new Date(at) > applied && calendarDay(at, input.source) <= windows.after.to)
    || (input.change.contentVersion !== null && publication.version !== input.change.contentVersion)) status = "confounded";
  else if (!index || index.status !== "indexed" || index.publishedVersion !== publication.version || index.pagePath !== publication.pagePath
    || (index.technical?.httpStatus != null && index.technical.httpStatus !== 200) || index.technical?.noindex === true
    || index.technical?.robotsAllowed === false || !!index.technical?.errorCode
    || (!!index.technical?.canonical && index.technical.canonical !== `https://kordev.team${publication.pagePath}`)
    || now - +new Date(index.checkedAt) > EFFECT_POLICY.maxEvidenceAgeHours * 3600000 || +new Date(index.checkedAt) > now
    || !index.lastCrawlAt || +new Date(index.lastCrawlAt) < applied || +new Date(index.lastCrawlAt) > now) status = "pending_refresh";
  else if (!input.cohort.length || [...baseline.queries, ...after.queries].some(q => q.impressions < EFFECT_POLICY.minImpressionsPerQuery)
    || baseline.averagePosition === null || after.averagePosition === null) status = "insufficient_data";
  else {
    const delta = after.averagePosition - baseline.averagePosition;
    status = delta <= -EFFECT_POLICY.minPositionEffect ? "improved" : delta >= EFFECT_POLICY.minPositionEffect ? "declined" : "no_material_change";
  }
  const measured = ["improved", "declined", "no_material_change"].includes(status);
  return { status, windows, baseline, after, cohort: input.cohort, source: input.source, checkpoint: input.checkpoint,
    asOfDate: today, policy: EFFECT_POLICY, positionDelta: measured ? after.averagePosition! - baseline.averagePosition! : null,
    latestSource: latest ?? null, index, publication, subsequentChanges: input.subsequentChanges };
}
export type EffectResult = ReturnType<typeof evaluateSeoEffect>;
