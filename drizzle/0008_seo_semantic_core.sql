CREATE TYPE "public"."seo_query_kind" AS ENUM('commercial', 'informational', 'other');--> statement-breakpoint
CREATE TYPE "public"."seo_query_status" AS ENUM('candidate', 'active', 'archived');--> statement-breakpoint
ALTER TABLE "seo_queries" ALTER COLUMN "tracked" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "seo_queries" ADD COLUMN "status" "seo_query_status" DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "seo_queries" ADD COLUMN "kind" "seo_query_kind" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "seo_queries" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "seo_queries"
SET "status" = CASE
	WHEN "origin" = 'api' THEN 'candidate'::"seo_query_status"
	WHEN "tracked" THEN 'active'::"seo_query_status"
	ELSE 'archived'::"seo_query_status"
END,
"tracked" = CASE WHEN "origin" = 'api' THEN false ELSE "tracked" END;--> statement-breakpoint
CREATE INDEX "seo_queries_status_priority_idx" ON "seo_queries" USING btree ("status","priority");--> statement-breakpoint
ALTER TABLE "seo_queries" ADD CONSTRAINT "seo_queries_priority_non_negative" CHECK ("seo_queries"."priority" >= 0);--> statement-breakpoint
ALTER TABLE "seo_queries" ADD CONSTRAINT "seo_queries_status_tracked_coherent" CHECK ("seo_queries"."tracked" = ("seo_queries"."status" = 'active'));
