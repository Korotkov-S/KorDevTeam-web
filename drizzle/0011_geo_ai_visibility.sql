CREATE TYPE "public"."geo_citation_category" AS ENUM('owned', 'competitor', 'media', 'blog', 'forum', 'directory', 'other');--> statement-breakpoint
CREATE TYPE "public"."geo_crawler_status" AS ENUM('pass', 'fail', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."geo_entity_status" AS ENUM('candidate', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."geo_entity_type" AS ENUM('owned', 'competitor');--> statement-breakpoint
CREATE TYPE "public"."geo_experiment_action_type" AS ENUM('content_answer', 'first_party_evidence', 'internal_linking', 'technical_indexing', 'structured_data', 'authority_outreach');--> statement-breakpoint
CREATE TYPE "public"."geo_experiment_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."geo_experiment_metric" AS ENUM('mention_rate', 'citation_rate', 'citation_share', 'owned_source_coverage', 'share_of_voice', 'ai_referrals', 'crawler_health');--> statement-breakpoint
CREATE TYPE "public"."geo_experiment_status" AS ENUM('proposed', 'approved', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."geo_experiment_verdict" AS ENUM('pending', 'won', 'lost', 'inconclusive', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."geo_platform" AS ENUM('yandex_alice', 'chatgpt_search', 'google_ai', 'bing_copilot');--> statement-breakpoint
CREATE TYPE "public"."geo_prompt_category" AS ENUM('commercial', 'informational', 'comparison', 'local', 'brand');--> statement-breakpoint
CREATE TYPE "public"."geo_prompt_status" AS ENUM('candidate', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."geo_run_mode" AS ENUM('official_report', 'live_ui', 'api_probe');--> statement-breakpoint
CREATE TYPE "public"."geo_run_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."geo_sentiment" AS ENUM('positive', 'neutral', 'negative', 'unknown');--> statement-breakpoint
CREATE TABLE "geo_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"hostname" varchar(253) NOT NULL,
	"title" text,
	"source_order" integer NOT NULL,
	"is_owned" boolean DEFAULT false NOT NULL,
	"category" "geo_citation_category" NOT NULL,
	"local_path" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_citations_url_http" CHECK ("geo_citations"."url" ~ '^https?://'),
	CONSTRAINT "geo_citations_url_bounded" CHECK (char_length("geo_citations"."url") <= 2000),
	CONSTRAINT "geo_citations_hostname_nonempty" CHECK (length(btrim("geo_citations"."hostname")) > 0),
	CONSTRAINT "geo_citations_order_positive" CHECK ("geo_citations"."source_order" > 0),
	CONSTRAINT "geo_citations_owned_coherent" CHECK (("geo_citations"."is_owned" AND "geo_citations"."category" = 'owned' AND "geo_citations"."local_path" LIKE '/%') OR (NOT "geo_citations"."is_owned" AND "geo_citations"."category" <> 'owned' AND "geo_citations"."local_path" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "geo_crawler_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_date" date NOT NULL,
	"target" varchar(500) NOT NULL,
	"bot" varchar(120) NOT NULL,
	"status" "geo_crawler_status" NOT NULL,
	"reason_code" varchar(120),
	"http_status" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "geo_crawler_checks_target_nonempty" CHECK (length(btrim("geo_crawler_checks"."target")) > 0),
	CONSTRAINT "geo_crawler_checks_bot_nonempty" CHECK (length(btrim("geo_crawler_checks"."bot")) > 0),
	CONSTRAINT "geo_crawler_checks_http_status_valid" CHECK ("geo_crawler_checks"."http_status" IS NULL OR "geo_crawler_checks"."http_status" BETWEEN 100 AND 599),
	CONSTRAINT "geo_crawler_checks_metadata_object" CHECK (jsonb_typeof("geo_crawler_checks"."metadata") = 'object'),
	CONSTRAINT "geo_crawler_checks_metadata_bounded" CHECK (octet_length("geo_crawler_checks"."metadata"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "geo_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" varchar(240) NOT NULL,
	"type" "geo_entity_type" NOT NULL,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"domains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "geo_entity_status" DEFAULT 'candidate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_entities_name_nonempty" CHECK (length(btrim("geo_entities"."canonical_name")) > 0),
	CONSTRAINT "geo_entities_aliases_bounded" CHECK (cardinality("geo_entities"."aliases") <= 50),
	CONSTRAINT "geo_entities_domains_bounded" CHECK (cardinality("geo_entities"."domains") <= 50)
);
--> statement-breakpoint
CREATE TABLE "geo_experiment_prompts" (
	"experiment_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_text_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_experiment_prompts_experiment_id_prompt_id_pk" PRIMARY KEY("experiment_id","prompt_id"),
	CONSTRAINT "geo_experiment_prompts_snapshot_nonempty" CHECK (length(btrim("geo_experiment_prompts"."prompt_text_snapshot")) > 0),
	CONSTRAINT "geo_experiment_prompts_snapshot_bounded" CHECK (char_length("geo_experiment_prompts"."prompt_text_snapshot") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "geo_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"page_path" varchar(500) NOT NULL,
	"action_type" "geo_experiment_action_type" NOT NULL,
	"hypothesis" text NOT NULL,
	"platform" "geo_platform" NOT NULL,
	"mode" "geo_run_mode" NOT NULL,
	"language" varchar(16) NOT NULL,
	"region" varchar(120) NOT NULL,
	"prompt_set_fingerprint" varchar(64) NOT NULL,
	"primary_metric" "geo_experiment_metric" NOT NULL,
	"direction" "geo_experiment_direction" NOT NULL,
	"minimum_delta" numeric(12, 6) NOT NULL,
	"evaluation_windows" integer[] DEFAULT ARRAY[7,14,28]::integer[] NOT NULL,
	"expected_signal" text NOT NULL,
	"status" "geo_experiment_status" DEFAULT 'proposed' NOT NULL,
	"baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluation_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verdict" "geo_experiment_verdict" DEFAULT 'pending' NOT NULL,
	"seo_change_id" uuid,
	"implemented_at" timestamp with time zone,
	"created_by_mcp_token_id" uuid,
	"approved_by_admin_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_experiments_page_path_valid" CHECK ("geo_experiments"."page_path" LIKE '/%'),
	CONSTRAINT "geo_experiments_hypothesis_nonempty" CHECK (length(btrim("geo_experiments"."hypothesis")) > 0),
	CONSTRAINT "geo_experiments_prompt_set_sha256" CHECK ("geo_experiments"."prompt_set_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geo_experiments_minimum_delta_positive" CHECK ("geo_experiments"."minimum_delta" > 0),
	CONSTRAINT "geo_experiments_windows_exact" CHECK ("geo_experiments"."evaluation_windows" = ARRAY[7,14,28]::integer[]),
	CONSTRAINT "geo_experiments_expected_signal_nonempty" CHECK (length(btrim("geo_experiments"."expected_signal")) > 0),
	CONSTRAINT "geo_experiments_baseline_object" CHECK (jsonb_typeof("geo_experiments"."baseline") = 'object'),
	CONSTRAINT "geo_experiments_evaluations_object" CHECK (jsonb_typeof("geo_experiments"."evaluation_results") = 'object'),
	CONSTRAINT "geo_experiments_implementation_coherent" CHECK (("geo_experiments"."seo_change_id" IS NULL AND "geo_experiments"."implemented_at" IS NULL) OR ("geo_experiments"."seo_change_id" IS NOT NULL AND "geo_experiments"."implemented_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "geo_fanout_queries" (
	"observation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"query_text" text NOT NULL,
	"source" varchar(120) NOT NULL,
	CONSTRAINT "geo_fanout_queries_observation_id_position_pk" PRIMARY KEY("observation_id","position"),
	CONSTRAINT "geo_fanout_queries_position_positive" CHECK ("geo_fanout_queries"."position" > 0),
	CONSTRAINT "geo_fanout_queries_text_nonempty" CHECK (length(btrim("geo_fanout_queries"."query_text")) > 0),
	CONSTRAINT "geo_fanout_queries_text_bounded" CHECK (char_length("geo_fanout_queries"."query_text") <= 2000),
	CONSTRAINT "geo_fanout_queries_source_nonempty" CHECK (length(btrim("geo_fanout_queries"."source")) > 0)
);
--> statement-breakpoint
CREATE TABLE "geo_observation_mentions" (
	"observation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"first_mention_order" integer NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"sentiment" "geo_sentiment" DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "geo_observation_mentions_observation_id_entity_id_pk" PRIMARY KEY("observation_id","entity_id"),
	CONSTRAINT "geo_observation_mentions_order_positive" CHECK ("geo_observation_mentions"."first_mention_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "geo_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"repetition" integer NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mentioned" boolean NOT NULL,
	"linked" boolean NOT NULL,
	"cited" boolean NOT NULL,
	"source_order" integer,
	"response_excerpt" text DEFAULT '' NOT NULL,
	"response_snapshot" text DEFAULT '' NOT NULL,
	"snapshot_truncated" boolean DEFAULT false NOT NULL,
	"response_hash" varchar(64) NOT NULL,
	"model_name" varchar(160),
	"source_count" integer DEFAULT 0 NOT NULL,
	"session_personalized" boolean DEFAULT false NOT NULL,
	CONSTRAINT "geo_observations_repetition_range" CHECK ("geo_observations"."repetition" BETWEEN 1 AND 3),
	CONSTRAINT "geo_observations_flags_coherent" CHECK (NOT "geo_observations"."cited" OR "geo_observations"."linked"),
	CONSTRAINT "geo_observations_source_order_coherent" CHECK (("geo_observations"."cited" AND "geo_observations"."source_order" IS NOT NULL AND "geo_observations"."source_order" > 0) OR (NOT "geo_observations"."cited" AND "geo_observations"."source_order" IS NULL)),
	CONSTRAINT "geo_observations_excerpt_bounded" CHECK (octet_length("geo_observations"."response_excerpt") <= 2048),
	CONSTRAINT "geo_observations_snapshot_bounded" CHECK (octet_length("geo_observations"."response_snapshot") <= 16384),
	CONSTRAINT "geo_observations_response_sha256" CHECK ("geo_observations"."response_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geo_observations_source_count_non_negative" CHECK ("geo_observations"."source_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "geo_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"category" "geo_prompt_category" NOT NULL,
	"status" "geo_prompt_status" DEFAULT 'candidate' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"language" varchar(16) NOT NULL,
	"region" varchar(120) NOT NULL,
	"target_path" varchar(500),
	"seo_query_id" uuid,
	"expected_entity_domain" varchar(253),
	"source" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_prompts_text_nonempty" CHECK (length(btrim("geo_prompts"."prompt_text")) > 0),
	CONSTRAINT "geo_prompts_text_bounded" CHECK (char_length("geo_prompts"."prompt_text") <= 2000),
	CONSTRAINT "geo_prompts_normalized_nonempty" CHECK (length(btrim("geo_prompts"."normalized_text")) > 0),
	CONSTRAINT "geo_prompts_tags_bounded" CHECK (cardinality("geo_prompts"."tags") <= 20),
	CONSTRAINT "geo_prompts_priority_non_negative" CHECK ("geo_prompts"."priority" >= 0),
	CONSTRAINT "geo_prompts_language_nonempty" CHECK (length(btrim("geo_prompts"."language")) > 0),
	CONSTRAINT "geo_prompts_region_nonempty" CHECK (length(btrim("geo_prompts"."region")) > 0),
	CONSTRAINT "geo_prompts_target_path_valid" CHECK ("geo_prompts"."target_path" IS NULL OR "geo_prompts"."target_path" LIKE '/%'),
	CONSTRAINT "geo_prompts_source_nonempty" CHECK (length(btrim("geo_prompts"."source")) > 0)
);
--> statement-breakpoint
CREATE TABLE "geo_referral_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_date" date NOT NULL,
	"platform" "geo_platform" NOT NULL,
	"users" integer NOT NULL,
	"new_users" integer NOT NULL,
	"visits" integer NOT NULL,
	"pageviews" integer NOT NULL,
	"landing_path" varchar(500) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_referral_daily_metrics_counts_non_negative" CHECK ("geo_referral_daily_metrics"."users" >= 0 AND "geo_referral_daily_metrics"."new_users" >= 0 AND "geo_referral_daily_metrics"."visits" >= 0 AND "geo_referral_daily_metrics"."pageviews" >= 0),
	CONSTRAINT "geo_referral_daily_metrics_counts_coherent" CHECK ("geo_referral_daily_metrics"."new_users" <= "geo_referral_daily_metrics"."users" AND "geo_referral_daily_metrics"."users" <= "geo_referral_daily_metrics"."visits" AND "geo_referral_daily_metrics"."visits" <= "geo_referral_daily_metrics"."pageviews"),
	CONSTRAINT "geo_referral_daily_metrics_path_valid" CHECK ("geo_referral_daily_metrics"."landing_path" LIKE '/%')
);
--> statement-breakpoint
CREATE TABLE "geo_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "geo_platform" NOT NULL,
	"surface" varchar(120) NOT NULL,
	"mode" "geo_run_mode" NOT NULL,
	"region" varchar(120) NOT NULL,
	"language" varchar(16) NOT NULL,
	"status" "geo_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"planned_count" integer NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"stored_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(120),
	"initiated_by_mcp_token_id" uuid,
	"prompt_set_fingerprint" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "geo_runs_surface_nonempty" CHECK (length(btrim("geo_runs"."surface")) > 0),
	CONSTRAINT "geo_runs_region_nonempty" CHECK (length(btrim("geo_runs"."region")) > 0),
	CONSTRAINT "geo_runs_language_nonempty" CHECK (length(btrim("geo_runs"."language")) > 0),
	CONSTRAINT "geo_runs_counts_non_negative" CHECK ("geo_runs"."planned_count" >= 0 AND "geo_runs"."completed_count" >= 0 AND "geo_runs"."stored_count" >= 0),
	CONSTRAINT "geo_runs_counts_bounded" CHECK ("geo_runs"."completed_count" <= "geo_runs"."planned_count" AND "geo_runs"."stored_count" <= "geo_runs"."completed_count"),
	CONSTRAINT "geo_runs_completed_after_start" CHECK ("geo_runs"."completed_at" IS NULL OR "geo_runs"."completed_at" >= "geo_runs"."started_at"),
	CONSTRAINT "geo_runs_prompt_set_sha256" CHECK ("geo_runs"."prompt_set_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geo_runs_metadata_object" CHECK (jsonb_typeof("geo_runs"."metadata") = 'object'),
	CONSTRAINT "geo_runs_metadata_bounded" CHECK (octet_length("geo_runs"."metadata"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "geo_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"service_key" varchar(160),
	"target_path" varchar(500),
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "geo_prompt_status" DEFAULT 'candidate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_topics_name_nonempty" CHECK (length(btrim("geo_topics"."name")) > 0),
	CONSTRAINT "geo_topics_slug_format" CHECK ("geo_topics"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "geo_topics_target_path_valid" CHECK ("geo_topics"."target_path" IS NULL OR "geo_topics"."target_path" LIKE '/%'),
	CONSTRAINT "geo_topics_priority_non_negative" CHECK ("geo_topics"."priority" >= 0)
);
--> statement-breakpoint
ALTER TABLE "geo_citations" ADD CONSTRAINT "geo_citations_observation_id_geo_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."geo_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_experiment_prompts" ADD CONSTRAINT "geo_experiment_prompts_experiment_id_geo_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."geo_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_experiment_prompts" ADD CONSTRAINT "geo_experiment_prompts_prompt_id_geo_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."geo_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_experiments" ADD CONSTRAINT "geo_experiments_recommendation_id_seo_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."seo_recommendations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_experiments" ADD CONSTRAINT "geo_experiments_seo_change_id_seo_changes_id_fk" FOREIGN KEY ("seo_change_id") REFERENCES "public"."seo_changes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_experiments" ADD CONSTRAINT "geo_experiments_created_by_mcp_token_id_mcp_tokens_id_fk" FOREIGN KEY ("created_by_mcp_token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_experiments" ADD CONSTRAINT "geo_experiments_approved_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("approved_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_fanout_queries" ADD CONSTRAINT "geo_fanout_queries_observation_id_geo_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."geo_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observation_mentions" ADD CONSTRAINT "geo_observation_mentions_observation_id_geo_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."geo_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observation_mentions" ADD CONSTRAINT "geo_observation_mentions_entity_id_geo_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."geo_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observations" ADD CONSTRAINT "geo_observations_run_id_geo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observations" ADD CONSTRAINT "geo_observations_prompt_id_geo_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."geo_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_prompts" ADD CONSTRAINT "geo_prompts_topic_id_geo_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."geo_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_prompts" ADD CONSTRAINT "geo_prompts_seo_query_id_seo_queries_id_fk" FOREIGN KEY ("seo_query_id") REFERENCES "public"."seo_queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_runs" ADD CONSTRAINT "geo_runs_initiated_by_mcp_token_id_mcp_tokens_id_fk" FOREIGN KEY ("initiated_by_mcp_token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geo_citations_observation_url_uq" ON "geo_citations" USING btree ("observation_id","url");--> statement-breakpoint
CREATE INDEX "geo_citations_hostname_path_idx" ON "geo_citations" USING btree ("hostname","local_path");--> statement-breakpoint
CREATE INDEX "geo_citations_observation_order_idx" ON "geo_citations" USING btree ("observation_id","source_order");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_crawler_checks_date_target_bot_uq" ON "geo_crawler_checks" USING btree ("check_date","target","bot");--> statement-breakpoint
CREATE INDEX "geo_crawler_checks_date_target_idx" ON "geo_crawler_checks" USING btree ("check_date","target");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_entities_canonical_name_uq" ON "geo_entities" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "geo_entities_type_status_idx" ON "geo_entities" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "geo_experiment_prompts_prompt_idx" ON "geo_experiment_prompts" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "geo_experiments_status_created_idx" ON "geo_experiments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "geo_experiments_page_platform_idx" ON "geo_experiments" USING btree ("page_path","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_experiments_one_active_page_set_uq" ON "geo_experiments" USING btree ("page_path","prompt_set_fingerprint") WHERE "geo_experiments"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "geo_fanout_queries_observation_text_uq" ON "geo_fanout_queries" USING btree ("observation_id","query_text");--> statement-breakpoint
CREATE INDEX "geo_observation_mentions_entity_observation_idx" ON "geo_observation_mentions" USING btree ("entity_id","observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_observations_run_prompt_repetition_uq" ON "geo_observations" USING btree ("run_id","prompt_id","repetition");--> statement-breakpoint
CREATE INDEX "geo_observations_prompt_observed_idx" ON "geo_observations" USING btree ("prompt_id","observed_at");--> statement-breakpoint
CREATE INDEX "geo_observations_run_idx" ON "geo_observations" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_prompts_normalized_language_region_uq" ON "geo_prompts" USING btree ("normalized_text","language","region");--> statement-breakpoint
CREATE INDEX "geo_prompts_status_priority_idx" ON "geo_prompts" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "geo_prompts_topic_status_idx" ON "geo_prompts" USING btree ("topic_id","status");--> statement-breakpoint
CREATE INDEX "geo_prompts_seo_query_idx" ON "geo_prompts" USING btree ("seo_query_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_referral_daily_metrics_date_platform_path_uq" ON "geo_referral_daily_metrics" USING btree ("observation_date","platform","landing_path");--> statement-breakpoint
CREATE INDEX "geo_referral_daily_metrics_date_platform_idx" ON "geo_referral_daily_metrics" USING btree ("observation_date","platform");--> statement-breakpoint
CREATE INDEX "geo_runs_period_platform_mode_idx" ON "geo_runs" USING btree ("started_at","platform","mode");--> statement-breakpoint
CREATE INDEX "geo_runs_principal_status_idx" ON "geo_runs" USING btree ("initiated_by_mcp_token_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_topics_slug_uq" ON "geo_topics" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "geo_topics_status_priority_idx" ON "geo_topics" USING btree ("status","priority");