CREATE TYPE "public"."ad_vk_media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."ad_vk_object_kind" AS ENUM('campaign', 'ad_group', 'ad');--> statement-breakpoint
CREATE TYPE "public"."ad_vk_sync_mode" AS ENUM('check', 'backfill', 'daily');--> statement-breakpoint
CREATE TYPE "public"."ad_vk_sync_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "ad_vk_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"account_type" varchar(80),
	"display_name" varchar(240),
	"currency" varchar(12),
	"timezone" varchar(80),
	"source_updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"inactive_at" timestamp with time zone,
	"fingerprint" varchar(64) NOT NULL,
	CONSTRAINT "ad_vk_accounts_external_nonempty" CHECK (length(btrim("ad_vk_accounts"."external_id")) > 0),
	CONSTRAINT "ad_vk_accounts_fingerprint_sha256" CHECK ("ad_vk_accounts"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_vk_accounts_seen_period_valid" CHECK ("ad_vk_accounts"."last_seen_at" >= "ad_vk_accounts"."first_seen_at" AND ("ad_vk_accounts"."inactive_at" IS NULL OR "ad_vk_accounts"."inactive_at" >= "ad_vk_accounts"."first_seen_at"))
);
--> statement-breakpoint
CREATE TABLE "ad_vk_ad_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"name" varchar(500) NOT NULL,
	"status" varchar(80) NOT NULL,
	"package_summary" varchar(240),
	"optimization_summary" varchar(240),
	"bid_strategy_summary" varchar(240),
	"targeting_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"inactive_at" timestamp with time zone,
	"fingerprint" varchar(64) NOT NULL,
	CONSTRAINT "ad_vk_ad_groups_external_nonempty" CHECK (length(btrim("ad_vk_ad_groups"."external_id")) > 0 AND length(btrim("ad_vk_ad_groups"."name")) > 0 AND length(btrim("ad_vk_ad_groups"."status")) > 0),
	CONSTRAINT "ad_vk_ad_groups_fingerprint_sha256" CHECK ("ad_vk_ad_groups"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_vk_ad_groups_targeting_bounded" CHECK (jsonb_typeof("ad_vk_ad_groups"."targeting_labels") = 'array' AND jsonb_array_length("ad_vk_ad_groups"."targeting_labels") <= 100 AND octet_length("ad_vk_ad_groups"."targeting_labels"::text) <= 16384),
	CONSTRAINT "ad_vk_ad_groups_seen_period_valid" CHECK ("ad_vk_ad_groups"."last_seen_at" >= "ad_vk_ad_groups"."first_seen_at" AND ("ad_vk_ad_groups"."inactive_at" IS NULL OR "ad_vk_ad_groups"."inactive_at" >= "ad_vk_ad_groups"."first_seen_at"))
);
--> statement-breakpoint
CREATE TABLE "ad_vk_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"ad_group_id" uuid NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"name" varchar(500) NOT NULL,
	"status" varchar(80) NOT NULL,
	"moderation_status" varchar(80),
	"moderation_reason_code" varchar(160),
	"landing_origin" varchar(500),
	"landing_path" varchar(1000),
	"source_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"inactive_at" timestamp with time zone,
	"fingerprint" varchar(64) NOT NULL,
	CONSTRAINT "ad_vk_ads_external_nonempty" CHECK (length(btrim("ad_vk_ads"."external_id")) > 0 AND length(btrim("ad_vk_ads"."name")) > 0 AND length(btrim("ad_vk_ads"."status")) > 0),
	CONSTRAINT "ad_vk_ads_fingerprint_sha256" CHECK ("ad_vk_ads"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_vk_ads_landing_safe" CHECK (("ad_vk_ads"."landing_origin" IS NULL OR "ad_vk_ads"."landing_origin" ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$') AND ("ad_vk_ads"."landing_path" IS NULL OR ("ad_vk_ads"."landing_path" ~ '^/' AND "ad_vk_ads"."landing_path" !~ '[?#]'))),
	CONSTRAINT "ad_vk_ads_seen_period_valid" CHECK ("ad_vk_ads"."last_seen_at" >= "ad_vk_ads"."first_seen_at" AND ("ad_vk_ads"."inactive_at" IS NULL OR "ad_vk_ads"."inactive_at" >= "ad_vk_ads"."first_seen_at"))
);
--> statement-breakpoint
CREATE TABLE "ad_vk_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"name" varchar(500) NOT NULL,
	"status" varchar(80) NOT NULL,
	"objective" varchar(120),
	"campaign_type" varchar(120),
	"budget" numeric(18, 6),
	"schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"inactive_at" timestamp with time zone,
	"fingerprint" varchar(64) NOT NULL,
	CONSTRAINT "ad_vk_campaigns_external_nonempty" CHECK (length(btrim("ad_vk_campaigns"."external_id")) > 0 AND length(btrim("ad_vk_campaigns"."name")) > 0 AND length(btrim("ad_vk_campaigns"."status")) > 0),
	CONSTRAINT "ad_vk_campaigns_fingerprint_sha256" CHECK ("ad_vk_campaigns"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_vk_campaigns_budget_nonnegative" CHECK ("ad_vk_campaigns"."budget" IS NULL OR "ad_vk_campaigns"."budget" >= 0),
	CONSTRAINT "ad_vk_campaigns_schedule_bounded" CHECK (jsonb_typeof("ad_vk_campaigns"."schedule") = 'object' AND octet_length("ad_vk_campaigns"."schedule"::text) <= 16384),
	CONSTRAINT "ad_vk_campaigns_seen_period_valid" CHECK ("ad_vk_campaigns"."last_seen_at" >= "ad_vk_campaigns"."first_seen_at" AND ("ad_vk_campaigns"."inactive_at" IS NULL OR "ad_vk_campaigns"."inactive_at" >= "ad_vk_campaigns"."first_seen_at"))
);
--> statement-breakpoint
CREATE TABLE "ad_vk_creative_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"media_kind" "ad_vk_media_kind" NOT NULL,
	"text_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta" varchar(240),
	"format" varchar(120),
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"content_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_sha256" varchar(64),
	"image_object_key" varchar(500),
	"video_source_url" text,
	"active_from" timestamp with time zone NOT NULL,
	"active_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_vk_creative_versions_fingerprint_sha256" CHECK ("ad_vk_creative_versions"."fingerprint" ~ '^[0-9a-f]{64}$' AND ("ad_vk_creative_versions"."image_sha256" IS NULL OR "ad_vk_creative_versions"."image_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "ad_vk_creative_versions_content_bounded" CHECK (jsonb_typeof("ad_vk_creative_versions"."text_blocks") = 'array' AND jsonb_array_length("ad_vk_creative_versions"."text_blocks") <= 100 AND octet_length("ad_vk_creative_versions"."text_blocks"::text) <= 16384 AND jsonb_typeof("ad_vk_creative_versions"."content_ids") = 'array' AND jsonb_array_length("ad_vk_creative_versions"."content_ids") <= 100 AND octet_length("ad_vk_creative_versions"."content_ids"::text) <= 16384),
	CONSTRAINT "ad_vk_creative_versions_dimensions_valid" CHECK (("ad_vk_creative_versions"."width" IS NULL OR "ad_vk_creative_versions"."width" > 0) AND ("ad_vk_creative_versions"."height" IS NULL OR "ad_vk_creative_versions"."height" > 0) AND ("ad_vk_creative_versions"."duration_seconds" IS NULL OR "ad_vk_creative_versions"."duration_seconds" >= 0)),
	CONSTRAINT "ad_vk_creative_versions_image_paired" CHECK (("ad_vk_creative_versions"."image_sha256" IS NULL) = ("ad_vk_creative_versions"."image_object_key" IS NULL)),
	CONSTRAINT "ad_vk_creative_versions_media_coherent" CHECK (("ad_vk_creative_versions"."media_kind" = 'image' AND "ad_vk_creative_versions"."video_source_url" IS NULL) OR ("ad_vk_creative_versions"."media_kind" = 'video' AND "ad_vk_creative_versions"."image_sha256" IS NULL AND "ad_vk_creative_versions"."image_object_key" IS NULL AND ("ad_vk_creative_versions"."video_source_url" IS NULL OR ("ad_vk_creative_versions"."video_source_url" ~ '^https://' AND "ad_vk_creative_versions"."video_source_url" !~ '[?#]')))),
	CONSTRAINT "ad_vk_creative_versions_period_valid" CHECK ("ad_vk_creative_versions"."active_to" IS NULL OR "ad_vk_creative_versions"."active_to" > "ad_vk_creative_versions"."active_from")
);
--> statement-breakpoint
CREATE TABLE "ad_vk_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_kind" "ad_vk_object_kind" NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"metric_date" date NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"spend" numeric(18, 6) DEFAULT '0' NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"conversions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_revision" varchar(160),
	"fingerprint" varchar(64) NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ad_vk_daily_metrics_external_nonempty" CHECK (length(btrim("ad_vk_daily_metrics"."external_id")) > 0 AND length(btrim("ad_vk_daily_metrics"."timezone")) > 0),
	CONSTRAINT "ad_vk_daily_metrics_fingerprint_sha256" CHECK ("ad_vk_daily_metrics"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_vk_daily_metrics_nonnegative" CHECK ("ad_vk_daily_metrics"."spend" >= 0 AND "ad_vk_daily_metrics"."impressions" >= 0 AND "ad_vk_daily_metrics"."reach" >= 0 AND "ad_vk_daily_metrics"."clicks" >= 0),
	CONSTRAINT "ad_vk_daily_metrics_conversions_bounded" CHECK (jsonb_typeof("ad_vk_daily_metrics"."conversions") = 'object' AND octet_length("ad_vk_daily_metrics"."conversions"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "ad_vk_experiment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"object_kind" "ad_vk_object_kind" NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"actor_kind" "ad_actor_kind" NOT NULL,
	"actor_id" varchar(240) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_vk_experiment_links_external_nonempty" CHECK (length(btrim("ad_vk_experiment_links"."external_id")) > 0),
	CONSTRAINT "ad_vk_experiment_links_actor_nonempty" CHECK (length(btrim("ad_vk_experiment_links"."actor_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ad_vk_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_fingerprint" varchar(64) NOT NULL,
	"encrypted_envelope" "bytea" NOT NULL,
	"nonce" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_vk_oauth_states_client_sha256" CHECK ("ad_vk_oauth_states"."client_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_vk_oauth_states_crypto_lengths" CHECK (octet_length("ad_vk_oauth_states"."encrypted_envelope") > 0 AND octet_length("ad_vk_oauth_states"."nonce") = 12 AND octet_length("ad_vk_oauth_states"."auth_tag") = 16),
	CONSTRAINT "ad_vk_oauth_states_version_positive" CHECK ("ad_vk_oauth_states"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ad_vk_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "ad_vk_sync_mode" NOT NULL,
	"status" "ad_vk_sync_status" DEFAULT 'running' NOT NULL,
	"stage" varchar(80) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"covered_date_from" date,
	"covered_date_to" date,
	"checkpoint" jsonb,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" varchar(160),
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "ad_vk_sync_runs_stage_nonempty" CHECK (length(btrim("ad_vk_sync_runs"."stage")) > 0),
	CONSTRAINT "ad_vk_sync_runs_checkpoint_bounded" CHECK ("ad_vk_sync_runs"."checkpoint" IS NULL OR (jsonb_typeof("ad_vk_sync_runs"."checkpoint") = 'object' AND octet_length("ad_vk_sync_runs"."checkpoint"::text) <= 4096)),
	CONSTRAINT "ad_vk_sync_runs_counters_bounded" CHECK (jsonb_typeof("ad_vk_sync_runs"."counters") = 'object' AND octet_length("ad_vk_sync_runs"."counters"::text) <= 4096),
	CONSTRAINT "ad_vk_sync_runs_error_code_safe" CHECK ("ad_vk_sync_runs"."error_code" IS NULL OR "ad_vk_sync_runs"."error_code" ~ '^ads_vk_[a-z0-9_]{1,150}$'),
	CONSTRAINT "ad_vk_sync_runs_period_valid" CHECK ("ad_vk_sync_runs"."covered_date_from" IS NULL OR "ad_vk_sync_runs"."covered_date_to" IS NULL OR "ad_vk_sync_runs"."covered_date_to" >= "ad_vk_sync_runs"."covered_date_from"),
	CONSTRAINT "ad_vk_sync_runs_status_coherent" CHECK (("ad_vk_sync_runs"."status" = 'running' AND "ad_vk_sync_runs"."finished_at" IS NULL) OR ("ad_vk_sync_runs"."status" IN ('succeeded', 'partial', 'failed') AND "ad_vk_sync_runs"."finished_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ad_vk_ad_groups" ADD CONSTRAINT "ad_vk_ad_groups_account_id_ad_vk_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_vk_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_ad_groups" ADD CONSTRAINT "ad_vk_ad_groups_campaign_id_ad_vk_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_vk_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_ads" ADD CONSTRAINT "ad_vk_ads_account_id_ad_vk_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_vk_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_ads" ADD CONSTRAINT "ad_vk_ads_campaign_id_ad_vk_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_vk_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_ads" ADD CONSTRAINT "ad_vk_ads_ad_group_id_ad_vk_ad_groups_id_fk" FOREIGN KEY ("ad_group_id") REFERENCES "public"."ad_vk_ad_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_campaigns" ADD CONSTRAINT "ad_vk_campaigns_account_id_ad_vk_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_vk_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_creative_versions" ADD CONSTRAINT "ad_vk_creative_versions_ad_id_ad_vk_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad_vk_ads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_experiment_links" ADD CONSTRAINT "ad_vk_experiment_links_experiment_id_ad_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ad_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_vk_experiment_links" ADD CONSTRAINT "ad_vk_experiment_links_variant_id_ad_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_experiment_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_accounts_external_id_uq" ON "ad_vk_accounts" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "ad_vk_accounts_last_seen_idx" ON "ad_vk_accounts" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_ad_groups_account_external_uq" ON "ad_vk_ad_groups" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "ad_vk_ad_groups_campaign_status_idx" ON "ad_vk_ad_groups" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "ad_vk_ad_groups_source_updated_idx" ON "ad_vk_ad_groups" USING btree ("source_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_ads_account_external_uq" ON "ad_vk_ads" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "ad_vk_ads_group_status_idx" ON "ad_vk_ads" USING btree ("ad_group_id","status");--> statement-breakpoint
CREATE INDEX "ad_vk_ads_source_updated_idx" ON "ad_vk_ads" USING btree ("source_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_campaigns_account_external_uq" ON "ad_vk_campaigns" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "ad_vk_campaigns_account_status_idx" ON "ad_vk_campaigns" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "ad_vk_campaigns_source_updated_idx" ON "ad_vk_campaigns" USING btree ("source_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_creative_versions_ad_fingerprint_uq" ON "ad_vk_creative_versions" USING btree ("ad_id","fingerprint");--> statement-breakpoint
CREATE INDEX "ad_vk_creative_versions_ad_active_idx" ON "ad_vk_creative_versions" USING btree ("ad_id","active_to");--> statement-breakpoint
CREATE INDEX "ad_vk_creative_versions_image_sha_idx" ON "ad_vk_creative_versions" USING btree ("image_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_daily_metrics_object_date_uq" ON "ad_vk_daily_metrics" USING btree ("object_kind","external_id","metric_date");--> statement-breakpoint
CREATE INDEX "ad_vk_daily_metrics_date_kind_idx" ON "ad_vk_daily_metrics" USING btree ("metric_date","object_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_experiment_links_variant_object_uq" ON "ad_vk_experiment_links" USING btree ("variant_id","object_kind","external_id");--> statement-breakpoint
CREATE INDEX "ad_vk_experiment_links_experiment_idx" ON "ad_vk_experiment_links" USING btree ("experiment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_vk_oauth_states_client_fingerprint_uq" ON "ad_vk_oauth_states" USING btree ("client_fingerprint");--> statement-breakpoint
CREATE INDEX "ad_vk_sync_runs_status_started_idx" ON "ad_vk_sync_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "ad_vk_sync_runs_mode_started_idx" ON "ad_vk_sync_runs" USING btree ("mode","started_at");