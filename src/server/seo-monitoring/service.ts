import type {
  seoChanges,
  seoQueries,
  seoRecommendations,
} from "../db/schema";
import { SEO_QUERY_KINDS, SEO_QUERY_STATUSES, type SeoDevice, type SeoQueryKind, type SeoQueryStatus, type SeoSourceId } from "./contracts";
import { normalizeSeoQuery, normalizeSitePath } from "./normalization";
import type { RecommendationRevision } from "./recommendationHistory";
import type { SeoMetricFilters, SeoRepository } from "./repository";
import { journalStates, type ChangeJournalFilters } from "./changeJournal";

type FrequencyBand = typeof seoQueries.$inferSelect.frequencyBand;
type ChangeType = typeof seoChanges.$inferSelect.type;
type RecommendationConfidence = typeof seoRecommendations.$inferSelect.confidence;
type RecommendationStatus = typeof seoRecommendations.$inferSelect.status;
type Actor = { adminUserId?: string; mcpTokenId?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sources = new Set<SeoSourceId>(["yandex_webmaster", "google_search_console"]);
const devices = new Set<SeoDevice>(["desktop", "mobile", "tablet", "all"]);
const frequencyBands = new Set<FrequencyBand>(["high", "medium", "low", "unclassified"]);
const queryStatuses = new Set<SeoQueryStatus>(SEO_QUERY_STATUSES);
const queryKinds = new Set<SeoQueryKind>(SEO_QUERY_KINDS);
const changeTypes = new Set<ChangeType>(["content", "metadata", "structure", "interlinking", "technical", "other"]);
const recommendationConfidence = new Set<RecommendationConfidence>(["low", "medium", "high"]);
const recommendationStatuses = new Set<RecommendationStatus>(["new", "accepted", "rejected", "implemented", "dismissed"]);

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("seo_date_invalid");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new Error("seo_date_invalid");
  return +parsed;
}

function filters(input: SeoMetricFilters): SeoMetricFilters {
  const from = dateValue(input.dateFrom);
  const to = dateValue(input.dateTo);
  if (to < from || (to - from) / 86_400_000 + 1 > 366)
    throw new Error("seo_date_range_invalid");
  if (input.source && !sources.has(input.source)) throw new Error("seo_source_invalid");
  if (input.device && !devices.has(input.device)) throw new Error("seo_device_invalid");
  if (input.frequencyBand && !frequencyBands.has(input.frequencyBand)) throw new Error("seo_frequency_band_invalid");
  if (input.regionId && !uuidPattern.test(input.regionId)) throw new Error("seo_region_invalid");
  return { ...input, ...(input.pagePath ? { pagePath: normalizeSitePath(input.pagePath) } : {}) };
}

function page(input: { limit?: number; cursor?: string | null }) {
  const limit = input.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("seo_limit_invalid");
  const cursor = input.cursor ?? null;
  if (cursor !== null && !/^(?:0|[1-9]\d*)$/u.test(cursor)) throw new Error("seo_cursor_invalid");
  return { limit, cursor };
}

function uuid(value: string, code: string): string {
  if (!uuidPattern.test(value)) throw new Error(code);
  return value;
}

function actorFields(actor: Actor) {
  if ((actor.adminUserId ? 1 : 0) + (actor.mcpTokenId ? 1 : 0) > 1) throw new Error("seo_actor_invalid");
  return {
    ...(actor.adminUserId ? { actorAdminUserId: uuid(actor.adminUserId, "seo_actor_invalid") } : {}),
    ...(actor.mcpTokenId ? { actorMcpTokenId: uuid(actor.mcpTokenId, "seo_actor_invalid") } : {}),
  };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
    && Buffer.byteLength(JSON.stringify(value), "utf8") <= 16_384
  );
}

function boundedText(value: string, maximum: number, code: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(code);
  return normalized;
}

function optionalInteger(value: number | null | undefined, maximum: number, code: string): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(code);
  return value;
}

function instant(value: string): Date {
  const parsed = new Date(value);
  if (!value || Number.isNaN(+parsed)) throw new Error("seo_query_updated_at_invalid");
  return parsed;
}

export function createSeoService(repository: SeoRepository) {
  return {
    getOverview(input: SeoMetricFilters) {
      return repository.getOverview(filters(input));
    },

    getDashboard(input: SeoMetricFilters) {
      return repository.getDashboard(filters(input));
    },

    getTrafficReport(input: { dateFrom: string; dateTo: string }) {
      const validated = filters({ dateFrom: input.dateFrom, dateTo: input.dateTo });
      return repository.getTrafficReport({ dateFrom: validated.dateFrom, dateTo: validated.dateTo });
    },

    listPagePerformance(input: { filters: SeoMetricFilters; limit?: number; cursor?: string | null }) {
      return repository.listPagePerformance(filters(input.filters), page(input));
    },

    getPageControl(input: { pagePath?: string; limit?: number; cursor?: string | null }) {
      return repository.getPageControl({ ...page(input), ...(input.pagePath ? { pagePath: normalizeSitePath(input.pagePath) } : {}) });
    },

    listQueries(input: { filters: SeoMetricFilters; limit?: number; cursor?: string | null }) {
      return repository.listQueries(filters(input.filters), page(input));
    },

    listSemanticCore(input: { status?: SeoQueryStatus; kind?: SeoQueryKind; limit?: number; cursor?: string | null }) {
      if (input.status && !queryStatuses.has(input.status)) throw new Error("seo_query_status_invalid");
      if (input.kind && !queryKinds.has(input.kind)) throw new Error("seo_query_kind_invalid");
      return repository.listSemanticCore({
        ...(input.status ? { status: input.status } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
      }, page(input));
    },

    createCandidate(command: {
      queryText: string;
      targetPath?: string | null;
      wordstatFrequency?: number | null;
      frequencyBand?: FrequencyBand;
      kind?: SeoQueryKind;
      priority?: number;
    }) {
      const queryText = boundedText(command.queryText, 500, "seo_query_text_invalid");
      const frequencyBand = command.frequencyBand ?? "unclassified";
      const kind = command.kind ?? "other";
      if (!frequencyBands.has(frequencyBand)) throw new Error("seo_frequency_band_invalid");
      if (!queryKinds.has(kind)) throw new Error("seo_query_kind_invalid");
      return repository.createCandidate({
        queryText,
        normalizedQuery: normalizeSeoQuery(queryText),
        targetPath: command.targetPath ? normalizeSitePath(command.targetPath) : null,
        wordstatFrequency: optionalInteger(command.wordstatFrequency, Number.MAX_SAFE_INTEGER, "seo_wordstat_frequency_invalid"),
        frequencyBand,
        kind,
        priority: optionalInteger(command.priority ?? 0, 1_000, "seo_query_priority_invalid")!,
      });
    },

    updateSemanticQuery(command: {
      id: string;
      expectedUpdatedAt: string;
      targetPath: string | null;
      wordstatFrequency: number | null;
      frequencyBand: FrequencyBand;
      kind: SeoQueryKind;
      priority: number;
      status: SeoQueryStatus;
    }) {
      if (!frequencyBands.has(command.frequencyBand)) throw new Error("seo_frequency_band_invalid");
      if (!queryKinds.has(command.kind)) throw new Error("seo_query_kind_invalid");
      if (!queryStatuses.has(command.status)) throw new Error("seo_query_status_invalid");
      return repository.updateSemanticQuery(
        uuid(command.id, "seo_query_invalid"),
        instant(command.expectedUpdatedAt),
        {
          targetPath: command.targetPath === null ? null : normalizeSitePath(command.targetPath),
          wordstatFrequency: optionalInteger(command.wordstatFrequency, Number.MAX_SAFE_INTEGER, "seo_wordstat_frequency_invalid"),
          frequencyBand: command.frequencyBand,
          kind: command.kind,
          priority: optionalInteger(command.priority, 1_000, "seo_query_priority_invalid")!,
          status: command.status,
        },
      );
    },

    listRankChecks(input: { filters: SeoMetricFilters; limit?: number; cursor?: string | null }) {
      return repository.listRankChecks(filters(input.filters), page(input));
    },

    getRankControl(input: { dateTo: string }) {
      dateValue(input.dateTo);
      return repository.getRankControl(input.dateTo);
    },
    getRankProgress(input: { dateTo: string }) {
      dateValue(input.dateTo);
      return repository.getRankProgress(input);
    },

    listChangeEffects(input: { pagePath?: string; changeId?: string; changeIds?: string[]; source?: "yandex_webmaster" | "google_search_console"; history?: boolean; limit?: number; cursor?: string | null }) {
      if (input.source && !sources.has(input.source)) throw Error("seo_source_invalid");
      if (input.changeIds && (!Array.isArray(input.changeIds) || input.changeIds.length > 100)) throw Error("seo_change_invalid");
      return repository.listChangeEffects({ ...page(input), ...(input.pagePath ? { pagePath: normalizeSitePath(input.pagePath) } : {}),
        ...(input.source ? { source: input.source } : {}), ...(input.changeIds ? { changeIds: input.changeIds.map(id => uuid(id, "seo_change_invalid")) } : {}),
        ...(input.changeId ? { changeId: uuid(input.changeId, "seo_change_invalid") } : {}), history: input.history === true });
    },
    listChanges(input: ChangeJournalFilters & { limit?: number; cursor?: string | null }) {
      if ((input.dateFrom ? 1 : 0) !== (input.dateTo ? 1 : 0)) throw new Error("seo_date_range_invalid");
      if (input.dateFrom && input.dateTo) filters({ dateFrom: input.dateFrom, dateTo: input.dateTo });
      if (input.changeType && !changeTypes.has(input.changeType)) throw Error("seo_change_type_invalid");
      if (input.effectStatus && !(journalStates as readonly string[]).includes(input.effectStatus)) throw Error("seo_change_state_invalid");
      if (input.sort && !["newest", "oldest"].includes(input.sort)) throw Error("seo_change_sort_invalid");
      if (input.source && !sources.has(input.source)) throw Error("seo_source_invalid");
      if (input.timeZone && input.timeZone !== "Europe/Moscow") throw Error("seo_date_invalid");
      if (input.queryText && input.queryText.length > 200) throw Error("seo_change_search_invalid");
      return repository.listChanges({
        ...(input.changeId ? { changeId: uuid(input.changeId, "seo_change_invalid") } : {}),
        ...(input.queryText?.trim() ? { queryText: input.queryText.trim() } : {}),
        ...(input.changeType ? { changeType: input.changeType } : {}), ...(input.effectStatus ? { effectStatus: input.effectStatus } : {}),
        ...(input.sort ? { sort: input.sort } : {}), ...(input.source ? { source: input.source } : {}), ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        ...(input.pagePath ? { pagePath: normalizeSitePath(input.pagePath) } : {}),
        ...(input.dateFrom ? { dateFrom: input.dateFrom, dateTo: input.dateTo! } : {}),
      }, page(input));
    },

    listRecommendations(input: { status?: RecommendationStatus; pagePath?: string; dateFrom?: string; dateTo?: string; limit?: number; cursor?: string | null }) {
      if (input.status && !recommendationStatuses.has(input.status)) throw new Error("seo_recommendation_status_invalid");
      if ((input.dateFrom ? 1 : 0) !== (input.dateTo ? 1 : 0)) throw new Error("seo_date_range_invalid");
      if (input.dateFrom && input.dateTo) filters({ dateFrom: input.dateFrom, dateTo: input.dateTo });
      return repository.listRecommendations({
        ...(input.status ? { status: input.status } : {}),
        ...(input.pagePath ? { pagePath: normalizeSitePath(input.pagePath) } : {}),
        ...(input.dateFrom ? { dateFrom: input.dateFrom, dateTo: input.dateTo! } : {}),
      }, page(input));
    },

    saveQueryTarget(command: { queryId: string; targetPath: string | null }) {
      return repository.saveQueryTarget(
        uuid(command.queryId, "seo_query_invalid"),
        command.targetPath === null ? null : normalizeSitePath(command.targetPath),
      );
    },

    saveQueryClassification(command: { queryId: string; targetPath: string | null; frequencyBand: FrequencyBand }) {
      if (!frequencyBands.has(command.frequencyBand)) throw new Error("seo_frequency_band_invalid");
      return repository.saveQueryClassification(
        uuid(command.queryId, "seo_query_invalid"),
        command.targetPath === null ? null : normalizeSitePath(command.targetPath),
        command.frequencyBand,
      );
    },

    recordChange(command: {
      pagePath: string;
      summary: string;
      type: ChangeType;
      appliedAt?: Date;
      contentEntryId?: string;
      contentVersion?: number;
    }, actor: Actor) {
      if (!changeTypes.has(command.type)) throw new Error("seo_change_type_invalid");
      if (command.appliedAt && !Number.isFinite(+command.appliedAt)) throw new Error("seo_change_date_invalid");
      if (command.contentVersion !== undefined && (!Number.isSafeInteger(command.contentVersion) || command.contentVersion < 1)) {
        throw new Error("seo_content_version_invalid");
      }
      return repository.recordChange({
        pagePath: normalizeSitePath(command.pagePath),
        summary: boundedText(command.summary, 2_000, "seo_change_summary_invalid"),
        type: command.type,
        ...(command.appliedAt ? { appliedAt: command.appliedAt } : {}),
        ...(command.contentEntryId ? { contentEntryId: uuid(command.contentEntryId, "seo_content_entry_invalid") } : {}),
        ...(command.contentVersion ? { contentVersion: command.contentVersion } : {}),
        ...actorFields(actor),
      });
    },

    createRecommendation(command: {
      title: string;
      rationale: string;
      pagePath?: string;
      queryId?: string;
      issueType: string;
      evidence: Record<string, unknown>;
      confidence: RecommendationConfidence;
      fingerprint: string;
    }, actor: Actor) {
      if (!plainObject(command.evidence)) throw new Error("seo_evidence_invalid");
      if (!recommendationConfidence.has(command.confidence)) throw new Error("seo_recommendation_confidence_invalid");
      if (!/^[0-9a-f]{64}$/u.test(command.fingerprint)) throw new Error("seo_recommendation_fingerprint_invalid");
      const actorIds = actorFields(actor);
      return repository.createRecommendation({
        title: boundedText(command.title, 300, "seo_recommendation_title_invalid"),
        rationale: boundedText(command.rationale, 5_000, "seo_recommendation_rationale_invalid"),
        issueType: boundedText(command.issueType, 120, "seo_recommendation_issue_type_invalid"),
        evidence: command.evidence,
        confidence: command.confidence,
        fingerprint: command.fingerprint,
        ...(command.pagePath ? { pagePath: normalizeSitePath(command.pagePath) } : {}),
        ...(command.queryId ? { queryId: uuid(command.queryId, "seo_query_invalid") } : {}),
        ...(actorIds.actorMcpTokenId ? { createdByMcpTokenId: actorIds.actorMcpTokenId } : {}),
      }, actor.adminUserId || actor.mcpTokenId ? actor : { operation: "legacy-service" });
    },

    reviseRecommendation(command: RecommendationRevision, actor: Actor) {
      actorFields(actor);
      return repository.reviseRecommendation(command, actor);
    },
    listRecommendationHistory(input: { recommendationId: string; pagePath?: string; limit?: number; cursor?: string | null }) {
      return repository.listRecommendationHistory({ recommendationId: uuid(input.recommendationId, "seo_recommendation_invalid"), ...(input.pagePath ? { pagePath: normalizeSitePath(input.pagePath) } : {}), ...page(input) });
    },
    updateRecommendationStatus(command: { id: string; expectedStatus: RecommendationStatus; status: RecommendationStatus }, actor: Actor) {
      actorFields(actor);
      if (!recommendationStatuses.has(command.expectedStatus) || !recommendationStatuses.has(command.status)) {
        throw new Error("seo_recommendation_status_invalid");
      }
      return repository.updateRecommendationStatus(
        uuid(command.id, "seo_recommendation_invalid"),
        command.expectedStatus,
        command.status,
        actor.adminUserId || actor.mcpTokenId ? actor : { operation: "legacy-service" },
      );
    },
  };
}

export type SeoService = ReturnType<typeof createSeoService>;
