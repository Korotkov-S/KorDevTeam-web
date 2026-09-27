import { domainToASCII } from "node:url";

import {
  GEO_CITATION_CATEGORIES,
  GEO_ENTITY_STATUSES,
  GEO_PLATFORMS,
  GEO_PROMPT_CATEGORIES,
  GEO_PROMPT_STATUSES,
  GEO_RUN_MODES,
  type GeoCitationInput,
  type GeoObservationInput,
} from "./contracts";
import { normalizeCitationUrl, normalizeGeoPrompt, normalizeGeoTargetPath, normalizeResponseHash } from "./normalization";
import type {
  GeoCrawlerCheckInput,
  GeoEntityWriteInput,
  GeoFinishRunInput,
  GeoPromptCandidateInput,
  GeoPromptUpdateInput,
  GeoRepository,
  GeoStartRunInput,
  StoredGeoCitation,
} from "./repository";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const safeCodePattern = /^[a-z][a-z0-9_]{0,119}$/u;
const platforms = new Set<string>(GEO_PLATFORMS);
const modes = new Set<string>(GEO_RUN_MODES);
const categories = new Set<string>(GEO_PROMPT_CATEGORIES);
const promptStatuses = new Set<string>(GEO_PROMPT_STATUSES);
const entityStatuses = new Set<string>(GEO_ENTITY_STATUSES);
const citationCategories = new Set<string>(GEO_CITATION_CATEGORIES);
const terminalStatuses = new Set<string>(["success", "partial", "failed"]);
const sentiments = new Set<string>(["positive", "neutral", "negative", "unknown"]);
const crawlerStatuses = new Set<string>(["pass", "fail", "unavailable"]);

function uuid(value: string, code: string): string {
  if (!uuidPattern.test(value)) throw new Error(code);
  return value;
}

function boundedText(value: unknown, maximumBytes: number, code: string, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || Buffer.byteLength(value, "utf8") > maximumBytes) throw new Error(code);
  return allowEmpty ? value : normalized;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(code);
  return value as number;
}

function strictBoolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") throw new Error(code);
  return value;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, seen));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isJsonValue(entry, seen));
}

function metadata(value: unknown, maximumBytes: number, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !isJsonValue(value)) throw new Error(code);
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(code);
  }
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) throw new Error(code);
  return value as Record<string, unknown>;
}

function optionalInstant(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("geo_observation_time_invalid");
  const parsed = new Date(value);
  if (Number.isNaN(+parsed)) throw new Error("geo_observation_time_invalid");
  return parsed;
}

function uniqueStrings(values: unknown, maximumCount: number, maximumBytes: number, code: string): string[] {
  if (!Array.isArray(values) || values.length > maximumCount) throw new Error(code);
  const normalized = values.map((value) => boundedText(value, maximumBytes, code));
  if (new Set(normalized.map((value) => value.toLocaleLowerCase("ru-RU"))).size !== normalized.length) throw new Error(code);
  return normalized;
}

function normalizedDomain(value: unknown): string {
  const raw = boundedText(value, 253, "geo_entity_domain_invalid").toLocaleLowerCase("en-US").replace(/^\.+|\.+$/gu, "");
  const ascii = domainToASCII(raw);
  if (!ascii || ascii.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(ascii)) {
    throw new Error("geo_entity_domain_invalid");
  }
  return ascii;
}

function isOwnedHostname(hostname: string): boolean {
  return hostname === "kordev.team" || hostname.endsWith(".kordev.team");
}

function citation(input: GeoCitationInput): StoredGeoCitation {
  if (!citationCategories.has(input.category)) throw new Error("geo_citation_category_invalid");
  const normalized = normalizeCitationUrl(input.url);
  const isOwned = isOwnedHostname(normalized.hostname);
  if ((input.category === "owned") !== isOwned) throw new Error("geo_citation_ownership_invalid");
  const sourceOrder = boundedInteger(input.sourceOrder, 1, 1_000, "geo_citation_order_invalid");
  const title = input.title === undefined || input.title === null
    ? null
    : boundedText(input.title, 1_000, "geo_citation_title_invalid");
  return {
    ...normalized,
    title,
    sourceOrder,
    isOwned,
    category: input.category,
    localPath: isOwned ? normalizeGeoTargetPath(new URL(normalized.url).pathname) : null,
  };
}

function validateStartRun(input: GeoStartRunInput): GeoStartRunInput {
  if (!platforms.has(input.platform)) throw new Error("geo_run_platform_invalid");
  if (!modes.has(input.mode)) throw new Error("geo_run_mode_invalid");
  return {
    platform: input.platform,
    surface: boundedText(input.surface, 120, "geo_run_surface_invalid"),
    mode: input.mode,
    region: boundedText(input.region, 120, "geo_run_region_invalid"),
    language: boundedText(input.language, 16, "geo_run_language_invalid"),
    plannedCount: boundedInteger(input.plannedCount, 1, 1_000, "geo_run_planned_count_invalid"),
    promptSetFingerprint: normalizeResponseHash(input.promptSetFingerprint),
    metadata: metadata(input.metadata ?? {}, 16_384, "geo_run_metadata_invalid"),
  };
}

function validateObservation(input: GeoObservationInput) {
  const citations = (() => {
    if (!Array.isArray(input.citations) || input.citations.length > 100) throw new Error("geo_observation_citations_invalid");
    try {
      return input.citations.map(citation);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("geo_")) throw error;
      throw new Error("geo_citation_url_invalid");
    }
  })();
  if (new Set(citations.map((entry) => entry.url)).size !== citations.length) throw new Error("geo_observation_citations_invalid");
  const owned = citations.filter((entry) => entry.isOwned);
  if (input.cited && (!input.linked || owned.length === 0)) throw new Error("geo_observation_owned_citation_required");
  if (input.linked && owned.length === 0) throw new Error("geo_observation_owned_link_required");
  const sourceOrder = input.cited
    ? boundedInteger(input.sourceOrder, 1, 1_000, "geo_observation_source_order_invalid")
    : null;
  if (!input.cited && input.sourceOrder !== undefined && input.sourceOrder !== null) throw new Error("geo_observation_source_order_invalid");
  if (input.cited && !owned.some((entry) => entry.sourceOrder === sourceOrder)) throw new Error("geo_observation_owned_citation_required");

  if (!Array.isArray(input.mentions) || input.mentions.length > 100) throw new Error("geo_observation_mentions_invalid");
  const mentions = input.mentions.map((mention) => {
    if (!sentiments.has(mention.sentiment)) throw new Error("geo_mention_sentiment_invalid");
    return {
      entityId: uuid(mention.entityId, "geo_entity_invalid"),
      firstMentionOrder: boundedInteger(mention.firstMentionOrder, 1, 1_000, "geo_mention_order_invalid"),
      recommended: strictBoolean(mention.recommended, "geo_mention_recommended_invalid"),
      sentiment: mention.sentiment,
    };
  });
  if (new Set(mentions.map((entry) => entry.entityId)).size !== mentions.length) throw new Error("geo_observation_mentions_invalid");

  if (!Array.isArray(input.fanoutQueries) || input.fanoutQueries.length > 100) throw new Error("geo_observation_fanout_invalid");
  const fanoutQueries = input.fanoutQueries.map((query) => ({
    queryText: boundedText(query.queryText, 2_000, "geo_fanout_query_invalid"),
    position: boundedInteger(query.position, 1, 1_000, "geo_fanout_position_invalid"),
    source: boundedText(query.source, 120, "geo_fanout_source_invalid"),
  }));
  if (new Set(fanoutQueries.map((entry) => entry.position)).size !== fanoutQueries.length
    || new Set(fanoutQueries.map((entry) => normalizeGeoPrompt(entry.queryText))).size !== fanoutQueries.length) {
    throw new Error("geo_observation_fanout_invalid");
  }

  return {
    promptId: uuid(input.promptId, "geo_prompt_invalid"),
    repetition: boundedInteger(input.repetition, 1, 3, "geo_observation_repetition_invalid") as 1 | 2 | 3,
    ...(optionalInstant(input.observedAt) ? { observedAt: optionalInstant(input.observedAt) } : {}),
    mentioned: strictBoolean(input.mentioned, "geo_observation_flags_invalid"),
    linked: strictBoolean(input.linked, "geo_observation_flags_invalid"),
    cited: strictBoolean(input.cited, "geo_observation_flags_invalid"),
    sourceOrder,
    responseExcerpt: boundedText(input.responseExcerpt, 2_048, "geo_observation_excerpt_invalid", true),
    responseSnapshot: boundedText(input.responseSnapshot, 16_384, "geo_observation_snapshot_invalid", true),
    snapshotTruncated: strictBoolean(input.snapshotTruncated, "geo_observation_truncation_invalid"),
    responseHash: normalizeResponseHash(input.responseHash),
    modelName: input.modelName === undefined || input.modelName === null
      ? null : boundedText(input.modelName, 160, "geo_observation_model_invalid"),
    sourceCount: boundedInteger(input.sourceCount, 0, 10_000, "geo_observation_source_count_invalid"),
    sessionPersonalized: strictBoolean(input.sessionPersonalized, "geo_observation_session_invalid"),
    mentions,
    citations,
    fanoutQueries,
  };
}

export function createGeoMonitoringService(repository: GeoRepository) {
  return {
    async syncPromptCatalog(entries: Parameters<GeoRepository["syncPromptCatalog"]>[0]) {
      return repository.syncPromptCatalog(entries);
    },

    async createPromptCandidate(input: GeoPromptCandidateInput) {
      if (!categories.has(input.category)) throw new Error("geo_prompt_category_invalid");
      return repository.createPromptCandidate({
        ...input,
        promptText: boundedText(input.promptText, 2_000, "geo_prompt_text_invalid"),
        normalizedText: normalizeGeoPrompt(input.promptText),
        topicId: uuid(input.topicId, "geo_topic_invalid"),
        tags: uniqueStrings(input.tags, 20, 80, "geo_prompt_tags_invalid"),
        priority: boundedInteger(input.priority, 0, 1_000, "geo_prompt_priority_invalid"),
        language: boundedText(input.language, 16, "geo_prompt_language_invalid"),
        region: boundedText(input.region, 120, "geo_prompt_region_invalid"),
        targetPath: input.targetPath === null ? null : normalizeGeoTargetPath(input.targetPath),
        ...(input.seoQueryId ? { seoQueryId: uuid(input.seoQueryId, "geo_seo_query_invalid") } : {}),
        expectedEntityDomain: input.expectedEntityDomain ? normalizedDomain(input.expectedEntityDomain) : null,
        source: "mcp",
      });
    },

    async updatePrompt(input: GeoPromptUpdateInput) {
      if (input.status && !promptStatuses.has(input.status)) throw new Error("geo_prompt_status_invalid");
      if (input.category && !categories.has(input.category)) throw new Error("geo_prompt_category_invalid");
      return repository.updatePrompt({
        ...input,
        id: uuid(input.id, "geo_prompt_invalid"),
        ...(input.promptText ? { promptText: boundedText(input.promptText, 2_000, "geo_prompt_text_invalid"), normalizedText: normalizeGeoPrompt(input.promptText) } : {}),
        ...(input.topicId ? { topicId: uuid(input.topicId, "geo_topic_invalid") } : {}),
        ...(input.tags ? { tags: uniqueStrings(input.tags, 20, 80, "geo_prompt_tags_invalid") } : {}),
        ...(input.priority === undefined ? {} : { priority: boundedInteger(input.priority, 0, 1_000, "geo_prompt_priority_invalid") }),
        ...(input.targetPath === undefined ? {} : { targetPath: input.targetPath === null ? null : normalizeGeoTargetPath(input.targetPath) }),
      });
    },

    async updateEntity(input: GeoEntityWriteInput) {
      if (!entityStatuses.has(input.status)) throw new Error("geo_entity_status_invalid");
      if (input.type !== "owned" && input.type !== "competitor") throw new Error("geo_entity_type_invalid");
      return repository.updateEntity({
        ...(input.id ? { id: uuid(input.id, "geo_entity_invalid") } : {}),
        canonicalName: boundedText(input.canonicalName, 240, "geo_entity_name_invalid"),
        type: input.type,
        aliases: uniqueStrings(input.aliases, 50, 240, "geo_entity_aliases_invalid"),
        domains: uniqueStrings(input.domains, 50, 253, "geo_entity_domains_invalid").map(normalizedDomain),
        status: input.status,
      });
    },

    async startRun(input: GeoStartRunInput, tokenId: string) {
      return repository.startRun(validateStartRun(input), uuid(tokenId, "geo_token_invalid"));
    },

    async recordObservation(runId: string, tokenId: string, input: GeoObservationInput) {
      return repository.recordObservation(
        uuid(runId, "geo_run_invalid"),
        uuid(tokenId, "geo_token_invalid"),
        validateObservation(input),
      );
    },

    async finishRun(runId: string, tokenId: string, input: Omit<GeoFinishRunInput, "errorCode" | "metadata"> & {
      errorCode?: string | null;
      metadata?: Record<string, unknown>;
    }) {
      if (!terminalStatuses.has(input.status)) throw new Error("geo_run_status_invalid");
      const completedCount = boundedInteger(input.completedCount, 0, 1_000, "geo_run_counts_invalid");
      const storedCount = boundedInteger(input.storedCount, 0, 1_000, "geo_run_counts_invalid");
      if (storedCount > completedCount) throw new Error("geo_run_counts_invalid");
      const errorCode = input.errorCode === undefined || input.errorCode === null ? null : input.errorCode;
      if (errorCode !== null && !safeCodePattern.test(errorCode)) throw new Error("geo_run_error_code_invalid");
      return repository.finishRun(uuid(runId, "geo_run_invalid"), uuid(tokenId, "geo_token_invalid"), {
        status: input.status,
        completedCount,
        storedCount,
        errorCode,
        metadata: metadata(input.metadata ?? {}, 16_384, "geo_run_metadata_invalid"),
      });
    },

    async recordCrawlerChecks(input: readonly GeoCrawlerCheckInput[]) {
      if (!Array.isArray(input) || input.length > 100) throw new Error("geo_crawler_checks_invalid");
      return repository.recordCrawlerChecks(input.map((check) => {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(check.checkDate)) throw new Error("geo_crawler_date_invalid");
        if (!crawlerStatuses.has(check.status)) throw new Error("geo_crawler_status_invalid");
        return {
          checkDate: check.checkDate,
          target: boundedText(check.target, 500, "geo_crawler_target_invalid"),
          bot: boundedText(check.bot, 120, "geo_crawler_bot_invalid"),
          status: check.status,
          reasonCode: check.reasonCode ?? null,
          httpStatus: check.httpStatus === undefined || check.httpStatus === null
            ? null : boundedInteger(check.httpStatus, 100, 599, "geo_crawler_http_status_invalid"),
          checkedAt: check.checkedAt ?? new Date(),
          metadata: metadata(check.metadata ?? {}, 4_096, "geo_crawler_metadata_invalid"),
        };
      }));
    },
  };
}

export type GeoMonitoringService = ReturnType<typeof createGeoMonitoringService>;
