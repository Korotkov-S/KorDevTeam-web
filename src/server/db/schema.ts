import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  pgTable,
  text,
  timestamp,
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
    createdBy: uuid("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_uq").on(table.objectKey),
    check("media_assets_byte_size_positive", sql`${table.byteSize} > 0`),
    check("media_assets_width_positive", sql`${table.width} IS NULL OR ${table.width} > 0`),
    check("media_assets_height_positive", sql`${table.height} IS NULL OR ${table.height} > 0`),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("site_settings_key_uq").on(table.key)],
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

export const schema = {
  adminUsers,
  contentEntries,
  contentRelations,
  contentRevisions,
  mediaAssets,
  redirects,
  siteSettings,
  leads,
  leadAttachments,
  leadDeliveryJobs,
  leadRateLimits,
};
