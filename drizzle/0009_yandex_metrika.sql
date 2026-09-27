CREATE TYPE "public"."seo_traffic_slice" AS ENUM('overall', 'device', 'region', 'page');--> statement-breakpoint
ALTER TABLE "seo_collection_runs" DROP CONSTRAINT "seo_collection_runs_source_seo_sources_id_fk";--> statement-breakpoint
ALTER TABLE "seo_daily_metrics" DROP CONSTRAINT "seo_daily_metrics_source_region_fk";--> statement-breakpoint
ALTER TABLE "seo_regions" DROP CONSTRAINT "seo_regions_source_seo_sources_id_fk";--> statement-breakpoint
ALTER TYPE "public"."seo_source" RENAME TO "seo_source_old";--> statement-breakpoint
CREATE TYPE "public"."seo_source" AS ENUM('yandex_webmaster', 'google_search_console', 'yandex_metrika');--> statement-breakpoint
ALTER TABLE "seo_sources" ALTER COLUMN "id" TYPE "public"."seo_source" USING "id"::text::"public"."seo_source";--> statement-breakpoint
ALTER TABLE "seo_collection_runs" ALTER COLUMN "source" TYPE "public"."seo_source" USING "source"::text::"public"."seo_source";--> statement-breakpoint
ALTER TABLE "seo_daily_metrics" ALTER COLUMN "source" TYPE "public"."seo_source" USING "source"::text::"public"."seo_source";--> statement-breakpoint
ALTER TABLE "seo_regions" ALTER COLUMN "source" TYPE "public"."seo_source" USING "source"::text::"public"."seo_source";--> statement-breakpoint
DROP TYPE "public"."seo_source_old";--> statement-breakpoint
ALTER TABLE "seo_collection_runs" ADD CONSTRAINT "seo_collection_runs_source_seo_sources_id_fk" FOREIGN KEY ("source") REFERENCES "public"."seo_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_daily_metrics" ADD CONSTRAINT "seo_daily_metrics_source_region_fk" FOREIGN KEY ("source","region_id") REFERENCES "public"."seo_regions"("source","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_regions" ADD CONSTRAINT "seo_regions_source_seo_sources_id_fk" FOREIGN KEY ("source") REFERENCES "public"."seo_sources"("id") ON DELETE restrict ON UPDATE no action;
