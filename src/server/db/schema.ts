import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const contentKind = pgEnum("content_kind", ["service", "case", "article", "page", "faq"]);
export const contentStatus = pgEnum("content_status", ["draft", "published"]);
export const relationType = pgEnum("relation_type", [
  "related_case",
  "related_article",
  "related_faq",
  "related_service",
]);
export const mediaVisibility = pgEnum("media_visibility", ["public", "private"]);

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

export const schema = {
  adminUsers,
  contentEntries,
  contentRelations,
  contentRevisions,
  mediaAssets,
  redirects,
  siteSettings,
};
