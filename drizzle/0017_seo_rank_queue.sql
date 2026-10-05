CREATE TABLE "seo_rank_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"query_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"target_path" text,
	"region_id" uuid NOT NULL,
	"external_region_id" integer NOT NULL,
	"device" "seo_device" NOT NULL,
	"state" varchar(24) DEFAULT 'queued' NOT NULL,
	"operation_id" varchar(200),
	"submit_attempts" integer DEFAULT 0 NOT NULL,
	"poll_error_attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"error_code" varchar(120),
	CONSTRAINT "seo_rank_jobs_state_valid" CHECK ("seo_rank_jobs"."state" IN ('queued','submitting','polling','stored','retry_wait','blocked','expired')),
	CONSTRAINT "seo_rank_jobs_counts_valid" CHECK ("seo_rank_jobs"."submit_attempts" >= 0 AND "seo_rank_jobs"."poll_error_attempts" >= 0),
	CONSTRAINT "seo_rank_jobs_device_valid" CHECK ("seo_rank_jobs"."device" IN ('desktop','mobile')),
	CONSTRAINT "seo_rank_jobs_polling_id" CHECK ("seo_rank_jobs"."state" <> 'polling' OR "seo_rank_jobs"."operation_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "seo_rank_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"budget_date" date NOT NULL,
	"reserved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seo_rank_submissions_attempt_positive" CHECK ("seo_rank_submissions"."attempt" > 0)
);
--> statement-breakpoint
ALTER TABLE "seo_rank_jobs" ADD CONSTRAINT "seo_rank_jobs_run_id_seo_rank_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."seo_rank_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_jobs" ADD CONSTRAINT "seo_rank_jobs_query_id_seo_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."seo_queries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_jobs" ADD CONSTRAINT "seo_rank_jobs_region_id_seo_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."seo_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_submissions" ADD CONSTRAINT "seo_rank_submissions_job_id_seo_rank_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."seo_rank_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_rank_jobs_matrix_uq" ON "seo_rank_jobs" USING btree ("run_id","query_id","region_id","device");--> statement-breakpoint
CREATE INDEX "seo_rank_jobs_due_idx" ON "seo_rank_jobs" USING btree ("run_id","state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_rank_submissions_attempt_uq" ON "seo_rank_submissions" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "seo_rank_submissions_budget_idx" ON "seo_rank_submissions" USING btree ("budget_date");