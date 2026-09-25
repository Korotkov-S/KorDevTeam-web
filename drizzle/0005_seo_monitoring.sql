CREATE TYPE "public"."seo_change_type" AS ENUM('content', 'metadata', 'structure', 'interlinking', 'technical', 'other');--> statement-breakpoint
CREATE TYPE "public"."seo_device" AS ENUM('desktop', 'mobile', 'tablet', 'all');--> statement-breakpoint
CREATE TYPE "public"."seo_frequency_band" AS ENUM('high', 'medium', 'low', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."seo_query_origin" AS ENUM('manual', 'api', 'import');--> statement-breakpoint
CREATE TYPE "public"."seo_recommendation_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."seo_recommendation_status" AS ENUM('new', 'accepted', 'rejected', 'implemented', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."seo_region_scope" AS ENUM('country', 'city');--> statement-breakpoint
CREATE TYPE "public"."seo_run_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seo_source" AS ENUM('yandex_webmaster', 'google_search_console');--> statement-breakpoint
CREATE TABLE "seo_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_path" varchar(500) NOT NULL,
	"summary" text NOT NULL,
	"type" "seo_change_type" NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_entry_id" uuid,
	"content_version" integer,
	"actor_admin_user_id" uuid,
	"actor_mcp_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_changes_page_path_valid" CHECK ("seo_changes"."page_path" LIKE '/%'),
	CONSTRAINT "seo_changes_summary_nonempty" CHECK (length(btrim("seo_changes"."summary")) > 0),
	CONSTRAINT "seo_changes_content_version_positive" CHECK ("seo_changes"."content_version" IS NULL OR "seo_changes"."content_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "seo_collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "seo_source" NOT NULL,
	"requested_from" date NOT NULL,
	"requested_to" date NOT NULL,
	"status" "seo_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"received_count" integer DEFAULT 0 NOT NULL,
	"stored_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "seo_collection_runs_date_range_valid" CHECK ("seo_collection_runs"."requested_to" >= "seo_collection_runs"."requested_from"),
	CONSTRAINT "seo_collection_runs_counts_non_negative" CHECK ("seo_collection_runs"."received_count" >= 0 AND "seo_collection_runs"."stored_count" >= 0),
	CONSTRAINT "seo_collection_runs_completed_after_start" CHECK ("seo_collection_runs"."completed_at" IS NULL OR "seo_collection_runs"."completed_at" >= "seo_collection_runs"."started_at"),
	CONSTRAINT "seo_collection_runs_metadata_object" CHECK (jsonb_typeof("seo_collection_runs"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "seo_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_date" date NOT NULL,
	"source" "seo_source" NOT NULL,
	"query_id" uuid NOT NULL,
	"page_path" varchar(500) NOT NULL,
	"region_id" uuid NOT NULL,
	"device" "seo_device" NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"ctr" numeric(9, 8) NOT NULL,
	"average_position" numeric(12, 4) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_daily_metrics_page_path_valid" CHECK ("seo_daily_metrics"."page_path" LIKE '/%'),
	CONSTRAINT "seo_daily_metrics_impressions_non_negative" CHECK ("seo_daily_metrics"."impressions" >= 0),
	CONSTRAINT "seo_daily_metrics_clicks_valid" CHECK ("seo_daily_metrics"."clicks" >= 0 AND "seo_daily_metrics"."clicks" <= "seo_daily_metrics"."impressions"),
	CONSTRAINT "seo_daily_metrics_ctr_valid" CHECK ("seo_daily_metrics"."ctr" >= 0 AND "seo_daily_metrics"."ctr" <= 1),
	CONSTRAINT "seo_daily_metrics_position_positive" CHECK ("seo_daily_metrics"."average_position" > 0)
);
--> statement-breakpoint
CREATE TABLE "seo_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_text" text NOT NULL,
	"normalized_query" text NOT NULL,
	"target_path" varchar(500),
	"origin" "seo_query_origin" DEFAULT 'api' NOT NULL,
	"wordstat_frequency" integer,
	"frequency_band" "seo_frequency_band" DEFAULT 'unclassified' NOT NULL,
	"tracked" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_queries_query_text_nonempty" CHECK (length(btrim("seo_queries"."query_text")) > 0),
	CONSTRAINT "seo_queries_normalized_query_nonempty" CHECK (length(btrim("seo_queries"."normalized_query")) > 0),
	CONSTRAINT "seo_queries_frequency_non_negative" CHECK ("seo_queries"."wordstat_frequency" IS NULL OR "seo_queries"."wordstat_frequency" >= 0),
	CONSTRAINT "seo_queries_target_path_valid" CHECK ("seo_queries"."target_path" IS NULL OR "seo_queries"."target_path" LIKE '/%')
);
--> statement-breakpoint
CREATE TABLE "seo_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"page_path" varchar(500),
	"query_id" uuid,
	"issue_type" varchar(120) NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" "seo_recommendation_confidence" NOT NULL,
	"status" "seo_recommendation_status" DEFAULT 'new' NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"created_by_mcp_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_recommendations_title_nonempty" CHECK (length(btrim("seo_recommendations"."title")) > 0),
	CONSTRAINT "seo_recommendations_rationale_nonempty" CHECK (length(btrim("seo_recommendations"."rationale")) > 0),
	CONSTRAINT "seo_recommendations_issue_type_nonempty" CHECK (length(btrim("seo_recommendations"."issue_type")) > 0),
	CONSTRAINT "seo_recommendations_page_path_valid" CHECK ("seo_recommendations"."page_path" IS NULL OR "seo_recommendations"."page_path" LIKE '/%'),
	CONSTRAINT "seo_recommendations_evidence_object" CHECK (jsonb_typeof("seo_recommendations"."evidence") = 'object'),
	CONSTRAINT "seo_recommendations_fingerprint_sha256" CHECK ("seo_recommendations"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "seo_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "seo_source" NOT NULL,
	"external_id" varchar(120),
	"code" varchar(80) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"scope" "seo_region_scope" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_regions_source_id_uq" UNIQUE("source","id"),
	CONSTRAINT "seo_regions_code_nonempty" CHECK (length(btrim("seo_regions"."code")) > 0),
	CONSTRAINT "seo_regions_display_name_nonempty" CHECK (length(btrim("seo_regions"."display_name")) > 0),
	CONSTRAINT "seo_regions_sort_order_non_negative" CHECK ("seo_regions"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seo_sources" (
	"id" "seo_source" PRIMARY KEY NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_error_code" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_sources_display_name_nonempty" CHECK (length(btrim("seo_sources"."display_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "seo_changes" ADD CONSTRAINT "seo_changes_content_entry_id_content_entries_id_fk" FOREIGN KEY ("content_entry_id") REFERENCES "public"."content_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_changes" ADD CONSTRAINT "seo_changes_actor_admin_user_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_changes" ADD CONSTRAINT "seo_changes_actor_mcp_token_id_mcp_tokens_id_fk" FOREIGN KEY ("actor_mcp_token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_collection_runs" ADD CONSTRAINT "seo_collection_runs_source_seo_sources_id_fk" FOREIGN KEY ("source") REFERENCES "public"."seo_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_daily_metrics" ADD CONSTRAINT "seo_daily_metrics_query_id_seo_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."seo_queries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_daily_metrics" ADD CONSTRAINT "seo_daily_metrics_source_region_fk" FOREIGN KEY ("source","region_id") REFERENCES "public"."seo_regions"("source","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendations" ADD CONSTRAINT "seo_recommendations_query_id_seo_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."seo_queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendations" ADD CONSTRAINT "seo_recommendations_created_by_mcp_token_id_mcp_tokens_id_fk" FOREIGN KEY ("created_by_mcp_token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_regions" ADD CONSTRAINT "seo_regions_source_seo_sources_id_fk" FOREIGN KEY ("source") REFERENCES "public"."seo_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seo_changes_page_applied_idx" ON "seo_changes" USING btree ("page_path","applied_at");--> statement-breakpoint
CREATE INDEX "seo_collection_runs_source_started_idx" ON "seo_collection_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_daily_metrics_observation_uq" ON "seo_daily_metrics" USING btree ("observation_date","source","query_id","page_path","region_id","device");--> statement-breakpoint
CREATE INDEX "seo_daily_metrics_slice_idx" ON "seo_daily_metrics" USING btree ("observation_date","source","region_id","device");--> statement-breakpoint
CREATE INDEX "seo_daily_metrics_query_date_idx" ON "seo_daily_metrics" USING btree ("query_id","observation_date");--> statement-breakpoint
CREATE INDEX "seo_daily_metrics_page_date_idx" ON "seo_daily_metrics" USING btree ("page_path","observation_date");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_queries_normalized_query_uq" ON "seo_queries" USING btree ("normalized_query");--> statement-breakpoint
CREATE INDEX "seo_queries_tracked_band_idx" ON "seo_queries" USING btree ("tracked","frequency_band");--> statement-breakpoint
CREATE INDEX "seo_recommendations_status_created_idx" ON "seo_recommendations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "seo_recommendations_fingerprint_idx" ON "seo_recommendations" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_regions_source_code_uq" ON "seo_regions" USING btree ("source","code");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_regions_source_external_id_uq" ON "seo_regions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "seo_regions_active_sort_idx" ON "seo_regions" USING btree ("active","sort_order");--> statement-breakpoint
INSERT INTO "seo_sources" ("id", "display_name") VALUES
	('yandex_webmaster', 'Яндекс Вебмастер'),
	('google_search_console', 'Google Search Console');--> statement-breakpoint
INSERT INTO "seo_regions" ("source", "external_id", "code", "display_name", "scope", "sort_order") VALUES
	('yandex_webmaster', NULL, 'ru', 'Россия', 'country', 0),
	('yandex_webmaster', NULL, 'moscow', 'Москва', 'city', 10),
	('yandex_webmaster', NULL, 'saint-petersburg', 'Санкт-Петербург', 'city', 20),
	('yandex_webmaster', NULL, 'novosibirsk', 'Новосибирск', 'city', 30),
	('yandex_webmaster', NULL, 'ekaterinburg', 'Екатеринбург', 'city', 40),
	('yandex_webmaster', NULL, 'kazan', 'Казань', 'city', 50),
	('yandex_webmaster', NULL, 'nizhny-novgorod', 'Нижний Новгород', 'city', 60),
	('yandex_webmaster', NULL, 'krasnodar', 'Краснодар', 'city', 70),
	('google_search_console', 'RUS', 'ru', 'Россия', 'country', 0);
