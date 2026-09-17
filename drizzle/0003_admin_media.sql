CREATE TYPE "public"."admin_auth_limit_kind" AS ENUM('ip', 'login', 'global');--> statement-breakpoint
CREATE TABLE "admin_auth_limits" (
	"kind" "admin_auth_limit_kind" NOT NULL,
	"subject_hash" varchar(64) NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_auth_limits_kind_subject_hash_window_started_at_pk" PRIMARY KEY("kind","subject_hash","window_started_at"),
	CONSTRAINT "admin_auth_limits_subject_hash_sha256" CHECK ("admin_auth_limits"."subject_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_auth_limits_count_non_negative" CHECK ("admin_auth_limits"."count" >= 0),
	CONSTRAINT "admin_auth_limits_expires_after_window" CHECK ("admin_auth_limits"."expires_at" > "admin_auth_limits"."window_started_at")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"csrf_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_sessions_token_hash_sha256" CHECK ("admin_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_sessions_csrf_hash_sha256" CHECK ("admin_sessions"."csrf_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_sessions_expires_after_creation" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "content_media_refs" (
	"entry_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"field_path" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_media_refs_entry_id_media_id_field_path_pk" PRIMARY KEY("entry_id","media_id","field_path"),
	CONSTRAINT "content_media_refs_field_path_nonempty" CHECK (length("content_media_refs"."field_path") > 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "decorative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "processing_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_media_refs" ADD CONSTRAINT "content_media_refs_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_media_refs" ADD CONSTRAINT "content_media_refs_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_auth_limits_expires_at_idx" ON "admin_auth_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_uq" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "content_media_refs_media_id_idx" ON "content_media_refs" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_checksum_visibility_processing_uq" ON "media_assets" USING btree ("checksum","visibility","processing_version");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_processing_version_positive" CHECK ("media_assets"."processing_version" > 0);--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_version_positive" CHECK ("media_assets"."version" > 0);--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_version_positive" CHECK ("site_settings"."version" > 0);