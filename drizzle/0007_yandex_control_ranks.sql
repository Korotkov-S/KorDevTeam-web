CREATE TYPE "public"."seo_rank_status" AS ENUM('found', 'not_found');--> statement-breakpoint
UPDATE "seo_regions"
SET "external_id" = CASE "code"
	WHEN 'ru' THEN '225'
	WHEN 'moscow' THEN '213'
	WHEN 'saint-petersburg' THEN '2'
	WHEN 'novosibirsk' THEN '65'
	WHEN 'ekaterinburg' THEN '54'
	WHEN 'kazan' THEN '43'
	WHEN 'nizhny-novgorod' THEN '47'
	WHEN 'krasnodar' THEN '35'
	ELSE "external_id"
END,
"updated_at" = now()
WHERE "source" = 'yandex_webmaster';--> statement-breakpoint
CREATE TABLE "seo_rank_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_date" date NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"query_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"device" "seo_device" NOT NULL,
	"status" "seo_rank_status" NOT NULL,
	"position" integer,
	"result_url" text,
	"result_limit" integer DEFAULT 100 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_rank_checks_device_supported" CHECK ("seo_rank_checks"."device" IN ('desktop', 'mobile')),
	CONSTRAINT "seo_rank_checks_position_range" CHECK ("seo_rank_checks"."position" IS NULL OR ("seo_rank_checks"."position" >= 1 AND "seo_rank_checks"."position" <= "seo_rank_checks"."result_limit")),
	CONSTRAINT "seo_rank_checks_limit_range" CHECK ("seo_rank_checks"."result_limit" >= 1 AND "seo_rank_checks"."result_limit" <= 100),
	CONSTRAINT "seo_rank_checks_result_coherent" CHECK (("seo_rank_checks"."status" = 'found' AND "seo_rank_checks"."position" IS NOT NULL AND "seo_rank_checks"."result_url" IS NOT NULL) OR ("seo_rank_checks"."status" = 'not_found' AND "seo_rank_checks"."position" IS NULL AND "seo_rank_checks"."result_url" IS NULL)),
	CONSTRAINT "seo_rank_checks_result_url_http" CHECK ("seo_rank_checks"."result_url" IS NULL OR "seo_rank_checks"."result_url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "seo_rank_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_date" date NOT NULL,
	"status" "seo_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"planned_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"stored_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "seo_rank_runs_counts_non_negative" CHECK ("seo_rank_runs"."planned_count" >= 0 AND "seo_rank_runs"."completed_count" >= 0 AND "seo_rank_runs"."stored_count" >= 0),
	CONSTRAINT "seo_rank_runs_completed_after_start" CHECK ("seo_rank_runs"."completed_at" IS NULL OR "seo_rank_runs"."completed_at" >= "seo_rank_runs"."started_at"),
	CONSTRAINT "seo_rank_runs_metadata_object" CHECK (jsonb_typeof("seo_rank_runs"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "seo_rank_checks" ADD CONSTRAINT "seo_rank_checks_query_id_seo_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."seo_queries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_rank_checks" ADD CONSTRAINT "seo_rank_checks_region_fk" FOREIGN KEY ("region_id") REFERENCES "public"."seo_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_rank_checks_daily_uq" ON "seo_rank_checks" USING btree ("check_date","query_id","region_id","device");--> statement-breakpoint
CREATE INDEX "seo_rank_checks_query_date_idx" ON "seo_rank_checks" USING btree ("query_id","check_date");--> statement-breakpoint
CREATE INDEX "seo_rank_checks_slice_idx" ON "seo_rank_checks" USING btree ("check_date","region_id","device");--> statement-breakpoint
CREATE INDEX "seo_rank_runs_date_started_idx" ON "seo_rank_runs" USING btree ("check_date","started_at");
