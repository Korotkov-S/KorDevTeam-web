CREATE TYPE "public"."seo_traffic_slice" AS ENUM('overall', 'device', 'region', 'page');--> statement-breakpoint
ALTER TYPE "public"."seo_source" ADD VALUE 'yandex_metrika';--> statement-breakpoint
CREATE TABLE "seo_traffic_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_date" date NOT NULL,
	"source" "seo_source" NOT NULL,
	"slice" "seo_traffic_slice" NOT NULL,
	"dimension_key" varchar(500) NOT NULL,
	"dimension_label" varchar(500) NOT NULL,
	"page_path" varchar(500),
	"users" integer NOT NULL,
	"new_users" integer NOT NULL,
	"visits" integer NOT NULL,
	"pageviews" integer NOT NULL,
	"bounce_rate" numeric(9, 8) NOT NULL,
	"page_depth" numeric(12, 4) NOT NULL,
	"avg_visit_duration_seconds" numeric(12, 3) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_traffic_metrics_source_metrika" CHECK ("seo_traffic_metrics"."source" = 'yandex_metrika'),
	CONSTRAINT "seo_traffic_metrics_dimension_key_nonempty" CHECK (length(btrim("seo_traffic_metrics"."dimension_key")) > 0),
	CONSTRAINT "seo_traffic_metrics_dimension_label_nonempty" CHECK (length(btrim("seo_traffic_metrics"."dimension_label")) > 0),
	CONSTRAINT "seo_traffic_metrics_counts_non_negative" CHECK ("seo_traffic_metrics"."users" >= 0 AND "seo_traffic_metrics"."new_users" >= 0 AND "seo_traffic_metrics"."visits" >= 0 AND "seo_traffic_metrics"."pageviews" >= 0),
	CONSTRAINT "seo_traffic_metrics_new_users_valid" CHECK ("seo_traffic_metrics"."new_users" <= "seo_traffic_metrics"."users"),
	CONSTRAINT "seo_traffic_metrics_visits_valid" CHECK ("seo_traffic_metrics"."visits" >= "seo_traffic_metrics"."users"),
	CONSTRAINT "seo_traffic_metrics_pageviews_valid" CHECK ("seo_traffic_metrics"."pageviews" >= "seo_traffic_metrics"."visits"),
	CONSTRAINT "seo_traffic_metrics_bounce_rate_valid" CHECK ("seo_traffic_metrics"."bounce_rate" >= 0 AND "seo_traffic_metrics"."bounce_rate" <= 1),
	CONSTRAINT "seo_traffic_metrics_depth_valid" CHECK ("seo_traffic_metrics"."page_depth" >= 0),
	CONSTRAINT "seo_traffic_metrics_duration_valid" CHECK ("seo_traffic_metrics"."avg_visit_duration_seconds" >= 0),
	CONSTRAINT "seo_traffic_metrics_page_coherent" CHECK (("seo_traffic_metrics"."slice" = 'page' AND "seo_traffic_metrics"."page_path" IS NOT NULL AND "seo_traffic_metrics"."page_path" = "seo_traffic_metrics"."dimension_key") OR ("seo_traffic_metrics"."slice" <> 'page' AND "seo_traffic_metrics"."page_path" IS NULL)),
	CONSTRAINT "seo_traffic_metrics_page_path_valid" CHECK ("seo_traffic_metrics"."page_path" IS NULL OR "seo_traffic_metrics"."page_path" LIKE '/%')
);
--> statement-breakpoint
ALTER TABLE "seo_traffic_metrics" ADD CONSTRAINT "seo_traffic_metrics_source_seo_sources_id_fk" FOREIGN KEY ("source") REFERENCES "public"."seo_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_traffic_metrics_observation_uq" ON "seo_traffic_metrics" USING btree ("observation_date","source","slice","dimension_key");--> statement-breakpoint
CREATE INDEX "seo_traffic_metrics_slice_date_idx" ON "seo_traffic_metrics" USING btree ("slice","observation_date");--> statement-breakpoint
CREATE INDEX "seo_traffic_metrics_page_date_idx" ON "seo_traffic_metrics" USING btree ("page_path","observation_date");