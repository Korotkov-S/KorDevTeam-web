CREATE TABLE "content_view_rate_limits" (
	"key" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_view_rate_limits_key_bucket_start_pk" PRIMARY KEY("key","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "content_view_receipts" (
	"session_hash" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_view_receipts_session_hash_entry_id_pk" PRIMARY KEY("session_hash","entry_id")
);
--> statement-breakpoint
CREATE TABLE "content_view_sessions" (
	"session_hash" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_view_totals" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "content_view_totals_nonnegative" CHECK ("content_view_totals"."views" >= 0)
);
--> statement-breakpoint
ALTER TABLE "content_view_receipts" ADD CONSTRAINT "content_view_receipts_session_hash_content_view_sessions_session_hash_fk" FOREIGN KEY ("session_hash") REFERENCES "public"."content_view_sessions"("session_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_view_receipts" ADD CONSTRAINT "content_view_receipts_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_view_totals" ADD CONSTRAINT "content_view_totals_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_view_rate_limits_expiry" ON "content_view_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "content_view_sessions_expiry" ON "content_view_sessions" USING btree ("expires_at");