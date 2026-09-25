import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
export const seoSource = pgEnum("seo_source", ["yandex_webmaster", "google_search_console"]);
export const seoDevice = pgEnum("seo_device", ["desktop", "mobile", "tablet", "all"]);
export const seoFrequencyBand = pgEnum("seo_frequency_band", ["high", "medium", "low", "unclassified"]);
export const seoQueryOrigin = pgEnum("seo_query_origin", ["manual", "api", "import"]);
export const seoRunStatus = pgEnum("seo_run_status", ["running", "success", "partial", "failed"]);
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
    tracked: boolean("tracked").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seo_queries_normalized_query_uq").on(table.normalizedQuery),
    index("seo_queries_tracked_band_idx").on(table.tracked, table.frequencyBand),
    check("seo_queries_query_text_nonempty", sql`length(btrim(${table.queryText})) > 0`),
    check("seo_queries_normalized_query_nonempty", sql`length(btrim(${table.normalizedQuery})) > 0`),
    check("seo_queries_frequency_non_negative", sql`${table.wordstatFrequency} IS NULL OR ${table.wordstatFrequency} >= 0`),
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
    check("seo_daily_metrics_clicks_valid", sql`${table.clicks} >= 0 AND ${table.clicks} <= ${table.impressions}`),
    check("seo_daily_metrics_ctr_valid", sql`${table.ctr} >= 0 AND ${table.ctr} <= 1`),
    check("seo_daily_metrics_position_positive", sql`${table.averagePosition} > 0`),
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

export const schema = {
  adminUsers,
  adminSessions,
  adminAuthLimits,
  contentEntries,
  contentMediaRefs,
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
  seoCollectionRuns,
  seoChanges,
  seoRecommendations,
};
