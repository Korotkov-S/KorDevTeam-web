import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  primaryKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { AcceptedResponse } from "../leads/contracts";
import type { VkAdsCheckpoint } from "../advertising/vk/contracts";
import type { IndexObservation, IndexStatus } from "../seo-monitoring/pageControl";

export const seoIndexObservations = pgTable("seo_index_observations", {
  id: uuid("id").defaultRandom().primaryKey(), contentEntryId: uuid("content_entry_id").notNull(),
  kind: text("kind").$type<IndexObservation["kind"]>().notNull(), pagePath: text("page_path").notNull(), url: text("url").notNull(),
  publishedVersion: integer("published_version").notNull(), source: text("source").$type<"yandex" | "google">().notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(), status: text("status").$type<IndexStatus>().notNull(),
  errorCode: text("error_code"), evidence: jsonb("evidence").$type<IndexObservation["evidence"]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("seo_index_observation_identity").on(table.contentEntryId, table.source, table.checkedAt),
  index("seo_index_observation_lookup").on(table.contentEntryId, table.source, table.checkedAt.desc()),
  check("seo_index_source_check", sql`${table.source} IN ('yandex', 'google')`),
  check("seo_index_status_check", sql`${table.status} IN ('indexed','unconfirmed','not_indexed','canonical_conflict','excluded','failed')`),
  check("seo_index_version_check", sql`${table.publishedVersion} > 0`),
]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});

export const contentKind = pgEnum("content_kind", ["service", "case", "article", "page", "faq"]);
export const contentStatus = pgEnum("content_status", ["draft", "published"]);
export const relationType = pgEnum("relation_type", [
  "related_case",
  "related_article",
  "related_faq",
  "related_service",
]);
export const mediaVisibility = pgEnum("media_visibility", ["public", "private"]);
export const leadDeliveryChannel = pgEnum("lead_delivery_channel", ["crm", "email"]);
export const leadDeliveryStatus = pgEnum("lead_delivery_status", [
  "pending",
  "processing",
  "retry",
  "delivered",
  "terminal",
  "manual_action",
]);
export const leadRateLimitKind = pgEnum("lead_rate_limit_kind", ["ip", "phone", "crm_token"]);
export const adminAuthLimitKind = pgEnum("admin_auth_limit_kind", ["ip", "login", "global"]);
export const seoSource = pgEnum("seo_source", ["yandex_webmaster", "google_search_console", "yandex_metrika"]);
export const seoDevice = pgEnum("seo_device", ["desktop", "mobile", "tablet", "all"]);
export const seoTrafficSlice = pgEnum("seo_traffic_slice", ["overall", "device", "region", "page"]);
export const seoFrequencyBand = pgEnum("seo_frequency_band", ["high", "medium", "low", "unclassified"]);
export const seoQueryOrigin = pgEnum("seo_query_origin", ["manual", "api", "import"]);
export const seoQueryStatus = pgEnum("seo_query_status", ["candidate", "active", "archived"]);
export const seoQueryKind = pgEnum("seo_query_kind", ["commercial", "informational", "other"]);
export const seoRunStatus = pgEnum("seo_run_status", ["running", "success", "partial", "failed"]);
export const seoRankStatus = pgEnum("seo_rank_status", ["found", "not_found"]);
export const seoRegionScope = pgEnum("seo_region_scope", ["country", "city"]);
export const seoChangeType = pgEnum("seo_change_type", [
  "content",
  "metadata",
  "structure",
  "interlinking",
  "technical",
  "other",
]);
export const seoRecommendationConfidence = pgEnum("seo_recommendation_confidence", ["low", "medium", "high"]);
export const seoRecommendationStatus = pgEnum("seo_recommendation_status", [
  "new",
  "accepted",
  "rejected",
  "implemented",
  "dismissed",
]);
export const geoPlatform = pgEnum("geo_platform", ["yandex_alice", "chatgpt_search", "google_ai", "bing_copilot"]);
export const geoRunMode = pgEnum("geo_run_mode", ["official_report", "live_ui", "api_probe"]);
export const geoRunStatus = pgEnum("geo_run_status", ["running", "success", "partial", "failed"]);
export const geoPromptCategory = pgEnum("geo_prompt_category", ["commercial", "informational", "comparison", "local", "brand"]);
export const geoPromptStatus = pgEnum("geo_prompt_status", ["candidate", "active", "archived"]);
export const geoEntityType = pgEnum("geo_entity_type", ["owned", "competitor"]);
export const geoEntityStatus = pgEnum("geo_entity_status", ["candidate", "active", "archived"]);
export const geoSentiment = pgEnum("geo_sentiment", ["positive", "neutral", "negative", "unknown"]);
export const geoCitationCategory = pgEnum("geo_citation_category", ["owned", "competitor", "media", "blog", "forum", "directory", "other"]);
export const geoCrawlerStatus = pgEnum("geo_crawler_status", ["pass", "fail", "unavailable"]);
export const geoExperimentStatus = pgEnum("geo_experiment_status", ["proposed", "approved", "active", "completed", "cancelled"]);
export const geoExperimentActionType = pgEnum("geo_experiment_action_type", [
  "content_answer",
  "first_party_evidence",
  "internal_linking",
  "technical_indexing",
  "structured_data",
  "authority_outreach",
]);
export const geoExperimentMetric = pgEnum("geo_experiment_metric", [
  "mention_rate",
  "citation_rate",
  "citation_share",
  "owned_source_coverage",
  "share_of_voice",
  "ai_referrals",
  "crawler_health",
]);
export const geoExperimentDirection = pgEnum("geo_experiment_direction", ["increase", "decrease"]);
export const geoExperimentVerdict = pgEnum("geo_experiment_verdict", ["pending", "won", "lost", "inconclusive", "cancelled"]);
export const adEvidenceGrade = pgEnum("ad_evidence_grade", ["A", "B", "C"]);
export const adResearchSourceType = pgEnum("ad_research_source_type", ["official_guide", "case_study", "public_ad", "competitor_landing", "wordstat", "product", "internal"]);
export const adChannel = pgEnum("ad_channel", ["vk", "yandex", "telegram", "web", "internal"]);
export const adHypothesisStatus = pgEnum("ad_hypothesis_status", ["candidate", "proposed", "approved", "testing", "validated", "rejected", "inconclusive", "archived"]);
export const adConversionPath = pgEnum("ad_conversion_path", ["vk_lead_form", "site", "message"]);
export const adChangedVariable = pgEnum("ad_changed_variable", ["offer", "audience", "creative_angle", "conversion_path"]);
export const adPrimaryMetric = pgEnum("ad_primary_metric", ["qualified_lead_cost", "sale_cost", "romi"]);
export const adExperimentStatus = pgEnum("ad_experiment_status", ["draft", "awaiting_approval", "approved", "creating", "moderation", "scheduled", "running", "stopping", "completed", "analyzed", "rejected_moderation", "invalid_tracking", "stopped_safety", "failed_reconciliation"]);
export const adVariantStatus = pgEnum("ad_variant_status", ["draft", "moderation", "scheduled", "running", "paused", "rejected", "completed"]);
export const adMetricGranularity = pgEnum("ad_metric_granularity", ["hour", "day"]);
export const adLeadClassification = pgEnum("ad_lead_classification", ["submitted", "contacted", "qualified", "won", "lost", "open"]);
export const adExperimentVerdict = pgEnum("ad_experiment_verdict", ["winner", "loser", "inconclusive", "invalid_tracking", "stopped_safety"]);
export const adLearningConfidence = pgEnum("ad_learning_confidence", ["low", "medium", "high"]);
export const adActorKind = pgEnum("ad_actor_kind", ["agent", "admin", "mcp", "system", "vendor"]);
export const adCommandStatus = pgEnum("ad_command_status", ["processing", "completed", "failed"]);
export const adVkSyncMode = pgEnum("ad_vk_sync_mode", ["check", "backfill", "daily"]);
export const adVkSyncStatus = pgEnum("ad_vk_sync_status", ["running", "succeeded", "partial", "failed"]);
export const adVkObjectKind = pgEnum("ad_vk_object_kind", ["campaign", "ad_group", "ad"]);
export const adVkMediaKind = pgEnum("ad_vk_media_kind", ["image", "video"]);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    login: varchar("login", { length: 120 }).notNull(),
    passwordDigest: text("password_digest").notNull(),
    passwordSalt: varchar("password_salt", { length: 128 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("admin_users_login_uq").on(table.login)],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    csrfHash: varchar("csrf_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("admin_sessions_token_hash_uq").on(table.tokenHash),
    index("admin_sessions_admin_user_id_idx").on(table.adminUserId),
    index("admin_sessions_expires_at_idx").on(table.expiresAt),
    check("admin_sessions_token_hash_sha256", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("admin_sessions_csrf_hash_sha256", sql`${table.csrfHash} ~ '^[0-9a-f]{64}$'`),
    check("admin_sessions_expires_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const adminPasswordResetRequests = pgTable(
  "admin_password_reset_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id")
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    loginHash: varchar("login_hash", { length: 64 }).notNull(),
    requestIpHash: varchar("request_ip_hash", { length: 64 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("admin_password_reset_requests_token_hash_uq").on(table.tokenHash),
    index("admin_password_reset_requests_ip_created_idx").on(table.requestIpHash, table.createdAt),
    index("admin_password_reset_requests_login_created_idx").on(table.loginHash, table.createdAt),
    index("admin_password_reset_requests_expires_at_idx").on(table.expiresAt),
    check("admin_password_reset_requests_login_hash_sha256", sql`${table.loginHash} ~ '^[0-9a-f]{64}$'`),
    check("admin_password_reset_requests_ip_hash_sha256", sql`${table.requestIpHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "admin_password_reset_requests_token_hash_sha256",
      sql`${table.tokenHash} IS NULL OR ${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("admin_password_reset_requests_expiry_valid", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "admin_password_reset_requests_token_owner_pair",
      sql`(${table.tokenHash} IS NULL) = (${table.adminUserId} IS NULL)`,
    ),
  ],
);

export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenPrefix: varchar("token_prefix", { length: 24 }).notNull(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mcp_tokens_token_hash_uq").on(table.tokenHash),
    index("mcp_tokens_admin_user_id_idx").on(table.adminUserId),
    index("mcp_tokens_active_idx").on(table.revokedAt, table.expiresAt),
    check("mcp_tokens_token_hash_sha256", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("mcp_tokens_name_nonempty", sql`length(btrim(${table.name})) > 0`),
    check("mcp_tokens_scopes_nonempty", sql`cardinality(${table.scopes}) > 0`),
    check(
      "mcp_tokens_expiry_valid",
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const adminAuthLimits = pgTable(
  "admin_auth_limits",
  {
    kind: adminAuthLimitKind("kind").notNull(),
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.subjectHash, table.windowStartedAt] }),
    index("admin_auth_limits_expires_at_idx").on(table.expiresAt),
    check("admin_auth_limits_subject_hash_sha256", sql`${table.subjectHash} ~ '^[0-9a-f]{64}$'`),
    check("admin_auth_limits_count_non_negative", sql`${table.count} >= 0`),
    check("admin_auth_limits_expires_after_window", sql`${table.expiresAt} > ${table.windowStartedAt}`),
  ],
);

export const contentEntries = pgTable(
  "content_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: contentKind("kind").notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    status: contentStatus("status").notNull().default("draft"),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    bodyMd: text("body_md").notNull().default(""),
    seoTitle: varchar("seo_title", { length: 180 }).notNull().default(""),
    seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
    manualCanonicalPath: varchar("manual_canonical_path", { length: 300 }),
    indexable: boolean("indexable").notNull().default(true),
    ogMediaId: uuid("og_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_entries_kind_slug_uq").on(table.kind, table.slug),
    check("content_entries_version_positive", sql`${table.version} > 0`),
    check("content_entries_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ],
);

export const contentRelations = pgTable(
  "content_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    type: relationType("type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_relations_source_target_type_uq").on(table.sourceId, table.targetId, table.type),
    check("content_relations_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_revisions_entry_version_uq").on(table.entryId, table.version),
    check("content_revisions_version_positive", sql`${table.version} > 0`),
  ],
);

export const contentReleaseRuns = pgTable(
  "content_release_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    releaseSha: varchar("release_sha", { length: 40 }).notNull(),
    manifestChecksum: varchar("manifest_checksum", { length: 64 }).notNull(),
    insertedCount: integer("inserted_count").notNull(),
    updatedCount: integer("updated_count").notNull(),
    unchangedCount: integer("unchanged_count").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_release_runs_sha_manifest_uq").on(table.releaseSha, table.manifestChecksum),
    check("content_release_runs_sha_format", sql`${table.releaseSha} ~ '^[0-9a-f]{40}$'`),
    check("content_release_runs_manifest_sha256", sql`${table.manifestChecksum} ~ '^[0-9a-f]{64}$'`),
    check(
      "content_release_runs_counts_non_negative",
      sql`${table.insertedCount} >= 0 AND ${table.updatedCount} >= 0 AND ${table.unchangedCount} >= 0`,
    ),
  ],
);

export const contentReleaseItems = pgTable(
  "content_release_items",
  {
    entryId: uuid("entry_id").primaryKey().references(() => contentEntries.id, { onDelete: "cascade" }),
    kind: contentKind("kind").notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    releaseId: uuid("release_id").notNull().references(() => contentReleaseRuns.id, { onDelete: "restrict" }),
    sourceChecksum: varchar("source_checksum", { length: 64 }).notNull(),
    databaseChecksum: varchar("database_checksum", { length: 64 }).notNull(),
    databaseVersion: integer("database_version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_release_items_kind_slug_uq").on(table.kind, table.slug),
    check("content_release_items_source_sha256", sql`${table.sourceChecksum} ~ '^[0-9a-f]{64}$'`),
    check("content_release_items_database_sha256", sql`${table.databaseChecksum} ~ '^[0-9a-f]{64}$'`),
    check("content_release_items_version_positive", sql`${table.databaseVersion} > 0`),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    visibility: mediaVisibility("visibility").notNull().default("private"),
    mimeType: varchar("mime_type", { length: 160 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    variants: jsonb("variants").$type<Record<string, unknown>>().notNull().default({}),
    altText: text("alt_text").notNull().default(""),
    decorative: boolean("decorative").notNull().default(false),
    processingVersion: integer("processing_version").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_uq").on(table.objectKey),
    uniqueIndex("media_assets_checksum_visibility_processing_uq").on(
      table.checksum,
      table.visibility,
      table.processingVersion,
    ),
    check("media_assets_byte_size_positive", sql`${table.byteSize} > 0`),
    check("media_assets_width_positive", sql`${table.width} IS NULL OR ${table.width} > 0`),
    check("media_assets_height_positive", sql`${table.height} IS NULL OR ${table.height} > 0`),
    check("media_assets_processing_version_positive", sql`${table.processingVersion} > 0`),
    check("media_assets_version_positive", sql`${table.version} > 0`),
  ],
);

export const contentMediaRefs = pgTable(
  "content_media_refs",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    fieldPath: varchar("field_path", { length: 300 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.mediaId, table.fieldPath] }),
    index("content_media_refs_media_id_idx").on(table.mediaId),
    check("content_media_refs_field_path_nonempty", sql`length(${table.fieldPath}) > 0`),
  ],
);

export const redirects = pgTable(
  "redirects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourcePath: varchar("source_path", { length: 300 }).notNull(),
    destinationPath: varchar("destination_path", { length: 300 }).notNull(),
    statusCode: integer("status_code").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("redirects_source_path_uq").on(table.sourcePath),
    check("redirects_status_code_valid", sql`${table.statusCode} IN (301, 410)`),
  ],
);

export const siteSettings = pgTable(
  "site_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 120 }).notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("site_settings_key_uq").on(table.key),
    check("site_settings_version_positive", sql`${table.version} > 0`),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey(),
    submissionKey: uuid("submission_key").notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    description: text("description"),
    pagePath: varchar("page_path", { length: 500 }).notNull(),
    referrer: varchar("referrer", { length: 500 }),
    utm: jsonb("utm").$type<Record<string, string>>().notNull().default({}),
    phoneHash: varchar("phone_hash", { length: 64 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }).notNull(),
    consentVersion: varchar("consent_version", { length: 120 }).notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    successResponse: jsonb("success_response").$type<AcceptedResponse>().notNull(),
  },
  (table) => [
    uniqueIndex("leads_submission_key_uq").on(table.submissionKey),
    index("leads_expires_at_idx").on(table.expiresAt),
    check("leads_request_fingerprint_sha256", sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("leads_phone_hash_sha256", sql`${table.phoneHash} ~ '^[0-9a-f]{64}$'`),
    check("leads_ip_hash_sha256", sql`${table.ipHash} ~ '^[0-9a-f]{64}$'`),
    check("leads_utm_object", sql`jsonb_typeof(${table.utm}) = 'object'`),
    check("leads_expires_after_acceptance", sql`${table.expiresAt} > ${table.acceptedAt}`),
  ],
);

export const leadAttachments = pgTable(
  "lead_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mediaType: varchar("media_type", { length: 160 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    scanMetadata: jsonb("scan_metadata").$type<Record<string, string>>().notNull().default({}),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("lead_attachments_lead_id_uq").on(table.leadId),
    uniqueIndex("lead_attachments_object_key_uq").on(table.objectKey),
    index("lead_attachments_expires_at_idx").on(table.expiresAt),
    check("lead_attachments_checksum_sha256", sql`${table.checksum} ~ '^[0-9a-f]{64}$'`),
    check("lead_attachments_byte_size_valid", sql`${table.byteSize} > 0 AND ${table.byteSize} <= 26214400`),
    check("lead_attachments_scan_metadata_object", sql`jsonb_typeof(${table.scanMetadata}) = 'object'`),
  ],
);

export const leadDeliveryJobs = pgTable(
  "lead_delivery_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: leadDeliveryChannel("channel").notNull(),
    status: leadDeliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerAttemptCount: integer("provider_attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: varchar("lease_owner", { length: 255 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 120 }),
    vendorRequestId: varchar("vendor_request_id", { length: 255 }),
    responseMetadata: jsonb("response_metadata").$type<Record<string, string>>().notNull().default({}),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lead_delivery_jobs_lead_channel_uq").on(table.leadId, table.channel),
    index("lead_delivery_jobs_due_idx").on(table.status, table.nextAttemptAt),
    index("lead_delivery_jobs_lease_expires_at_idx").on(table.leaseExpiresAt),
    check("lead_delivery_jobs_attempt_count_non_negative", sql`${table.attemptCount} >= 0`),
    check("lead_delivery_jobs_provider_attempt_count_non_negative", sql`${table.providerAttemptCount} >= 0`),
    check(
      "lead_delivery_jobs_lease_fields_paired",
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check("lead_delivery_jobs_response_metadata_object", sql`jsonb_typeof(${table.responseMetadata}) = 'object'`),
    check("lead_delivery_jobs_response_metadata_bounded", sql`octet_length(${table.responseMetadata}::text) <= 4096`),
  ],
);

export const leadRateLimits = pgTable(
  "lead_rate_limits",
  {
    kind: leadRateLimitKind("kind").notNull(),
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.subjectHash, table.windowStartedAt] }),
    index("lead_rate_limits_expires_at_idx").on(table.expiresAt),
    check("lead_rate_limits_subject_hash_sha256", sql`${table.subjectHash} ~ '^[0-9a-f]{64}$'`),
    check("lead_rate_limits_count_non_negative", sql`${table.count} >= 0`),
    check("lead_rate_limits_expires_after_window", sql`${table.expiresAt} > ${table.windowStartedAt}`),
  ],
);

export const seoSources = pgTable(
  "seo_sources",
  {
    id: seoSource("id").primaryKey(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("seo_sources_display_name_nonempty", sql`length(btrim(${table.displayName})) > 0`),
  ],
);

export const seoRegions = pgTable(
  "seo_regions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: seoSource("source")
      .notNull()
      .references(() => seoSources.id, { onDelete: "restrict" }),
    externalId: varchar("external_id", { length: 120 }),
    code: varchar("code", { length: 80 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    scope: seoRegionScope("scope").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seo_regions_source_code_uq").on(table.source, table.code),
    uniqueIndex("seo_regions_source_external_id_uq").on(table.source, table.externalId),
    unique("seo_regions_source_id_uq").on(table.source, table.id),
    index("seo_regions_active_sort_idx").on(table.active, table.sortOrder),
    check("seo_regions_code_nonempty", sql`length(btrim(${table.code})) > 0`),
    check("seo_regions_display_name_nonempty", sql`length(btrim(${table.displayName})) > 0`),
    check("seo_regions_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const seoQueries = pgTable(
  "seo_queries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queryText: text("query_text").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    targetPath: varchar("target_path", { length: 500 }),
    origin: seoQueryOrigin("origin").notNull().default("api"),
    wordstatFrequency: integer("wordstat_frequency"),
    frequencyBand: seoFrequencyBand("frequency_band").notNull().default("unclassified"),
    status: seoQueryStatus("status").notNull().default("candidate"),
    kind: seoQueryKind("kind").notNull().default("other"),
    priority: integer("priority").notNull().default(0),
    tracked: boolean("tracked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seo_queries_normalized_query_uq").on(table.normalizedQuery),
    index("seo_queries_tracked_band_idx").on(table.tracked, table.frequencyBand),
    index("seo_queries_status_priority_idx").on(table.status, table.priority),
    check("seo_queries_query_text_nonempty", sql`length(btrim(${table.queryText})) > 0`),
    check("seo_queries_normalized_query_nonempty", sql`length(btrim(${table.normalizedQuery})) > 0`),
    check("seo_queries_frequency_non_negative", sql`${table.wordstatFrequency} IS NULL OR ${table.wordstatFrequency} >= 0`),
    check("seo_queries_priority_non_negative", sql`${table.priority} >= 0`),
    check("seo_queries_status_tracked_coherent", sql`${table.tracked} = (${table.status} = 'active')`),
    check("seo_queries_target_path_valid", sql`${table.targetPath} IS NULL OR ${table.targetPath} LIKE '/%'`),
  ],
);

export const seoDailyMetrics = pgTable(
  "seo_daily_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationDate: date("observation_date", { mode: "string" }).notNull(),
    source: seoSource("source").notNull(),
    queryId: uuid("query_id")
      .notNull()
      .references(() => seoQueries.id, { onDelete: "restrict" }),
    pagePath: varchar("page_path", { length: 500 }).notNull(),
    regionId: uuid("region_id").notNull(),
    device: seoDevice("device").notNull(),
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(),
    ctr: numeric("ctr", { precision: 9, scale: 8 }).notNull(),
    averagePosition: numeric("average_position", { precision: 12, scale: 4 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seo_daily_metrics_observation_uq").on(
      table.observationDate,
      table.source,
      table.queryId,
      table.pagePath,
      table.regionId,
      table.device,
    ),
    index("seo_daily_metrics_slice_idx").on(table.observationDate, table.source, table.regionId, table.device),
    index("seo_daily_metrics_query_date_idx").on(table.queryId, table.observationDate),
    index("seo_daily_metrics_page_date_idx").on(table.pagePath, table.observationDate),
    foreignKey({
      columns: [table.source, table.regionId],
      foreignColumns: [seoRegions.source, seoRegions.id],
      name: "seo_daily_metrics_source_region_fk",
    }).onDelete("restrict"),
    check("seo_daily_metrics_page_path_valid", sql`${table.pagePath} LIKE '/%'`),
    check("seo_daily_metrics_impressions_non_negative", sql`${table.impressions} >= 0`),
    check("seo_daily_metrics_clicks_valid", sql`${table.clicks} >= 0 AND (${table.source} = 'yandex_webmaster' OR ${table.clicks} <= ${table.impressions})`),
    check("seo_daily_metrics_ctr_valid", sql`${table.ctr} >= 0 AND (${table.source} = 'yandex_webmaster' OR ${table.ctr} <= 1)`),
    check("seo_daily_metrics_position_positive", sql`${table.averagePosition} > 0`),
  ],
);

export const seoRankRuns = pgTable(
  "seo_rank_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    checkDate: date("check_date", { mode: "string" }).notNull(),
    status: seoRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    plannedCount: integer("planned_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    storedCount: integer("stored_count").notNull().default(0),
    errorCode: varchar("error_code", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("seo_rank_runs_date_started_idx").on(table.checkDate, table.startedAt),
    check("seo_rank_runs_counts_non_negative", sql`${table.plannedCount} >= 0 AND ${table.completedCount} >= 0 AND ${table.storedCount} >= 0`),
    check("seo_rank_runs_completed_after_start", sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`),
    check("seo_rank_runs_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);

export const seoRankJobs = pgTable(
  "seo_rank_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => seoRankRuns.id, { onDelete: "restrict" }),
    queryId: uuid("query_id").notNull().references(() => seoQueries.id, { onDelete: "restrict" }),
    queryText: text("query_text").notNull(),
    targetPath: text("target_path"),
    regionId: uuid("region_id").notNull()
      .references(() => seoRegions.id, { onDelete: "restrict" }),
    externalRegionId: integer("external_region_id").notNull(),
    device: seoDevice("device").notNull(),
    state: varchar("state", { length: 24 }).notNull().default("queued"),
    operationId: varchar("operation_id", { length: 200 }),
    submitAttempts: integer("submit_attempts").notNull().default(0),
    pollErrorAttempts: integer("poll_error_attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 120 }),
  },
  (t) => [
    uniqueIndex("seo_rank_jobs_matrix_uq").on(
      t.runId,
      t.queryId,
      t.regionId,
      t.device,
    ),
    index("seo_rank_jobs_due_idx").on(t.runId, t.state, t.nextAttemptAt),
    check(
      "seo_rank_jobs_state_valid",
      sql`${t.state} IN ('queued','submitting','polling','stored','retry_wait','blocked','expired')`,
    ),
    check(
      "seo_rank_jobs_counts_valid",
      sql`${t.submitAttempts} >= 0 AND ${t.pollErrorAttempts} >= 0`,
    ),
    check(
      "seo_rank_jobs_device_valid",
      sql`${t.device} IN ('desktop','mobile')`,
    ),
    check(
      "seo_rank_jobs_polling_id",
      sql`${t.state} <> 'polling' OR ${t.operationId} IS NOT NULL`,
    ),
  ],
);

export const seoRankSubmissions = pgTable(
  "seo_rank_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => seoRankJobs.id, { onDelete: "restrict" }),
    attempt: integer("attempt").notNull(),
    budgetDate: date("budget_date", { mode: "string" }).notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("seo_rank_submissions_attempt_uq").on(t.jobId, t.attempt),
    index("seo_rank_submissions_budget_idx").on(t.budgetDate),
    check("seo_rank_submissions_attempt_positive", sql`${t.attempt} > 0`),
  ],
);

export const seoTrafficMetrics = pgTable(
  "seo_traffic_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationDate: date("observation_date", { mode: "string" }).notNull(),
    source: seoSource("source")
      .notNull()
      .references(() => seoSources.id, { onDelete: "restrict" }),
    slice: seoTrafficSlice("slice").notNull(),
    dimensionKey: varchar("dimension_key", { length: 500 }).notNull(),
    dimensionLabel: varchar("dimension_label", { length: 500 }).notNull(),
    pagePath: varchar("page_path", { length: 500 }),
    users: integer("users").notNull(),
    newUsers: integer("new_users").notNull(),
    visits: integer("visits").notNull(),
    pageviews: integer("pageviews").notNull(),
    bounceRate: numeric("bounce_rate", { precision: 9, scale: 8 }).notNull(),
    pageDepth: numeric("page_depth", { precision: 12, scale: 4 }).notNull(),
    avgVisitDurationSeconds: numeric("avg_visit_duration_seconds", { precision: 12, scale: 3 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seo_traffic_metrics_observation_uq").on(
      table.observationDate,
      table.source,
      table.slice,
      table.dimensionKey,
    ),
    index("seo_traffic_metrics_slice_date_idx").on(table.slice, table.observationDate),
    index("seo_traffic_metrics_page_date_idx").on(table.pagePath, table.observationDate),
    check("seo_traffic_metrics_source_metrika", sql`${table.source} = 'yandex_metrika'`),
    check("seo_traffic_metrics_dimension_key_nonempty", sql`length(btrim(${table.dimensionKey})) > 0`),
    check("seo_traffic_metrics_dimension_label_nonempty", sql`length(btrim(${table.dimensionLabel})) > 0`),
    check("seo_traffic_metrics_counts_non_negative", sql`${table.users} >= 0 AND ${table.newUsers} >= 0 AND ${table.visits} >= 0 AND ${table.pageviews} >= 0`),
    check("seo_traffic_metrics_new_users_valid", sql`${table.newUsers} <= ${table.users}`),
    check("seo_traffic_metrics_visits_valid", sql`${table.visits} >= ${table.users}`),
    check("seo_traffic_metrics_pageviews_valid", sql`${table.pageviews} >= ${table.visits}`),
    check("seo_traffic_metrics_bounce_rate_valid", sql`${table.bounceRate} >= 0 AND ${table.bounceRate} <= 1`),
    check("seo_traffic_metrics_depth_valid", sql`${table.pageDepth} >= 0`),
    check("seo_traffic_metrics_duration_valid", sql`${table.avgVisitDurationSeconds} >= 0`),
    check("seo_traffic_metrics_page_coherent", sql`(${table.slice} = 'page' AND ${table.pagePath} IS NOT NULL AND ${table.pagePath} = ${table.dimensionKey}) OR (${table.slice} <> 'page' AND ${table.pagePath} IS NULL)`),
    check("seo_traffic_metrics_page_path_valid", sql`${table.pagePath} IS NULL OR ${table.pagePath} LIKE '/%'`),
  ],
);

export const seoRankChecks = pgTable(
  "seo_rank_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    checkDate: date("check_date", { mode: "string" }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    queryId: uuid("query_id").notNull().references(() => seoQueries.id, { onDelete: "restrict" }),
    regionId: uuid("region_id").notNull(),
    device: seoDevice("device").notNull(),
    status: seoRankStatus("status").notNull(),
    position: integer("position"),
    resultUrl: text("result_url"),
    resultLimit: integer("result_limit").notNull().default(100),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seo_rank_checks_daily_uq").on(table.checkDate, table.queryId, table.regionId, table.device),
    index("seo_rank_checks_query_date_idx").on(table.queryId, table.checkDate),
    index("seo_rank_checks_slice_idx").on(table.checkDate, table.regionId, table.device),
    foreignKey({
      columns: [table.regionId],
      foreignColumns: [seoRegions.id],
      name: "seo_rank_checks_region_fk",
    }).onDelete("restrict"),
    check("seo_rank_checks_device_supported", sql`${table.device} IN ('desktop', 'mobile')`),
    check("seo_rank_checks_position_range", sql`${table.position} IS NULL OR (${table.position} >= 1 AND ${table.position} <= ${table.resultLimit})`),
    check("seo_rank_checks_limit_range", sql`${table.resultLimit} >= 1 AND ${table.resultLimit} <= 100`),
    check("seo_rank_checks_result_coherent", sql`(${table.status} = 'found' AND ${table.position} IS NOT NULL AND ${table.resultUrl} IS NOT NULL) OR (${table.status} = 'not_found' AND ${table.position} IS NULL AND ${table.resultUrl} IS NULL)`),
    check(
      "seo_rank_checks_result_url_http",
      sql`${table.resultUrl} IS NULL OR ${table.resultUrl} ~ '^https?://'`,
    ),
  ],
);

export const seoCollectionRuns = pgTable(
  "seo_collection_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: seoSource("source")
      .notNull()
      .references(() => seoSources.id, { onDelete: "restrict" }),
    requestedFrom: date("requested_from", { mode: "string" }).notNull(),
    requestedTo: date("requested_to", { mode: "string" }).notNull(),
    status: seoRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    receivedCount: integer("received_count").notNull().default(0),
    storedCount: integer("stored_count").notNull().default(0),
    errorCode: varchar("error_code", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index("seo_collection_runs_source_started_idx").on(table.source, table.startedAt),
    check("seo_collection_runs_date_range_valid", sql`${table.requestedTo} >= ${table.requestedFrom}`),
    check("seo_collection_runs_counts_non_negative", sql`${table.receivedCount} >= 0 AND ${table.storedCount} >= 0`),
    check("seo_collection_runs_completed_after_start", sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`),
    check("seo_collection_runs_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);

export const seoChanges = pgTable(
  "seo_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pagePath: varchar("page_path", { length: 500 }).notNull(),
    summary: text("summary").notNull(),
    type: seoChangeType("type").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    contentEntryId: uuid("content_entry_id").references(() => contentEntries.id, { onDelete: "set null" }),
    contentVersion: integer("content_version"),
    actorAdminUserId: uuid("actor_admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    actorMcpTokenId: uuid("actor_mcp_token_id").references(() => mcpTokens.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("seo_changes_page_applied_idx").on(table.pagePath, table.appliedAt),
    check("seo_changes_page_path_valid", sql`${table.pagePath} LIKE '/%'`),
    check("seo_changes_summary_nonempty", sql`length(btrim(${table.summary})) > 0`),
    check("seo_changes_content_version_positive", sql`${table.contentVersion} IS NULL OR ${table.contentVersion} > 0`),
  ],
);

export const seoChangeEvaluations = pgTable("seo_change_evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  changeId: uuid("change_id").notNull().references(() => seoChanges.id, { onDelete: "restrict" }),
  source: varchar("source", { length: 40 }).notNull(),
  checkpoint: integer("checkpoint").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
  result: jsonb("result").$type<import("../seo-monitoring/effects").EffectResult>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("seo_change_evaluations_evidence_uq").on(t.changeId, t.source, t.checkpoint, t.evidenceHash),
  index("seo_change_evaluations_lookup_idx").on(t.changeId, t.source, t.checkpoint, t.evaluatedAt),
  check("seo_change_evaluations_source_valid", sql`${t.source} IN ('yandex_webmaster','google_search_console')`),
  check("seo_change_evaluations_checkpoint_valid", sql`${t.checkpoint} IN (7,14,28)`),
  check("seo_change_evaluations_hash_valid", sql`${t.evidenceHash} ~ '^[0-9a-f]{64}$'`),
  check("seo_change_evaluations_result_object", sql`jsonb_typeof(${t.result})='object'`),
]);

export const seoRecommendations = pgTable(
  "seo_recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    pagePath: varchar("page_path", { length: 500 }),
    queryId: uuid("query_id").references(() => seoQueries.id, { onDelete: "set null" }),
    issueType: varchar("issue_type", { length: 120 }).notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    confidence: seoRecommendationConfidence("confidence").notNull(),
    status: seoRecommendationStatus("status").notNull().default("new"),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    createdByMcpTokenId: uuid("created_by_mcp_token_id").references(() => mcpTokens.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("seo_recommendations_status_created_idx").on(table.status, table.createdAt),
    index("seo_recommendations_fingerprint_idx").on(table.fingerprint),
    check("seo_recommendations_title_nonempty", sql`length(btrim(${table.title})) > 0`),
    check("seo_recommendations_rationale_nonempty", sql`length(btrim(${table.rationale})) > 0`),
    check("seo_recommendations_issue_type_nonempty", sql`length(btrim(${table.issueType})) > 0`),
    check("seo_recommendations_page_path_valid", sql`${table.pagePath} IS NULL OR ${table.pagePath} LIKE '/%'`),
    check("seo_recommendations_evidence_object", sql`jsonb_typeof(${table.evidence}) = 'object'`),
    check("seo_recommendations_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const seoRecommendationHistory = pgTable("seo_recommendation_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  recommendationId: uuid("recommendation_id").notNull().references(() => seoRecommendations.id, { onDelete: "restrict" }),
  eventType: varchar("event_type", { length: 20 }).notNull(),
  beforeSnapshot: jsonb("before_snapshot").$type<Record<string, unknown> | null>(),
  afterSnapshot: jsonb("after_snapshot").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  actor: jsonb("actor").$type<Record<string, string>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("seo_recommendation_history_lookup_idx").on(table.recommendationId, table.createdAt),
  check("seo_recommendation_history_type_valid", sql`${table.eventType} IN ('created','refreshed','revised','status')`),
  check("seo_recommendation_history_reason_valid", sql`length(btrim(${table.reason})) > 0`),
  check("seo_recommendation_history_snapshots_valid", sql`(${table.beforeSnapshot} IS NULL OR jsonb_typeof(${table.beforeSnapshot})='object') AND jsonb_typeof(${table.afterSnapshot})='object' AND jsonb_typeof(${table.actor})='object'`),
]);

export const geoTopics = pgTable(
  "geo_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    serviceKey: varchar("service_key", { length: 160 }),
    targetPath: varchar("target_path", { length: 500 }),
    priority: integer("priority").notNull().default(0),
    status: geoPromptStatus("status").notNull().default("candidate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("geo_topics_slug_uq").on(table.slug),
    index("geo_topics_status_priority_idx").on(table.status, table.priority),
    check("geo_topics_name_nonempty", sql`length(btrim(${table.name})) > 0`),
    check("geo_topics_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("geo_topics_target_path_valid", sql`${table.targetPath} IS NULL OR ${table.targetPath} LIKE '/%'`),
    check("geo_topics_priority_non_negative", sql`${table.priority} >= 0`),
  ],
);

export const geoEntities = pgTable(
  "geo_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalName: varchar("canonical_name", { length: 240 }).notNull(),
    type: geoEntityType("type").notNull(),
    aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
    domains: text("domains").array().notNull().default(sql`ARRAY[]::text[]`),
    status: geoEntityStatus("status").notNull().default("candidate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("geo_entities_canonical_name_uq").on(table.canonicalName),
    index("geo_entities_type_status_idx").on(table.type, table.status),
    check("geo_entities_name_nonempty", sql`length(btrim(${table.canonicalName})) > 0`),
    check("geo_entities_aliases_bounded", sql`cardinality(${table.aliases}) <= 50`),
    check("geo_entities_domains_bounded", sql`cardinality(${table.domains}) <= 50`),
  ],
);

export const geoPrompts = pgTable(
  "geo_prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promptText: text("prompt_text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    topicId: uuid("topic_id").notNull().references(() => geoTopics.id, { onDelete: "restrict" }),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    category: geoPromptCategory("category").notNull(),
    status: geoPromptStatus("status").notNull().default("candidate"),
    priority: integer("priority").notNull().default(0),
    language: varchar("language", { length: 16 }).notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    targetPath: varchar("target_path", { length: 500 }),
    seoQueryId: uuid("seo_query_id").references(() => seoQueries.id, { onDelete: "set null" }),
    expectedEntityDomain: varchar("expected_entity_domain", { length: 253 }),
    source: varchar("source", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("geo_prompts_normalized_language_region_uq").on(table.normalizedText, table.language, table.region),
    index("geo_prompts_status_priority_idx").on(table.status, table.priority),
    index("geo_prompts_topic_status_idx").on(table.topicId, table.status),
    index("geo_prompts_seo_query_idx").on(table.seoQueryId),
    check("geo_prompts_text_nonempty", sql`length(btrim(${table.promptText})) > 0`),
    check("geo_prompts_text_bounded", sql`char_length(${table.promptText}) <= 2000`),
    check("geo_prompts_normalized_nonempty", sql`length(btrim(${table.normalizedText})) > 0`),
    check("geo_prompts_tags_bounded", sql`cardinality(${table.tags}) <= 20`),
    check("geo_prompts_priority_non_negative", sql`${table.priority} >= 0`),
    check("geo_prompts_language_nonempty", sql`length(btrim(${table.language})) > 0`),
    check("geo_prompts_region_nonempty", sql`length(btrim(${table.region})) > 0`),
    check("geo_prompts_target_path_valid", sql`${table.targetPath} IS NULL OR ${table.targetPath} LIKE '/%'`),
    check("geo_prompts_source_nonempty", sql`length(btrim(${table.source})) > 0`),
  ],
);

export const geoRuns = pgTable(
  "geo_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platform: geoPlatform("platform").notNull(),
    surface: varchar("surface", { length: 120 }).notNull(),
    mode: geoRunMode("mode").notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    language: varchar("language", { length: 16 }).notNull(),
    status: geoRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    promptIds: uuid("prompt_ids").array().notNull(),
    plannedCount: integer("planned_count").notNull(),
    completedCount: integer("completed_count").notNull().default(0),
    storedCount: integer("stored_count").notNull().default(0),
    errorCode: varchar("error_code", { length: 120 }),
    initiatedByMcpTokenId: uuid("initiated_by_mcp_token_id").references(() => mcpTokens.id, { onDelete: "set null" }),
    promptSetFingerprint: varchar("prompt_set_fingerprint", { length: 64 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    collectionManaged: boolean("collection_managed").notNull().default(false),
    sessionPersonalized: boolean("session_personalized"),
    previousRunId: uuid("previous_run_id"),
  },
  (table) => [
    index("geo_runs_period_platform_mode_idx").on(table.startedAt, table.platform, table.mode),
    index("geo_runs_principal_status_idx").on(table.initiatedByMcpTokenId, table.status),
    check("geo_runs_surface_nonempty", sql`length(btrim(${table.surface})) > 0`),
    check("geo_runs_region_nonempty", sql`length(btrim(${table.region})) > 0`),
    check("geo_runs_language_nonempty", sql`length(btrim(${table.language})) > 0`),
    check("geo_runs_prompt_ids_bounded", sql`${table.status} = 'failed' OR cardinality(${table.promptIds}) BETWEEN 1 AND 333`),
    check("geo_runs_plan_matches_prompts", sql`${table.plannedCount} = cardinality(${table.promptIds}) * 3`),
    check("geo_runs_counts_non_negative", sql`${table.plannedCount} >= 0 AND ${table.completedCount} >= 0 AND ${table.storedCount} >= 0`),
    check("geo_runs_counts_bounded", sql`${table.completedCount} <= ${table.plannedCount} AND ${table.storedCount} <= ${table.completedCount}`),
    check("geo_runs_completed_after_start", sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`),
    check("geo_runs_prompt_set_sha256", sql`${table.promptSetFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("geo_runs_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("geo_runs_metadata_bounded", sql`octet_length(${table.metadata}::text) <= 16384`),
  ],
);

export const geoCoverageCycles = pgTable("geo_coverage_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  promptIds: uuid("prompt_ids").array().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
export const geoCollectionLeases = pgTable(
  "geo_collection_leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => geoRuns.id, { onDelete: "restrict" }),
    tokenId: uuid("token_id").references(() => mcpTokens.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [index("geo_collection_leases_run_idx").on(t.runId)],
);
export const geoCollectionJobs = pgTable(
  "geo_collection_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => geoCoverageCycles.id, { onDelete: "restrict" }),
    promptId: uuid("prompt_id").notNull().references(() => geoPrompts.id, { onDelete: "restrict" }),
    promptText: text("prompt_text").notNull(),
    platform: geoPlatform("platform").notNull(),
    surface: varchar("surface", { length: 120 }).notNull(),
    mode: geoRunMode("mode").notNull().default("live_ui"),
    language: varchar("language", { length: 16 }).notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    state: varchar("state", { length: 24 }).notNull().default("queued"),
    runId: uuid("run_id").references(() => geoRuns.id, { onDelete: "restrict" }),
    leaseId: uuid("lease_id").references(() => geoCollectionLeases.id, { onDelete: "restrict" }),
    completedRepetitions: integer("completed_repetitions").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 120 }),
  },
  (t) => [
    uniqueIndex("geo_collection_jobs_key_uq").on(
      t.cycleId,
      t.platform,
      t.surface,
      t.mode,
      t.language,
      t.region,
      t.promptId,
    ),
    index("geo_collection_jobs_due_idx").on(t.state, t.nextAttemptAt),
    check(
      "geo_collection_jobs_state_valid",
      sql`${t.state} IN ('queued','running','retry_wait','blocked','complete','cancelled')`,
    ),
    check(
      "geo_collection_jobs_counts_valid",
      sql`${t.completedRepetitions} BETWEEN 0 AND 3 AND ${t.attempts} >= 0`,
    ),
  ],
);
export const geoCollectionAttempts = pgTable(
  "geo_collection_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => geoRuns.id, { onDelete: "restrict" }),
    promptId: uuid("prompt_id").notNull().references(() => geoPrompts.id, { onDelete: "restrict" }),
    repetition: integer("repetition").notNull(),
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => geoCollectionLeases.id, { onDelete: "restrict" }),
    tokenId: uuid("token_id").references(() => mcpTokens.id, { onDelete: "set null" }),
    budgetDate: date("budget_date", { mode: "string" }).notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    observationId: uuid("observation_id"),
  },
  (t) => [
    index("geo_collection_attempts_budget_idx").on(t.budgetDate),
    check(
      "geo_collection_attempts_repetition_valid",
      sql`${t.repetition} BETWEEN 1 AND 3`,
    ),
  ],
);

export const geoObservations = pgTable(
  "geo_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => geoRuns.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id").notNull().references(() => geoPrompts.id, { onDelete: "restrict" }),
    repetition: integer("repetition").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    mentioned: boolean("mentioned").notNull(),
    linked: boolean("linked").notNull(),
    cited: boolean("cited").notNull(),
    sourceOrder: integer("source_order"),
    responseExcerpt: text("response_excerpt").notNull().default(""),
    responseSnapshot: text("response_snapshot").notNull().default(""),
    snapshotTruncated: boolean("snapshot_truncated").notNull().default(false),
    responseHash: varchar("response_hash", { length: 64 }).notNull(),
    modelName: varchar("model_name", { length: 160 }),
    sourceCount: integer("source_count").notNull().default(0),
    sessionPersonalized: boolean("session_personalized").notNull().default(false),
  },
  (table) => [
    uniqueIndex("geo_observations_run_prompt_repetition_uq").on(table.runId, table.promptId, table.repetition),
    index("geo_observations_prompt_observed_idx").on(table.promptId, table.observedAt),
    index("geo_observations_run_idx").on(table.runId),
    check("geo_observations_repetition_range", sql`${table.repetition} BETWEEN 1 AND 3`),
    check("geo_observations_flags_coherent", sql`NOT ${table.cited} OR ${table.linked}`),
    check("geo_observations_source_order_coherent", sql`(${table.cited} AND ${table.sourceOrder} IS NOT NULL AND ${table.sourceOrder} > 0) OR (NOT ${table.cited} AND ${table.sourceOrder} IS NULL)`),
    check("geo_observations_excerpt_bounded", sql`octet_length(${table.responseExcerpt}) <= 2048`),
    check("geo_observations_snapshot_bounded", sql`octet_length(${table.responseSnapshot}) <= 16384`),
    check("geo_observations_response_sha256", sql`${table.responseHash} ~ '^[0-9a-f]{64}$'`),
    check("geo_observations_source_count_non_negative", sql`${table.sourceCount} >= 0`),
  ],
);

export const geoObservationMentions = pgTable(
  "geo_observation_mentions",
  {
    observationId: uuid("observation_id").notNull().references(() => geoObservations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull().references(() => geoEntities.id, { onDelete: "restrict" }),
    firstMentionOrder: integer("first_mention_order").notNull(),
    recommended: boolean("recommended").notNull().default(false),
    sentiment: geoSentiment("sentiment").notNull().default("unknown"),
  },
  (table) => [
    primaryKey({ columns: [table.observationId, table.entityId] }),
    index("geo_observation_mentions_entity_observation_idx").on(table.entityId, table.observationId),
    check("geo_observation_mentions_order_positive", sql`${table.firstMentionOrder} > 0`),
  ],
);

export const geoCitations = pgTable(
  "geo_citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id").notNull().references(() => geoObservations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    title: text("title"),
    sourceOrder: integer("source_order").notNull(),
    isOwned: boolean("is_owned").notNull().default(false),
    category: geoCitationCategory("category").notNull(),
    localPath: varchar("local_path", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("geo_citations_observation_url_uq").on(table.observationId, table.url),
    index("geo_citations_hostname_path_idx").on(table.hostname, table.localPath),
    index("geo_citations_observation_order_idx").on(table.observationId, table.sourceOrder),
    check("geo_citations_url_http", sql`${table.url} ~ '^https?://'`),
    check("geo_citations_url_bounded", sql`char_length(${table.url}) <= 2000`),
    check("geo_citations_hostname_nonempty", sql`length(btrim(${table.hostname})) > 0`),
    check("geo_citations_order_positive", sql`${table.sourceOrder} > 0`),
    check("geo_citations_owned_coherent", sql`(${table.isOwned} AND ${table.category} = 'owned' AND ${table.localPath} LIKE '/%') OR (NOT ${table.isOwned} AND ${table.category} <> 'owned' AND ${table.localPath} IS NULL)`),
  ],
);

export const geoFanoutQueries = pgTable(
  "geo_fanout_queries",
  {
    observationId: uuid("observation_id").notNull().references(() => geoObservations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    queryText: text("query_text").notNull(),
    source: varchar("source", { length: 120 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.observationId, table.position] }),
    uniqueIndex("geo_fanout_queries_observation_text_uq").on(table.observationId, table.queryText),
    check("geo_fanout_queries_position_positive", sql`${table.position} > 0`),
    check("geo_fanout_queries_text_nonempty", sql`length(btrim(${table.queryText})) > 0`),
    check("geo_fanout_queries_text_bounded", sql`char_length(${table.queryText}) <= 2000`),
    check("geo_fanout_queries_source_nonempty", sql`length(btrim(${table.source})) > 0`),
  ],
);

export const geoReferralDailyMetrics = pgTable(
  "geo_referral_daily_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationDate: date("observation_date", { mode: "string" }).notNull(),
    platform: geoPlatform("platform").notNull(),
    users: integer("users").notNull(),
    newUsers: integer("new_users").notNull(),
    visits: integer("visits").notNull(),
    pageviews: integer("pageviews").notNull(),
    landingPath: varchar("landing_path", { length: 500 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("geo_referral_daily_metrics_date_platform_path_uq").on(table.observationDate, table.platform, table.landingPath),
    index("geo_referral_daily_metrics_date_platform_idx").on(table.observationDate, table.platform),
    check("geo_referral_daily_metrics_counts_non_negative", sql`${table.users} >= 0 AND ${table.newUsers} >= 0 AND ${table.visits} >= 0 AND ${table.pageviews} >= 0`),
    check("geo_referral_daily_metrics_counts_coherent", sql`${table.newUsers} <= ${table.users} AND ${table.users} <= ${table.visits} AND ${table.visits} <= ${table.pageviews}`),
    check("geo_referral_daily_metrics_path_valid", sql`${table.landingPath} LIKE '/%'`),
  ],
);

export const geoCrawlerChecks = pgTable(
  "geo_crawler_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    checkDate: date("check_date", { mode: "string" }).notNull(),
    target: varchar("target", { length: 500 }).notNull(),
    bot: varchar("bot", { length: 120 }).notNull(),
    status: geoCrawlerStatus("status").notNull(),
    reasonCode: varchar("reason_code", { length: 120 }),
    httpStatus: integer("http_status"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("geo_crawler_checks_date_target_bot_uq").on(table.checkDate, table.target, table.bot),
    index("geo_crawler_checks_date_target_idx").on(table.checkDate, table.target),
    check("geo_crawler_checks_target_nonempty", sql`length(btrim(${table.target})) > 0`),
    check("geo_crawler_checks_bot_nonempty", sql`length(btrim(${table.bot})) > 0`),
    check("geo_crawler_checks_http_status_valid", sql`${table.httpStatus} IS NULL OR ${table.httpStatus} BETWEEN 100 AND 599`),
    check("geo_crawler_checks_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("geo_crawler_checks_metadata_bounded", sql`octet_length(${table.metadata}::text) <= 4096`),
  ],
);

export const geoExperiments = pgTable(
  "geo_experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recommendationId: uuid("recommendation_id").notNull().references(() => seoRecommendations.id, { onDelete: "restrict" }),
    pagePath: varchar("page_path", { length: 500 }).notNull(),
    actionType: geoExperimentActionType("action_type").notNull(),
    hypothesis: text("hypothesis").notNull(),
    platform: geoPlatform("platform").notNull(),
    mode: geoRunMode("mode").notNull(),
    language: varchar("language", { length: 16 }).notNull(),
    region: varchar("region", { length: 120 }).notNull(),
    promptSetFingerprint: varchar("prompt_set_fingerprint", { length: 64 }).notNull(),
    primaryMetric: geoExperimentMetric("primary_metric").notNull(),
    direction: geoExperimentDirection("direction").notNull(),
    minimumDelta: numeric("minimum_delta", { precision: 12, scale: 6 }).notNull(),
    evaluationWindows: integer("evaluation_windows").array().notNull().default(sql`ARRAY[7,14,28]::integer[]`),
    expectedSignal: text("expected_signal").notNull(),
    status: geoExperimentStatus("status").notNull().default("proposed"),
    baseline: jsonb("baseline").$type<Record<string, unknown>>().notNull().default({}),
    evaluationResults: jsonb("evaluation_results").$type<Record<string, unknown>>().notNull().default({}),
    verdict: geoExperimentVerdict("verdict").notNull().default("pending"),
    seoChangeId: uuid("seo_change_id").references(() => seoChanges.id, { onDelete: "restrict" }),
    implementedAt: timestamp("implemented_at", { withTimezone: true }),
    createdByMcpTokenId: uuid("created_by_mcp_token_id").references(() => mcpTokens.id, { onDelete: "set null" }),
    approvedByAdminUserId: uuid("approved_by_admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("geo_experiments_status_created_idx").on(table.status, table.createdAt),
    index("geo_experiments_page_platform_idx").on(table.pagePath, table.platform),
    uniqueIndex("geo_experiments_one_active_page_set_uq")
      .on(table.pagePath, table.promptSetFingerprint)
      .where(sql`${table.status} = 'active'`),
    check("geo_experiments_page_path_valid", sql`${table.pagePath} LIKE '/%'`),
    check("geo_experiments_hypothesis_nonempty", sql`length(btrim(${table.hypothesis})) > 0`),
    check("geo_experiments_prompt_set_sha256", sql`${table.promptSetFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("geo_experiments_minimum_delta_positive", sql`${table.minimumDelta} > 0`),
    check("geo_experiments_windows_exact", sql`${table.evaluationWindows} = ARRAY[7,14,28]::integer[]`),
    check("geo_experiments_expected_signal_nonempty", sql`length(btrim(${table.expectedSignal})) > 0`),
    check("geo_experiments_baseline_object", sql`jsonb_typeof(${table.baseline}) = 'object'`),
    check("geo_experiments_evaluations_object", sql`jsonb_typeof(${table.evaluationResults}) = 'object'`),
    check("geo_experiments_implementation_coherent", sql`(${table.seoChangeId} IS NULL AND ${table.implementedAt} IS NULL) OR (${table.seoChangeId} IS NOT NULL AND ${table.implementedAt} IS NOT NULL)`),
  ],
);

export const geoExperimentPrompts = pgTable(
  "geo_experiment_prompts",
  {
    experimentId: uuid("experiment_id").notNull().references(() => geoExperiments.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id").notNull().references(() => geoPrompts.id, { onDelete: "restrict" }),
    promptTextSnapshot: text("prompt_text_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.experimentId, table.promptId] }),
    index("geo_experiment_prompts_prompt_idx").on(table.promptId),
    check("geo_experiment_prompts_snapshot_nonempty", sql`length(btrim(${table.promptTextSnapshot})) > 0`),
    check("geo_experiment_prompts_snapshot_bounded", sql`char_length(${table.promptTextSnapshot}) <= 2000`),
  ],
);

export const adResearchSources = pgTable(
  "ad_research_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    url: text("url").notNull(),
    publisher: varchar("publisher", { length: 240 }).notNull(),
    sourceType: adResearchSourceType("source_type").notNull(),
    channel: adChannel("channel").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    evidenceGrade: adEvidenceGrade("evidence_grade").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_research_sources_fingerprint_uq").on(table.fingerprint),
    index("ad_research_sources_channel_discovered_idx").on(table.channel, table.discoveredAt),
    check("ad_research_sources_url_nonempty", sql`length(btrim(${table.url})) > 0`),
    check("ad_research_sources_publisher_nonempty", sql`length(btrim(${table.publisher})) > 0`),
    check("ad_research_sources_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_research_sources_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("ad_research_sources_metadata_bounded", sql`octet_length(${table.metadata}::text) <= 16384`),
  ],
);

export const adMarketSignals = pgTable(
  "ad_market_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id").notNull().references(() => adResearchSources.id, { onDelete: "restrict" }),
    hook: text("hook").notNull(),
    offer: text("offer").notNull(),
    proof: text("proof").notNull(),
    format: varchar("format", { length: 160 }).notNull(),
    cta: text("cta").notNull(),
    audience: text("audience").notNull(),
    landingUrl: text("landing_url"),
    disclosedMetrics: jsonb("disclosed_metrics").$type<Record<string, unknown>>().notNull().default({}),
    applicability: text("applicability").notNull(),
    evidenceGrade: adEvidenceGrade("evidence_grade").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_market_signals_fingerprint_uq").on(table.fingerprint),
    index("ad_market_signals_source_created_idx").on(table.sourceId, table.createdAt),
    check("ad_market_signals_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_market_signals_text_nonempty", sql`length(btrim(${table.hook})) > 0 AND length(btrim(${table.offer})) > 0 AND length(btrim(${table.proof})) > 0 AND length(btrim(${table.format})) > 0 AND length(btrim(${table.cta})) > 0 AND length(btrim(${table.audience})) > 0 AND length(btrim(${table.applicability})) > 0`),
    check("ad_market_signals_metrics_object", sql`jsonb_typeof(${table.disclosedMetrics}) = 'object'`),
    check("ad_market_signals_metrics_bounded", sql`octet_length(${table.disclosedMetrics}::text) <= 16384`),
  ],
);

export const adHypotheses = pgTable(
  "ad_hypotheses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    service: text("service").notNull(),
    problem: text("problem").notNull(),
    audience: text("audience").notNull(),
    offer: text("offer").notNull(),
    proof: text("proof").notNull(),
    creativeAngle: text("creative_angle").notNull(),
    conversionPath: adConversionPath("conversion_path").notNull(),
    changedVariable: adChangedVariable("changed_variable").notNull(),
    controls: jsonb("controls").$type<Record<string, unknown>>().notNull().default({}),
    primaryMetric: adPrimaryMetric("primary_metric").notNull(),
    guardMetrics: jsonb("guard_metrics").$type<Record<string, unknown>>().notNull().default({}),
    expectedEffect: text("expected_effect").notNull(),
    minimumData: jsonb("minimum_data").$type<Record<string, unknown>>().notNull().default({}),
    dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }).notNull(),
    totalBudget: numeric("total_budget", { precision: 14, scale: 2 }).notNull(),
    durationDays: integer("duration_days").notNull(),
    stopConditions: jsonb("stop_conditions").$type<Record<string, unknown>>().notNull().default({}),
    impact: integer("impact").notNull(),
    confidence: integer("confidence").notNull(),
    ease: integer("ease").notNull(),
    evidenceQuality: integer("evidence_quality").notNull(),
    rationale: text("rationale").notNull(),
    sourceSignalIds: uuid("source_signal_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    status: adHypothesisStatus("status").notNull().default("candidate"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ad_hypotheses_status_created_idx").on(table.status, table.createdAt),
    check("ad_hypotheses_text_nonempty", sql`length(btrim(${table.service})) > 0 AND length(btrim(${table.problem})) > 0 AND length(btrim(${table.audience})) > 0 AND length(btrim(${table.offer})) > 0 AND length(btrim(${table.proof})) > 0 AND length(btrim(${table.creativeAngle})) > 0 AND length(btrim(${table.expectedEffect})) > 0 AND length(btrim(${table.rationale})) > 0`),
    check("ad_hypotheses_json_objects", sql`jsonb_typeof(${table.controls}) = 'object' AND jsonb_typeof(${table.guardMetrics}) = 'object' AND jsonb_typeof(${table.minimumData}) = 'object' AND jsonb_typeof(${table.stopConditions}) = 'object'`),
    check("ad_hypotheses_budgets_nonnegative", sql`${table.dailyBudget} >= 0 AND ${table.totalBudget} >= 0`),
    check("ad_hypotheses_duration_positive", sql`${table.durationDays} > 0`),
    check("ad_hypotheses_scores_bounded", sql`${table.impact} BETWEEN 1 AND 5 AND ${table.confidence} BETWEEN 1 AND 5 AND ${table.ease} BETWEEN 1 AND 5 AND ${table.evidenceQuality} BETWEEN 1 AND 5`),
    check("ad_hypotheses_version_positive", sql`${table.version} > 0`),
  ],
);

export const adExperiments = pgTable(
  "ad_experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hypothesisId: uuid("hypothesis_id").notNull().references(() => adHypotheses.id, { onDelete: "restrict" }),
    hypothesisVersion: integer("hypothesis_version").notNull(),
    passport: jsonb("passport").$type<Record<string, unknown>>().notNull(),
    passportFingerprint: varchar("passport_fingerprint", { length: 64 }).notNull(),
    status: adExperimentStatus("status").notNull().default("draft"),
    approvalTaskId: varchar("approval_task_id", { length: 240 }),
    approvalText: text("approval_text"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByActorKind: adActorKind("approved_by_actor_kind"),
    approvedByActorId: varchar("approved_by_actor_id", { length: 240 }),
    dailyBudget: numeric("daily_budget", { precision: 14, scale: 2 }).notNull(),
    totalBudget: numeric("total_budget", { precision: 14, scale: 2 }).notNull(),
    schedule: jsonb("schedule").$type<Record<string, unknown>>().notNull().default({}),
    kpi: jsonb("kpi").$type<Record<string, unknown>>().notNull().default({}),
    decisionRules: jsonb("decision_rules").$type<Record<string, unknown>>().notNull().default({}),
    spentAmount: numeric("spent_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    verdict: adExperimentVerdict("verdict"),
    verdictEvidence: jsonb("verdict_evidence").$type<Record<string, unknown>>().notNull().default({}),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ad_experiments_status_created_idx").on(table.status, table.createdAt),
    index("ad_experiments_hypothesis_idx").on(table.hypothesisId, table.hypothesisVersion),
    check("ad_experiments_hypothesis_version_positive", sql`${table.hypothesisVersion} > 0`),
    check("ad_experiments_passport_object", sql`jsonb_typeof(${table.passport}) = 'object'`),
    check("ad_experiments_passport_sha256", sql`${table.passportFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_experiments_budgets_nonnegative", sql`${table.dailyBudget} >= 0 AND ${table.totalBudget} >= 0 AND ${table.spentAmount} >= 0`),
    check("ad_experiments_json_objects", sql`jsonb_typeof(${table.schedule}) = 'object' AND jsonb_typeof(${table.kpi}) = 'object' AND jsonb_typeof(${table.decisionRules}) = 'object' AND jsonb_typeof(${table.verdictEvidence}) = 'object'`),
    check("ad_experiments_period_valid", sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
    check("ad_experiments_approval_coherent", sql`(${table.approvalTaskId} IS NULL AND ${table.approvalText} IS NULL AND ${table.approvedAt} IS NULL AND ${table.approvedByActorKind} IS NULL AND ${table.approvedByActorId} IS NULL) OR (${table.approvalTaskId} IS NOT NULL AND ${table.approvalText} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND ${table.approvedByActorKind} IS NOT NULL AND ${table.approvedByActorId} IS NOT NULL)`),
    check("ad_experiments_version_positive", sql`${table.version} > 0`),
  ],
);

export const adExperimentVariants = pgTable(
  "ad_experiment_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id").notNull().references(() => adExperiments.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 80 }).notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    textVersion: jsonb("text_version").$type<Record<string, unknown>>().notNull().default({}),
    creativeVersion: jsonb("creative_version").$type<Record<string, unknown>>().notNull().default({}),
    audienceFingerprint: varchar("audience_fingerprint", { length: 64 }).notNull(),
    conversionPath: adConversionPath("conversion_path").notNull(),
    vkCampaignId: varchar("vk_campaign_id", { length: 120 }),
    vkGroupId: varchar("vk_group_id", { length: 120 }),
    vkBannerId: varchar("vk_banner_id", { length: 120 }),
    vkFormId: varchar("vk_form_id", { length: 120 }),
    status: adVariantStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_experiment_variants_experiment_role_uq").on(table.experimentId, table.role),
    index("ad_experiment_variants_experiment_status_idx").on(table.experimentId, table.status),
    check("ad_experiment_variants_text_nonempty", sql`length(btrim(${table.role})) > 0 AND length(btrim(${table.name})) > 0`),
    check("ad_experiment_variants_audience_sha256", sql`${table.audienceFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_experiment_variants_json_objects", sql`jsonb_typeof(${table.textVersion}) = 'object' AND jsonb_typeof(${table.creativeVersion}) = 'object'`),
    check("ad_experiment_variants_version_positive", sql`${table.version} > 0`),
  ],
);

export const adMetricSnapshots = pgTable(
  "ad_metric_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id").notNull().references(() => adExperiments.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => adExperimentVariants.id, { onDelete: "restrict" }),
    source: varchar("source", { length: 40 }).notNull().default("vk_ads"),
    externalObjectId: varchar("external_object_id", { length: 160 }).notNull(),
    granularity: adMetricGranularity("granularity").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: integer("impressions").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    formOpens: integer("form_opens").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    extras: jsonb("extras").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_metric_snapshots_object_period_uq").on(table.source, table.externalObjectId, table.granularity, table.periodStart, table.periodEnd),
    index("ad_metric_snapshots_experiment_period_idx").on(table.experimentId, table.periodStart),
    check("ad_metric_snapshots_period_valid", sql`${table.periodEnd} > ${table.periodStart}`),
    check("ad_metric_snapshots_nonnegative", sql`${table.spend} >= 0 AND ${table.impressions} >= 0 AND ${table.reach} >= 0 AND ${table.clicks} >= 0 AND ${table.formOpens} >= 0 AND ${table.leads} >= 0`),
    check("ad_metric_snapshots_extras_object", sql`jsonb_typeof(${table.extras}) = 'object'`),
    check("ad_metric_snapshots_extras_bounded", sql`octet_length(${table.extras}::text) <= 16384`),
  ],
);

export const adLeadAttributions = pgTable(
  "ad_lead_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadUuid: uuid("lead_uuid").notNull(),
    externalLeadHash: varchar("external_lead_hash", { length: 64 }),
    experimentId: uuid("experiment_id").notNull().references(() => adExperiments.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => adExperimentVariants.id, { onDelete: "restrict" }),
    crmDealId: varchar("crm_deal_id", { length: 160 }),
    crmPipelineId: varchar("crm_pipeline_id", { length: 160 }),
    crmStageId: varchar("crm_stage_id", { length: 160 }),
    crmActivityId: varchar("crm_activity_id", { length: 160 }),
    classification: adLeadClassification("classification").notNull().default("submitted"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    potentialAmount: numeric("potential_amount", { precision: 14, scale: 2 }),
    lostReasonCode: varchar("lost_reason_code", { length: 160 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_lead_attributions_lead_uuid_uq").on(table.leadUuid),
    uniqueIndex("ad_lead_attributions_external_hash_uq").on(table.externalLeadHash).where(sql`${table.externalLeadHash} IS NOT NULL`),
    index("ad_lead_attributions_experiment_class_idx").on(table.experimentId, table.classification),
    check("ad_lead_attributions_external_sha256", sql`${table.externalLeadHash} IS NULL OR ${table.externalLeadHash} ~ '^[0-9a-f]{64}$'`),
    check("ad_lead_attributions_amounts_nonnegative", sql`(${table.amount} IS NULL OR ${table.amount} >= 0) AND (${table.potentialAmount} IS NULL OR ${table.potentialAmount} >= 0)`),
  ],
);

export const adExperimentEvents = pgTable(
  "ad_experiment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id").references(() => adExperiments.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => adExperimentVariants.id, { onDelete: "restrict" }),
    actorKind: adActorKind("actor_kind").notNull(),
    actorId: varchar("actor_id", { length: 240 }).notNull(),
    action: varchar("action", { length: 160 }).notNull(),
    reason: text("reason").notNull(),
    previousState: varchar("previous_state", { length: 120 }),
    newState: varchar("new_state", { length: 120 }),
    requestId: varchar("request_id", { length: 160 }),
    errorCode: varchar("error_code", { length: 160 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ad_experiment_events_experiment_created_idx").on(table.experimentId, table.createdAt),
    index("ad_experiment_events_action_created_idx").on(table.action, table.createdAt),
    check("ad_experiment_events_text_nonempty", sql`length(btrim(${table.actorId})) > 0 AND length(btrim(${table.action})) > 0 AND length(btrim(${table.reason})) > 0`),
    check("ad_experiment_events_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
    check("ad_experiment_events_payload_bounded", sql`octet_length(${table.payload}::text) <= 16384`),
  ],
);

export const adLearnings = pgTable(
  "ad_learnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conclusion: text("conclusion").notNull(),
    evidenceSnapshot: jsonb("evidence_snapshot").$type<Record<string, unknown>>().notNull(),
    applicability: text("applicability").notNull(),
    confidence: adLearningConfidence("confidence").notNull(),
    hypothesisId: uuid("hypothesis_id").references(() => adHypotheses.id, { onDelete: "restrict" }),
    experimentId: uuid("experiment_id").references(() => adExperiments.id, { onDelete: "restrict" }),
    reviewAt: timestamp("review_at", { withTimezone: true }),
    supersededById: uuid("superseded_by_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ columns: [table.supersededById], foreignColumns: [table.id], name: "ad_learnings_superseded_by_fk" }).onDelete("restrict"),
    index("ad_learnings_confidence_created_idx").on(table.confidence, table.createdAt),
    check("ad_learnings_text_nonempty", sql`length(btrim(${table.conclusion})) > 0 AND length(btrim(${table.applicability})) > 0`),
    check("ad_learnings_evidence_object", sql`jsonb_typeof(${table.evidenceSnapshot}) = 'object'`),
    check("ad_learnings_evidence_bounded", sql`octet_length(${table.evidenceSnapshot}::text) <= 16384`),
    check("ad_learnings_version_positive", sql`${table.version} > 0`),
    check("ad_learnings_not_self_superseded", sql`${table.supersededById} IS NULL OR ${table.supersededById} <> ${table.id}`),
  ],
);

export const adCommandReceipts = pgTable(
  "ad_command_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    commandName: varchar("command_name", { length: 160 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: adCommandStatus("status").notNull().default("processing"),
    safeResult: jsonb("safe_result").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: varchar("error_code", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ad_command_receipts_idempotency_key_uq").on(table.idempotencyKey),
    index("ad_command_receipts_status_created_idx").on(table.status, table.createdAt),
    check("ad_command_receipts_command_nonempty", sql`length(btrim(${table.commandName})) > 0`),
    check("ad_command_receipts_request_sha256", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check("ad_command_receipts_result_object", sql`jsonb_typeof(${table.safeResult}) = 'object'`),
    check("ad_command_receipts_result_bounded", sql`octet_length(${table.safeResult}::text) <= 16384`),
    check("ad_command_receipts_completion_coherent", sql`(${table.status} = 'processing' AND ${table.completedAt} IS NULL) OR (${table.status} IN ('completed', 'failed') AND ${table.completedAt} IS NOT NULL)`),
  ],
);

export const adVkOauthStates = pgTable(
  "ad_vk_oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientFingerprint: varchar("client_fingerprint", { length: 64 }).notNull(),
    encryptedEnvelope: bytea("encrypted_envelope").notNull(),
    nonce: bytea("nonce").notNull(),
    authTag: bytea("auth_tag").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_vk_oauth_states_client_fingerprint_uq").on(table.clientFingerprint),
    check("ad_vk_oauth_states_client_sha256", sql`${table.clientFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_vk_oauth_states_crypto_lengths", sql`octet_length(${table.encryptedEnvelope}) > 0 AND octet_length(${table.nonce}) = 12 AND octet_length(${table.authTag}) = 16`),
    check("ad_vk_oauth_states_version_positive", sql`${table.version} > 0`),
  ],
);

export const adVkSyncRuns = pgTable(
  "ad_vk_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mode: adVkSyncMode("mode").notNull(),
    status: adVkSyncStatus("status").notNull().default("running"),
    stage: varchar("stage", { length: 80 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    coveredDateFrom: date("covered_date_from"),
    coveredDateTo: date("covered_date_to"),
    checkpoint: jsonb("checkpoint").$type<VkAdsCheckpoint>(),
    counters: jsonb("counters").$type<Record<string, number>>().notNull().default({}),
    errorCode: varchar("error_code", { length: 160 }),
    correlationId: uuid("correlation_id").notNull().defaultRandom(),
  },
  (table) => [
    index("ad_vk_sync_runs_status_started_idx").on(table.status, table.startedAt),
    index("ad_vk_sync_runs_mode_started_idx").on(table.mode, table.startedAt),
    check("ad_vk_sync_runs_stage_nonempty", sql`length(btrim(${table.stage})) > 0`),
    check("ad_vk_sync_runs_checkpoint_bounded", sql`${table.checkpoint} IS NULL OR (jsonb_typeof(${table.checkpoint}) = 'object' AND octet_length(${table.checkpoint}::text) <= 4096)`),
    check("ad_vk_sync_runs_counters_bounded", sql`jsonb_typeof(${table.counters}) = 'object' AND octet_length(${table.counters}::text) <= 4096`),
    check("ad_vk_sync_runs_error_code_safe", sql`${table.errorCode} IS NULL OR ${table.errorCode} ~ '^ads_vk_[a-z0-9_]{1,150}$'`),
    check("ad_vk_sync_runs_period_valid", sql`${table.coveredDateFrom} IS NULL OR ${table.coveredDateTo} IS NULL OR ${table.coveredDateTo} >= ${table.coveredDateFrom}`),
    check("ad_vk_sync_runs_status_coherent", sql`(${table.status} = 'running' AND ${table.finishedAt} IS NULL) OR (${table.status} IN ('succeeded', 'partial', 'failed') AND ${table.finishedAt} IS NOT NULL)`),
  ],
);

export const adVkAccounts = pgTable(
  "ad_vk_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    accountType: varchar("account_type", { length: 80 }),
    displayName: varchar("display_name", { length: 240 }),
    currency: varchar("currency", { length: 12 }),
    timezone: varchar("timezone", { length: 80 }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    inactiveAt: timestamp("inactive_at", { withTimezone: true }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex("ad_vk_accounts_external_id_uq").on(table.externalId),
    index("ad_vk_accounts_last_seen_idx").on(table.lastSeenAt),
    check("ad_vk_accounts_external_nonempty", sql`length(btrim(${table.externalId})) > 0`),
    check("ad_vk_accounts_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_vk_accounts_seen_period_valid", sql`${table.lastSeenAt} >= ${table.firstSeenAt} AND (${table.inactiveAt} IS NULL OR ${table.inactiveAt} >= ${table.firstSeenAt})`),
  ],
);

export const adVkCampaigns = pgTable(
  "ad_vk_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => adVkAccounts.id, { onDelete: "restrict" }),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    status: varchar("status", { length: 80 }).notNull(),
    objective: varchar("objective", { length: 120 }),
    campaignType: varchar("campaign_type", { length: 120 }),
    budget: numeric("budget", { precision: 18, scale: 6 }),
    schedule: jsonb("schedule").$type<Record<string, unknown>>().notNull().default({}),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    inactiveAt: timestamp("inactive_at", { withTimezone: true }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex("ad_vk_campaigns_account_external_uq").on(table.accountId, table.externalId),
    index("ad_vk_campaigns_account_status_idx").on(table.accountId, table.status),
    index("ad_vk_campaigns_source_updated_idx").on(table.sourceUpdatedAt),
    check("ad_vk_campaigns_external_nonempty", sql`length(btrim(${table.externalId})) > 0 AND length(btrim(${table.name})) > 0 AND length(btrim(${table.status})) > 0`),
    check("ad_vk_campaigns_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_vk_campaigns_budget_nonnegative", sql`${table.budget} IS NULL OR ${table.budget} >= 0`),
    check("ad_vk_campaigns_schedule_bounded", sql`jsonb_typeof(${table.schedule}) = 'object' AND octet_length(${table.schedule}::text) <= 16384`),
    check("ad_vk_campaigns_seen_period_valid", sql`${table.lastSeenAt} >= ${table.firstSeenAt} AND (${table.inactiveAt} IS NULL OR ${table.inactiveAt} >= ${table.firstSeenAt})`),
  ],
);

export const adVkAdGroups = pgTable(
  "ad_vk_ad_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => adVkAccounts.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").notNull().references(() => adVkCampaigns.id, { onDelete: "restrict" }),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    status: varchar("status", { length: 80 }).notNull(),
    packageSummary: varchar("package_summary", { length: 240 }),
    optimizationSummary: varchar("optimization_summary", { length: 240 }),
    bidStrategySummary: varchar("bid_strategy_summary", { length: 240 }),
    targetingLabels: jsonb("targeting_labels").$type<string[]>().notNull().default([]),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    inactiveAt: timestamp("inactive_at", { withTimezone: true }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex("ad_vk_ad_groups_account_external_uq").on(table.accountId, table.externalId),
    index("ad_vk_ad_groups_campaign_status_idx").on(table.campaignId, table.status),
    index("ad_vk_ad_groups_source_updated_idx").on(table.sourceUpdatedAt),
    check("ad_vk_ad_groups_external_nonempty", sql`length(btrim(${table.externalId})) > 0 AND length(btrim(${table.name})) > 0 AND length(btrim(${table.status})) > 0`),
    check("ad_vk_ad_groups_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_vk_ad_groups_targeting_bounded", sql`jsonb_typeof(${table.targetingLabels}) = 'array' AND jsonb_array_length(${table.targetingLabels}) <= 100 AND octet_length(${table.targetingLabels}::text) <= 16384`),
    check("ad_vk_ad_groups_seen_period_valid", sql`${table.lastSeenAt} >= ${table.firstSeenAt} AND (${table.inactiveAt} IS NULL OR ${table.inactiveAt} >= ${table.firstSeenAt})`),
  ],
);

export const adVkAds = pgTable(
  "ad_vk_ads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => adVkAccounts.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").notNull().references(() => adVkCampaigns.id, { onDelete: "restrict" }),
    adGroupId: uuid("ad_group_id").notNull().references(() => adVkAdGroups.id, { onDelete: "restrict" }),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    status: varchar("status", { length: 80 }).notNull(),
    moderationStatus: varchar("moderation_status", { length: 80 }),
    moderationReasonCode: varchar("moderation_reason_code", { length: 160 }),
    landingOrigin: varchar("landing_origin", { length: 500 }),
    landingPath: varchar("landing_path", { length: 1000 }),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    inactiveAt: timestamp("inactive_at", { withTimezone: true }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex("ad_vk_ads_account_external_uq").on(table.accountId, table.externalId),
    index("ad_vk_ads_group_status_idx").on(table.adGroupId, table.status),
    index("ad_vk_ads_source_updated_idx").on(table.sourceUpdatedAt),
    check("ad_vk_ads_external_nonempty", sql`length(btrim(${table.externalId})) > 0 AND length(btrim(${table.name})) > 0 AND length(btrim(${table.status})) > 0`),
    check("ad_vk_ads_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check(
      "ad_vk_ads_landing_safe",
      sql`(${table.landingOrigin} IS NULL OR ${table.landingOrigin} ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$') AND (${table.landingPath} IS NULL OR (${table.landingPath} ~ '^/' AND ${table.landingPath} !~ '[?#]'))`,
    ),
    check("ad_vk_ads_seen_period_valid", sql`${table.lastSeenAt} >= ${table.firstSeenAt} AND (${table.inactiveAt} IS NULL OR ${table.inactiveAt} >= ${table.firstSeenAt})`),
  ],
);

export const adVkCreativeVersions = pgTable(
  "ad_vk_creative_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adId: uuid("ad_id").notNull().references(() => adVkAds.id, { onDelete: "restrict" }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    mediaKind: adVkMediaKind("media_kind").notNull(),
    textBlocks: jsonb("text_blocks").$type<string[]>().notNull().default([]),
    cta: varchar("cta", { length: 240 }),
    format: varchar("format", { length: 120 }),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    contentIds: jsonb("content_ids").$type<string[]>().notNull().default([]),
    imageSha256: varchar("image_sha256", { length: 64 }),
    imageObjectKey: varchar("image_object_key", { length: 500 }),
    videoSourceUrl: text("video_source_url"),
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull(),
    activeTo: timestamp("active_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_vk_creative_versions_ad_fingerprint_uq").on(table.adId, table.fingerprint),
    index("ad_vk_creative_versions_ad_active_idx").on(table.adId, table.activeTo),
    index("ad_vk_creative_versions_image_sha_idx").on(table.imageSha256),
    check("ad_vk_creative_versions_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$' AND (${table.imageSha256} IS NULL OR ${table.imageSha256} ~ '^[0-9a-f]{64}$')`),
    check("ad_vk_creative_versions_content_bounded", sql`jsonb_typeof(${table.textBlocks}) = 'array' AND jsonb_array_length(${table.textBlocks}) <= 100 AND octet_length(${table.textBlocks}::text) <= 16384 AND jsonb_typeof(${table.contentIds}) = 'array' AND jsonb_array_length(${table.contentIds}) <= 100 AND octet_length(${table.contentIds}::text) <= 16384`),
    check("ad_vk_creative_versions_dimensions_valid", sql`(${table.width} IS NULL OR ${table.width} > 0) AND (${table.height} IS NULL OR ${table.height} > 0) AND (${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0)`),
    check("ad_vk_creative_versions_image_paired", sql`(${table.imageSha256} IS NULL) = (${table.imageObjectKey} IS NULL)`),
    check(
      "ad_vk_creative_versions_media_coherent",
      sql`(${table.mediaKind} = 'image' AND ${table.videoSourceUrl} IS NULL) OR (${table.mediaKind} = 'video' AND ${table.imageSha256} IS NULL AND ${table.imageObjectKey} IS NULL AND (${table.videoSourceUrl} IS NULL OR (${table.videoSourceUrl} ~ '^https://' AND ${table.videoSourceUrl} !~ '[?#]')))`,
    ),
    check("ad_vk_creative_versions_period_valid", sql`${table.activeTo} IS NULL OR ${table.activeTo} > ${table.activeFrom}`),
  ],
);

export const adVkDailyMetrics = pgTable(
  "ad_vk_daily_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    objectKind: adVkObjectKind("object_kind").notNull(),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    metricDate: date("metric_date").notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    spend: numeric("spend", { precision: 18, scale: 6 }).notNull().default("0"),
    impressions: bigint("impressions", { mode: "bigint" }).notNull().default(sql`0`),
    reach: bigint("reach", { mode: "bigint" }).notNull().default(sql`0`),
    clicks: bigint("clicks", { mode: "bigint" }).notNull().default(sql`0`),
    conversions: jsonb("conversions").$type<Record<string, string>>().notNull().default({}),
    sourceRevision: varchar("source_revision", { length: 160 }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ad_vk_daily_metrics_object_date_uq").on(table.objectKind, table.externalId, table.metricDate),
    index("ad_vk_daily_metrics_date_kind_idx").on(table.metricDate, table.objectKind),
    check("ad_vk_daily_metrics_external_nonempty", sql`length(btrim(${table.externalId})) > 0 AND length(btrim(${table.timezone})) > 0`),
    check("ad_vk_daily_metrics_fingerprint_sha256", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("ad_vk_daily_metrics_nonnegative", sql`${table.spend} >= 0 AND ${table.impressions} >= 0 AND ${table.reach} >= 0 AND ${table.clicks} >= 0`),
    check("ad_vk_daily_metrics_conversions_bounded", sql`jsonb_typeof(${table.conversions}) = 'object' AND octet_length(${table.conversions}::text) <= 16384`),
  ],
);

export const adVkExperimentLinks = pgTable(
  "ad_vk_experiment_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id").notNull().references(() => adExperiments.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull().references(() => adExperimentVariants.id, { onDelete: "restrict" }),
    objectKind: adVkObjectKind("object_kind").notNull(),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    actorKind: adActorKind("actor_kind").notNull(),
    actorId: varchar("actor_id", { length: 240 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ad_vk_experiment_links_variant_object_uq").on(table.variantId, table.objectKind, table.externalId),
    index("ad_vk_experiment_links_experiment_idx").on(table.experimentId, table.createdAt),
    check("ad_vk_experiment_links_external_nonempty", sql`length(btrim(${table.externalId})) > 0`),
    check("ad_vk_experiment_links_actor_nonempty", sql`length(btrim(${table.actorId})) > 0`),
  ],
);

export const schema = {
  adminUsers,
  adminSessions,
  adminAuthLimits,
  contentEntries,
  contentMediaRefs,
  contentReleaseItems,
  contentReleaseRuns,
  contentRelations,
  contentRevisions,
  mediaAssets,
  redirects,
  siteSettings,
  leads,
  leadAttachments,
  leadDeliveryJobs,
  leadRateLimits,
  seoSources,
  seoRegions,
  seoQueries,
  seoDailyMetrics,
  seoRankChecks,
  seoRankRuns,
  seoRankJobs,
  seoRankSubmissions,
  seoTrafficMetrics,
  seoCollectionRuns,
  seoChanges,
  seoChangeEvaluations,
  seoRecommendations,
  seoRecommendationHistory,
  geoTopics,
  geoEntities,
  geoPrompts,
  geoRuns,
  geoCoverageCycles,
  geoCollectionJobs,
  geoCollectionLeases,
  geoCollectionAttempts,
  geoObservations,
  geoObservationMentions,
  geoCitations,
  geoFanoutQueries,
  geoReferralDailyMetrics,
  geoCrawlerChecks,
  geoExperiments,
  geoExperimentPrompts,
  adResearchSources,
  adMarketSignals,
  adHypotheses,
  adExperiments,
  adExperimentVariants,
  adMetricSnapshots,
  adLeadAttributions,
  adExperimentEvents,
  adLearnings,
  adCommandReceipts,
  adVkOauthStates,
  adVkSyncRuns,
  adVkAccounts,
  adVkCampaigns,
  adVkAdGroups,
  adVkAds,
  adVkCreativeVersions,
  adVkDailyMetrics,
  adVkExperimentLinks,
};
