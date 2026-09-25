import type {
  seoChanges,
  seoQueries,
  seoRecommendations,
} from "../db/schema";
import type { SeoDevice, SeoSourceId } from "./contracts";
import { normalizeSitePath } from "./normalization";
import type { SeoMetricFilters, SeoRepository } from "./repository";

type FrequencyBand = typeof seoQueries.$inferSelect.frequencyBand;
type ChangeType = typeof seoChanges.$inferSelect.type;
type RecommendationConfidence = typeof seoRecommendations.$inferSelect.confidence;
type RecommendationStatus = typeof seoRecommendations.$inferSelect.status;
type Actor = { adminUserId?: string; mcpTokenId?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sources = new Set<SeoSourceId>(["yandex_webmaster", "google_search_console"]);
const devices = new Set<SeoDevice>(["desktop", "mobile", "tablet", "all"]);
const frequencyBands = new Set<FrequencyBand>(["high", "medium", "low", "unclassified"]);
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
  if (to < from || ((to - from) / 86_400_000) + 1 > 366) throw new Error("seo_date_range_invalid");
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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Buffer.byteLength(JSON.stringify(value), "utf8") <= 16_384;
}

function boundedText(value: string, maximum: number, code: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(code);
  return normalized;
}

export function createSeoService(repository: SeoRepository) {
  return {
    getOverview(input: SeoMetricFilters) {
      return repository.getOverview(filters(input));
    },

    getDashboard(input: SeoMetricFilters) {
      return repository.getDashboard(filters(input));
    },

    listQueries(input: { filters: SeoMetricFilters; limit?: number; cursor?: string | null }) {
      return repository.listQueries(filters(input.filters), page(input));
    },

    listChanges(input: { pagePath?: string; dateFrom?: string; dateTo?: string; limit?: number; cursor?: string | null }) {
      if ((input.dateFrom ? 1 : 0) !== (input.dateTo ? 1 : 0)) throw new Error("seo_date_range_invalid");
      if (input.dateFrom && input.dateTo) filters({ dateFrom: input.dateFrom, dateTo: input.dateTo });
      return repository.listChanges({
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
      });
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
      );
    },
  };
}

export type SeoService = ReturnType<typeof createSeoService>;
