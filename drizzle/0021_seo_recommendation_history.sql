CREATE TABLE "seo_recommendation_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recommendation_id" uuid NOT NULL REFERENCES "seo_recommendations"("id") ON DELETE restrict,
  "event_type" varchar(20) NOT NULL,
  "before_snapshot" jsonb,
  "after_snapshot" jsonb NOT NULL,
  "reason" text NOT NULL,
  "actor" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_recommendation_history_type_valid" CHECK ("event_type" IN ('created','refreshed','revised','status')),
  CONSTRAINT "seo_recommendation_history_reason_valid" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "seo_recommendation_history_snapshots_valid" CHECK (("before_snapshot" IS NULL OR jsonb_typeof("before_snapshot")='object') AND jsonb_typeof("after_snapshot")='object' AND jsonb_typeof("actor")='object')
);
--> statement-breakpoint
CREATE INDEX "seo_recommendation_history_lookup_idx" ON "seo_recommendation_history" ("recommendation_id","created_at");
