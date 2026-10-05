CREATE TABLE "geo_collection_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"repetition" integer NOT NULL,
	"lease_id" uuid NOT NULL,
	"token_id" uuid,
	"budget_date" date NOT NULL,
	"reserved_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"observation_id" uuid,
	CONSTRAINT "geo_collection_attempts_repetition_valid" CHECK ("geo_collection_attempts"."repetition" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "geo_collection_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_text" text NOT NULL,
	"platform" "geo_platform" NOT NULL,
	"surface" varchar(120) NOT NULL,
	"mode" "geo_run_mode" DEFAULT 'live_ui' NOT NULL,
	"language" varchar(16) NOT NULL,
	"region" varchar(120) NOT NULL,
	"state" varchar(24) DEFAULT 'queued' NOT NULL,
	"run_id" uuid,
	"lease_id" uuid,
	"completed_repetitions" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"error_code" varchar(120),
	CONSTRAINT "geo_collection_jobs_state_valid" CHECK ("geo_collection_jobs"."state" IN ('queued','running','retry_wait','blocked','complete','cancelled')),
	CONSTRAINT "geo_collection_jobs_counts_valid" CHECK ("geo_collection_jobs"."completed_repetitions" BETWEEN 0 AND 3 AND "geo_collection_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "geo_collection_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"token_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "geo_coverage_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"prompt_ids" uuid[] NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "geo_runs" ADD COLUMN "collection_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "geo_runs" ADD COLUMN "session_personalized" boolean;--> statement-breakpoint
ALTER TABLE "geo_runs" ADD COLUMN "previous_run_id" uuid;--> statement-breakpoint
ALTER TABLE "geo_collection_attempts" ADD CONSTRAINT "geo_collection_attempts_run_id_geo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_attempts" ADD CONSTRAINT "geo_collection_attempts_prompt_id_geo_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."geo_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_attempts" ADD CONSTRAINT "geo_collection_attempts_lease_id_geo_collection_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."geo_collection_leases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_attempts" ADD CONSTRAINT "geo_collection_attempts_token_id_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_jobs" ADD CONSTRAINT "geo_collection_jobs_cycle_id_geo_coverage_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."geo_coverage_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_jobs" ADD CONSTRAINT "geo_collection_jobs_prompt_id_geo_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."geo_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_jobs" ADD CONSTRAINT "geo_collection_jobs_run_id_geo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_jobs" ADD CONSTRAINT "geo_collection_jobs_lease_id_geo_collection_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."geo_collection_leases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_leases" ADD CONSTRAINT "geo_collection_leases_run_id_geo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_collection_leases" ADD CONSTRAINT "geo_collection_leases_token_id_mcp_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_collection_attempts_budget_idx" ON "geo_collection_attempts" USING btree ("budget_date");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_collection_jobs_key_uq" ON "geo_collection_jobs" USING btree ("cycle_id","platform","surface","mode","language","region","prompt_id");--> statement-breakpoint
CREATE INDEX "geo_collection_jobs_due_idx" ON "geo_collection_jobs" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "geo_collection_leases_run_idx" ON "geo_collection_leases" USING btree ("run_id");