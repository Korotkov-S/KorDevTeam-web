CREATE TABLE "seo_competitor_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_rank_checks" ADD COLUMN "serp" jsonb;--> statement-breakpoint
CREATE INDEX "seo_competitor_reports_snapshot_idx" ON "seo_competitor_reports" USING btree ("snapshot_id","created_at");