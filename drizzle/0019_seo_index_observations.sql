CREATE TABLE "seo_index_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_entry_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "page_path" text NOT NULL,
  "url" text NOT NULL,
  "published_version" integer NOT NULL,
  "source" text NOT NULL,
  "checked_at" timestamptz NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "evidence" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "seo_index_source_check" CHECK ("source" IN ('yandex', 'google')),
  CONSTRAINT "seo_index_status_check" CHECK ("status" IN ('indexed','unconfirmed','not_indexed','canonical_conflict','excluded','failed')),
  CONSTRAINT "seo_index_version_check" CHECK ("published_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_index_observation_identity" ON "seo_index_observations" ("content_entry_id", "source", "checked_at");
--> statement-breakpoint
CREATE INDEX "seo_index_observation_lookup" ON "seo_index_observations" ("content_entry_id", "source", "checked_at" DESC);
