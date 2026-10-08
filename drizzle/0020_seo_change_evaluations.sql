CREATE TABLE "seo_change_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "change_id" uuid NOT NULL REFERENCES "seo_changes"("id") ON DELETE restrict,
  "source" varchar(40) NOT NULL,
  "checkpoint" integer NOT NULL,
  "evaluated_at" timestamp with time zone NOT NULL,
  "evidence_hash" varchar(64) NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seo_change_evaluations_source_valid" CHECK ("source" IN ('yandex_webmaster','google_search_console')),
  CONSTRAINT "seo_change_evaluations_checkpoint_valid" CHECK ("checkpoint" IN (7,14,28)),
  CONSTRAINT "seo_change_evaluations_hash_valid" CHECK ("evidence_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "seo_change_evaluations_result_object" CHECK (jsonb_typeof("result")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_change_evaluations_evidence_uq" ON "seo_change_evaluations" ("change_id","source","checkpoint","evidence_hash");
--> statement-breakpoint
CREATE INDEX "seo_change_evaluations_lookup_idx" ON "seo_change_evaluations" ("change_id","source","checkpoint","evaluated_at");
