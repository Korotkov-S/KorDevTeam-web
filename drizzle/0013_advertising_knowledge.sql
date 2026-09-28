CREATE TYPE "public"."ad_actor_kind" AS ENUM('agent', 'admin', 'mcp', 'system', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."ad_changed_variable" AS ENUM('offer', 'audience', 'creative_angle', 'conversion_path');--> statement-breakpoint
CREATE TYPE "public"."ad_channel" AS ENUM('vk', 'yandex', 'telegram', 'web', 'internal');--> statement-breakpoint
CREATE TYPE "public"."ad_command_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ad_conversion_path" AS ENUM('vk_lead_form', 'site', 'message');--> statement-breakpoint
CREATE TYPE "public"."ad_evidence_grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."ad_experiment_status" AS ENUM('draft', 'awaiting_approval', 'approved', 'creating', 'moderation', 'scheduled', 'running', 'stopping', 'completed', 'analyzed', 'rejected_moderation', 'invalid_tracking', 'stopped_safety', 'failed_reconciliation');--> statement-breakpoint
CREATE TYPE "public"."ad_experiment_verdict" AS ENUM('winner', 'loser', 'inconclusive', 'invalid_tracking', 'stopped_safety');--> statement-breakpoint
CREATE TYPE "public"."ad_hypothesis_status" AS ENUM('candidate', 'proposed', 'approved', 'testing', 'validated', 'rejected', 'inconclusive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ad_lead_classification" AS ENUM('submitted', 'contacted', 'qualified', 'won', 'lost', 'open');--> statement-breakpoint
CREATE TYPE "public"."ad_learning_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."ad_metric_granularity" AS ENUM('hour', 'day');--> statement-breakpoint
CREATE TYPE "public"."ad_primary_metric" AS ENUM('qualified_lead_cost', 'sale_cost', 'romi');--> statement-breakpoint
CREATE TYPE "public"."ad_research_source_type" AS ENUM('official_guide', 'case_study', 'public_ad', 'competitor_landing', 'wordstat', 'product', 'internal');--> statement-breakpoint
CREATE TYPE "public"."ad_variant_status" AS ENUM('draft', 'moderation', 'scheduled', 'running', 'paused', 'rejected', 'completed');--> statement-breakpoint
CREATE TABLE "ad_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"command_name" varchar(160) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" "ad_command_status" DEFAULT 'processing' NOT NULL,
	"safe_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ad_command_receipts_command_nonempty" CHECK (length(btrim("ad_command_receipts"."command_name")) > 0),
	CONSTRAINT "ad_command_receipts_request_sha256" CHECK ("ad_command_receipts"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_command_receipts_result_object" CHECK (jsonb_typeof("ad_command_receipts"."safe_result") = 'object'),
	CONSTRAINT "ad_command_receipts_result_bounded" CHECK (octet_length("ad_command_receipts"."safe_result"::text) <= 16384),
	CONSTRAINT "ad_command_receipts_completion_coherent" CHECK (("ad_command_receipts"."status" = 'processing' AND "ad_command_receipts"."completed_at" IS NULL) OR ("ad_command_receipts"."status" IN ('completed', 'failed') AND "ad_command_receipts"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ad_experiment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid,
	"variant_id" uuid,
	"actor_kind" "ad_actor_kind" NOT NULL,
	"actor_id" varchar(240) NOT NULL,
	"action" varchar(160) NOT NULL,
	"reason" text NOT NULL,
	"previous_state" varchar(120),
	"new_state" varchar(120),
	"request_id" varchar(160),
	"error_code" varchar(160),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_experiment_events_text_nonempty" CHECK (length(btrim("ad_experiment_events"."actor_id")) > 0 AND length(btrim("ad_experiment_events"."action")) > 0 AND length(btrim("ad_experiment_events"."reason")) > 0),
	CONSTRAINT "ad_experiment_events_payload_object" CHECK (jsonb_typeof("ad_experiment_events"."payload") = 'object'),
	CONSTRAINT "ad_experiment_events_payload_bounded" CHECK (octet_length("ad_experiment_events"."payload"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "ad_experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"role" varchar(80) NOT NULL,
	"name" varchar(240) NOT NULL,
	"text_version" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creative_version" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audience_fingerprint" varchar(64) NOT NULL,
	"conversion_path" "ad_conversion_path" NOT NULL,
	"vk_campaign_id" varchar(120),
	"vk_group_id" varchar(120),
	"vk_banner_id" varchar(120),
	"vk_form_id" varchar(120),
	"status" "ad_variant_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_experiment_variants_text_nonempty" CHECK (length(btrim("ad_experiment_variants"."role")) > 0 AND length(btrim("ad_experiment_variants"."name")) > 0),
	CONSTRAINT "ad_experiment_variants_audience_sha256" CHECK ("ad_experiment_variants"."audience_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_experiment_variants_json_objects" CHECK (jsonb_typeof("ad_experiment_variants"."text_version") = 'object' AND jsonb_typeof("ad_experiment_variants"."creative_version") = 'object'),
	CONSTRAINT "ad_experiment_variants_version_positive" CHECK ("ad_experiment_variants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ad_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hypothesis_id" uuid NOT NULL,
	"hypothesis_version" integer NOT NULL,
	"passport" jsonb NOT NULL,
	"passport_fingerprint" varchar(64) NOT NULL,
	"status" "ad_experiment_status" DEFAULT 'draft' NOT NULL,
	"approval_task_id" varchar(240),
	"approval_text" text,
	"approved_at" timestamp with time zone,
	"approved_by_actor_kind" "ad_actor_kind",
	"approved_by_actor_id" varchar(240),
	"daily_budget" numeric(14, 2) NOT NULL,
	"total_budget" numeric(14, 2) NOT NULL,
	"schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kpi" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spent_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"verdict" "ad_experiment_verdict",
	"verdict_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_experiments_hypothesis_version_positive" CHECK ("ad_experiments"."hypothesis_version" > 0),
	CONSTRAINT "ad_experiments_passport_object" CHECK (jsonb_typeof("ad_experiments"."passport") = 'object'),
	CONSTRAINT "ad_experiments_passport_sha256" CHECK ("ad_experiments"."passport_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_experiments_budgets_nonnegative" CHECK ("ad_experiments"."daily_budget" >= 0 AND "ad_experiments"."total_budget" >= 0 AND "ad_experiments"."spent_amount" >= 0),
	CONSTRAINT "ad_experiments_json_objects" CHECK (jsonb_typeof("ad_experiments"."schedule") = 'object' AND jsonb_typeof("ad_experiments"."kpi") = 'object' AND jsonb_typeof("ad_experiments"."decision_rules") = 'object' AND jsonb_typeof("ad_experiments"."verdict_evidence") = 'object'),
	CONSTRAINT "ad_experiments_period_valid" CHECK ("ad_experiments"."starts_at" IS NULL OR "ad_experiments"."ends_at" IS NULL OR "ad_experiments"."ends_at" > "ad_experiments"."starts_at"),
	CONSTRAINT "ad_experiments_approval_coherent" CHECK (("ad_experiments"."approval_task_id" IS NULL AND "ad_experiments"."approval_text" IS NULL AND "ad_experiments"."approved_at" IS NULL AND "ad_experiments"."approved_by_actor_kind" IS NULL AND "ad_experiments"."approved_by_actor_id" IS NULL) OR ("ad_experiments"."approval_task_id" IS NOT NULL AND "ad_experiments"."approval_text" IS NOT NULL AND "ad_experiments"."approved_at" IS NOT NULL AND "ad_experiments"."approved_by_actor_kind" IS NOT NULL AND "ad_experiments"."approved_by_actor_id" IS NOT NULL)),
	CONSTRAINT "ad_experiments_version_positive" CHECK ("ad_experiments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ad_hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"problem" text NOT NULL,
	"audience" text NOT NULL,
	"offer" text NOT NULL,
	"proof" text NOT NULL,
	"creative_angle" text NOT NULL,
	"conversion_path" "ad_conversion_path" NOT NULL,
	"changed_variable" "ad_changed_variable" NOT NULL,
	"controls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"primary_metric" "ad_primary_metric" NOT NULL,
	"guard_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_effect" text NOT NULL,
	"minimum_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_budget" numeric(14, 2) NOT NULL,
	"total_budget" numeric(14, 2) NOT NULL,
	"duration_days" integer NOT NULL,
	"stop_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"impact" integer NOT NULL,
	"confidence" integer NOT NULL,
	"ease" integer NOT NULL,
	"evidence_quality" integer NOT NULL,
	"rationale" text NOT NULL,
	"source_signal_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"status" "ad_hypothesis_status" DEFAULT 'candidate' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_hypotheses_text_nonempty" CHECK (length(btrim("ad_hypotheses"."service")) > 0 AND length(btrim("ad_hypotheses"."problem")) > 0 AND length(btrim("ad_hypotheses"."audience")) > 0 AND length(btrim("ad_hypotheses"."offer")) > 0 AND length(btrim("ad_hypotheses"."proof")) > 0 AND length(btrim("ad_hypotheses"."creative_angle")) > 0 AND length(btrim("ad_hypotheses"."expected_effect")) > 0 AND length(btrim("ad_hypotheses"."rationale")) > 0),
	CONSTRAINT "ad_hypotheses_json_objects" CHECK (jsonb_typeof("ad_hypotheses"."controls") = 'object' AND jsonb_typeof("ad_hypotheses"."guard_metrics") = 'object' AND jsonb_typeof("ad_hypotheses"."minimum_data") = 'object' AND jsonb_typeof("ad_hypotheses"."stop_conditions") = 'object'),
	CONSTRAINT "ad_hypotheses_budgets_nonnegative" CHECK ("ad_hypotheses"."daily_budget" >= 0 AND "ad_hypotheses"."total_budget" >= 0),
	CONSTRAINT "ad_hypotheses_duration_positive" CHECK ("ad_hypotheses"."duration_days" > 0),
	CONSTRAINT "ad_hypotheses_scores_bounded" CHECK ("ad_hypotheses"."impact" BETWEEN 1 AND 5 AND "ad_hypotheses"."confidence" BETWEEN 1 AND 5 AND "ad_hypotheses"."ease" BETWEEN 1 AND 5 AND "ad_hypotheses"."evidence_quality" BETWEEN 1 AND 5),
	CONSTRAINT "ad_hypotheses_version_positive" CHECK ("ad_hypotheses"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ad_lead_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_uuid" uuid NOT NULL,
	"external_lead_hash" varchar(64),
	"experiment_id" uuid NOT NULL,
	"variant_id" uuid,
	"crm_deal_id" varchar(160),
	"crm_pipeline_id" varchar(160),
	"crm_stage_id" varchar(160),
	"crm_activity_id" varchar(160),
	"classification" "ad_lead_classification" DEFAULT 'submitted' NOT NULL,
	"amount" numeric(14, 2),
	"potential_amount" numeric(14, 2),
	"lost_reason_code" varchar(160),
	"submitted_at" timestamp with time zone NOT NULL,
	"contacted_at" timestamp with time zone,
	"qualified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_lead_attributions_external_sha256" CHECK ("ad_lead_attributions"."external_lead_hash" IS NULL OR "ad_lead_attributions"."external_lead_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_lead_attributions_amounts_nonnegative" CHECK (("ad_lead_attributions"."amount" IS NULL OR "ad_lead_attributions"."amount" >= 0) AND ("ad_lead_attributions"."potential_amount" IS NULL OR "ad_lead_attributions"."potential_amount" >= 0))
);
--> statement-breakpoint
CREATE TABLE "ad_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conclusion" text NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"applicability" text NOT NULL,
	"confidence" "ad_learning_confidence" NOT NULL,
	"hypothesis_id" uuid,
	"experiment_id" uuid,
	"review_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_learnings_text_nonempty" CHECK (length(btrim("ad_learnings"."conclusion")) > 0 AND length(btrim("ad_learnings"."applicability")) > 0),
	CONSTRAINT "ad_learnings_evidence_object" CHECK (jsonb_typeof("ad_learnings"."evidence_snapshot") = 'object'),
	CONSTRAINT "ad_learnings_evidence_bounded" CHECK (octet_length("ad_learnings"."evidence_snapshot"::text) <= 16384),
	CONSTRAINT "ad_learnings_version_positive" CHECK ("ad_learnings"."version" > 0),
	CONSTRAINT "ad_learnings_not_self_superseded" CHECK ("ad_learnings"."superseded_by_id" IS NULL OR "ad_learnings"."superseded_by_id" <> "ad_learnings"."id")
);
--> statement-breakpoint
CREATE TABLE "ad_market_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"hook" text NOT NULL,
	"offer" text NOT NULL,
	"proof" text NOT NULL,
	"format" varchar(160) NOT NULL,
	"cta" text NOT NULL,
	"audience" text NOT NULL,
	"landing_url" text,
	"disclosed_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applicability" text NOT NULL,
	"evidence_grade" "ad_evidence_grade" NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_market_signals_fingerprint_sha256" CHECK ("ad_market_signals"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_market_signals_text_nonempty" CHECK (length(btrim("ad_market_signals"."hook")) > 0 AND length(btrim("ad_market_signals"."offer")) > 0 AND length(btrim("ad_market_signals"."proof")) > 0 AND length(btrim("ad_market_signals"."format")) > 0 AND length(btrim("ad_market_signals"."cta")) > 0 AND length(btrim("ad_market_signals"."audience")) > 0 AND length(btrim("ad_market_signals"."applicability")) > 0),
	CONSTRAINT "ad_market_signals_metrics_object" CHECK (jsonb_typeof("ad_market_signals"."disclosed_metrics") = 'object'),
	CONSTRAINT "ad_market_signals_metrics_bounded" CHECK (octet_length("ad_market_signals"."disclosed_metrics"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "ad_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"variant_id" uuid,
	"source" varchar(40) DEFAULT 'vk_ads' NOT NULL,
	"external_object_id" varchar(160) NOT NULL,
	"granularity" "ad_metric_granularity" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"form_opens" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_metric_snapshots_period_valid" CHECK ("ad_metric_snapshots"."period_end" > "ad_metric_snapshots"."period_start"),
	CONSTRAINT "ad_metric_snapshots_nonnegative" CHECK ("ad_metric_snapshots"."spend" >= 0 AND "ad_metric_snapshots"."impressions" >= 0 AND "ad_metric_snapshots"."reach" >= 0 AND "ad_metric_snapshots"."clicks" >= 0 AND "ad_metric_snapshots"."form_opens" >= 0 AND "ad_metric_snapshots"."leads" >= 0),
	CONSTRAINT "ad_metric_snapshots_extras_object" CHECK (jsonb_typeof("ad_metric_snapshots"."extras") = 'object'),
	CONSTRAINT "ad_metric_snapshots_extras_bounded" CHECK (octet_length("ad_metric_snapshots"."extras"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "ad_research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"publisher" varchar(240) NOT NULL,
	"source_type" "ad_research_source_type" NOT NULL,
	"channel" "ad_channel" NOT NULL,
	"published_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_grade" "ad_evidence_grade" NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_research_sources_url_nonempty" CHECK (length(btrim("ad_research_sources"."url")) > 0),
	CONSTRAINT "ad_research_sources_publisher_nonempty" CHECK (length(btrim("ad_research_sources"."publisher")) > 0),
	CONSTRAINT "ad_research_sources_fingerprint_sha256" CHECK ("ad_research_sources"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ad_research_sources_metadata_object" CHECK (jsonb_typeof("ad_research_sources"."metadata") = 'object'),
	CONSTRAINT "ad_research_sources_metadata_bounded" CHECK (octet_length("ad_research_sources"."metadata"::text) <= 16384)
);
--> statement-breakpoint
ALTER TABLE "ad_experiment_events" ADD CONSTRAINT "ad_experiment_events_experiment_id_ad_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ad_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_experiment_events" ADD CONSTRAINT "ad_experiment_events_variant_id_ad_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_experiment_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_experiment_variants" ADD CONSTRAINT "ad_experiment_variants_experiment_id_ad_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ad_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_experiments" ADD CONSTRAINT "ad_experiments_hypothesis_id_ad_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."ad_hypotheses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_lead_attributions" ADD CONSTRAINT "ad_lead_attributions_experiment_id_ad_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ad_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_lead_attributions" ADD CONSTRAINT "ad_lead_attributions_variant_id_ad_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_experiment_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_hypothesis_id_ad_hypotheses_id_fk" FOREIGN KEY ("hypothesis_id") REFERENCES "public"."ad_hypotheses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_experiment_id_ad_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ad_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_learnings" ADD CONSTRAINT "ad_learnings_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."ad_learnings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_market_signals" ADD CONSTRAINT "ad_market_signals_source_id_ad_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ad_research_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_metric_snapshots" ADD CONSTRAINT "ad_metric_snapshots_experiment_id_ad_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."ad_experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_metric_snapshots" ADD CONSTRAINT "ad_metric_snapshots_variant_id_ad_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_experiment_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_command_receipts_idempotency_key_uq" ON "ad_command_receipts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ad_command_receipts_status_created_idx" ON "ad_command_receipts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ad_experiment_events_experiment_created_idx" ON "ad_experiment_events" USING btree ("experiment_id","created_at");--> statement-breakpoint
CREATE INDEX "ad_experiment_events_action_created_idx" ON "ad_experiment_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_experiment_variants_experiment_role_uq" ON "ad_experiment_variants" USING btree ("experiment_id","role");--> statement-breakpoint
CREATE INDEX "ad_experiment_variants_experiment_status_idx" ON "ad_experiment_variants" USING btree ("experiment_id","status");--> statement-breakpoint
CREATE INDEX "ad_experiments_status_created_idx" ON "ad_experiments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ad_experiments_hypothesis_idx" ON "ad_experiments" USING btree ("hypothesis_id","hypothesis_version");--> statement-breakpoint
CREATE INDEX "ad_hypotheses_status_created_idx" ON "ad_hypotheses" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_lead_attributions_lead_uuid_uq" ON "ad_lead_attributions" USING btree ("lead_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_lead_attributions_external_hash_uq" ON "ad_lead_attributions" USING btree ("external_lead_hash") WHERE "ad_lead_attributions"."external_lead_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ad_lead_attributions_experiment_class_idx" ON "ad_lead_attributions" USING btree ("experiment_id","classification");--> statement-breakpoint
CREATE INDEX "ad_learnings_confidence_created_idx" ON "ad_learnings" USING btree ("confidence","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_market_signals_fingerprint_uq" ON "ad_market_signals" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "ad_market_signals_source_created_idx" ON "ad_market_signals" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_metric_snapshots_object_period_uq" ON "ad_metric_snapshots" USING btree ("source","external_object_id","granularity","period_start","period_end");--> statement-breakpoint
CREATE INDEX "ad_metric_snapshots_experiment_period_idx" ON "ad_metric_snapshots" USING btree ("experiment_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_research_sources_fingerprint_uq" ON "ad_research_sources" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "ad_research_sources_channel_discovered_idx" ON "ad_research_sources" USING btree ("channel","discovered_at");