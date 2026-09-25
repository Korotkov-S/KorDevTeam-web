CREATE TABLE "content_release_items" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"kind" "content_kind" NOT NULL,
	"slug" varchar(160) NOT NULL,
	"release_id" uuid NOT NULL,
	"source_checksum" varchar(64) NOT NULL,
	"database_checksum" varchar(64) NOT NULL,
	"database_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_release_items_source_sha256" CHECK ("content_release_items"."source_checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_release_items_database_sha256" CHECK ("content_release_items"."database_checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_release_items_version_positive" CHECK ("content_release_items"."database_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "content_release_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_sha" varchar(40) NOT NULL,
	"manifest_checksum" varchar(64) NOT NULL,
	"inserted_count" integer NOT NULL,
	"updated_count" integer NOT NULL,
	"unchanged_count" integer NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_release_runs_sha_format" CHECK ("content_release_runs"."release_sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "content_release_runs_manifest_sha256" CHECK ("content_release_runs"."manifest_checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_release_runs_counts_non_negative" CHECK ("content_release_runs"."inserted_count" >= 0 AND "content_release_runs"."updated_count" >= 0 AND "content_release_runs"."unchanged_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "content_release_items" ADD CONSTRAINT "content_release_items_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_release_items" ADD CONSTRAINT "content_release_items_release_id_content_release_runs_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."content_release_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_release_items_kind_slug_uq" ON "content_release_items" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_release_runs_sha_manifest_uq" ON "content_release_runs" USING btree ("release_sha","manifest_checksum");