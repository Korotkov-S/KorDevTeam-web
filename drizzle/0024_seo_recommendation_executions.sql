CREATE TABLE "seo_recommendation_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"approval_history_id" uuid NOT NULL,
	"approved_by_admin_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"approved_recommendation" jsonb NOT NULL,
	"recommendation_hash" varchar(64) NOT NULL,
	"approved_plan" jsonb NOT NULL,
	"content_entry_id" uuid NOT NULL,
	"base_snapshot" jsonb NOT NULL,
	"base_hash" varchar(64) NOT NULL,
	"superseded_at" timestamp with time zone,
	"applied_snapshot" jsonb,
	"applied_version" integer,
	"applied_hash" varchar(64),
	"applied_change_id" uuid,
	"applied_by_mcp_token_id" uuid,
	"applied_at" timestamp with time zone,
	"last_verification_attempt" jsonb,
	"completion" jsonb,
	"completion_hash" varchar(64),
	"completed_recommendation_hash" varchar(64),
	"completed_at" timestamp with time zone,
	CONSTRAINT "seo_execution_hashes_valid" CHECK ("seo_recommendation_executions"."base_hash" ~ '^[a-f0-9]{64}$' AND "seo_recommendation_executions"."recommendation_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "seo_execution_applied_complete" CHECK (COALESCE((("seo_recommendation_executions"."applied_at" IS NULL AND "seo_recommendation_executions"."applied_snapshot" IS NULL AND "seo_recommendation_executions"."applied_version" IS NULL AND "seo_recommendation_executions"."applied_hash" IS NULL AND "seo_recommendation_executions"."applied_change_id" IS NULL AND "seo_recommendation_executions"."applied_by_mcp_token_id" IS NULL) OR ("seo_recommendation_executions"."applied_at" IS NOT NULL AND "seo_recommendation_executions"."applied_snapshot" IS NOT NULL AND "seo_recommendation_executions"."applied_version" > 0 AND "seo_recommendation_executions"."applied_hash" ~ '^[a-f0-9]{64}$' AND "seo_recommendation_executions"."applied_change_id" IS NOT NULL AND "seo_recommendation_executions"."applied_by_mcp_token_id" IS NOT NULL)), false)),
	CONSTRAINT "seo_execution_completed_complete" CHECK (COALESCE((("seo_recommendation_executions"."completed_at" IS NULL AND "seo_recommendation_executions"."completion" IS NULL AND "seo_recommendation_executions"."completion_hash" IS NULL AND "seo_recommendation_executions"."completed_recommendation_hash" IS NULL) OR ("seo_recommendation_executions"."applied_at" IS NOT NULL AND "seo_recommendation_executions"."completed_at" IS NOT NULL AND "seo_recommendation_executions"."completion" IS NOT NULL AND "seo_recommendation_executions"."completion_hash" ~ '^[a-f0-9]{64}$' AND "seo_recommendation_executions"."completed_recommendation_hash" ~ '^[a-f0-9]{64}$')), false))
);
--> statement-breakpoint
ALTER TABLE "seo_recommendations" ADD COLUMN "execution_plan" jsonb;--> statement-breakpoint
ALTER TABLE "seo_recommendation_executions" ADD CONSTRAINT "seo_recommendation_executions_recommendation_id_seo_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."seo_recommendations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendation_executions" ADD CONSTRAINT "seo_recommendation_executions_approval_history_id_seo_recommendation_history_id_fk" FOREIGN KEY ("approval_history_id") REFERENCES "public"."seo_recommendation_history"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendation_executions" ADD CONSTRAINT "seo_recommendation_executions_approved_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("approved_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendation_executions" ADD CONSTRAINT "seo_recommendation_executions_content_entry_id_content_entries_id_fk" FOREIGN KEY ("content_entry_id") REFERENCES "public"."content_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendation_executions" ADD CONSTRAINT "seo_recommendation_executions_applied_change_id_seo_changes_id_fk" FOREIGN KEY ("applied_change_id") REFERENCES "public"."seo_changes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_recommendation_executions" ADD CONSTRAINT "seo_recommendation_executions_applied_by_mcp_token_id_mcp_tokens_id_fk" FOREIGN KEY ("applied_by_mcp_token_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_recommendation_execution_approval_uq" ON "seo_recommendation_executions" USING btree ("approval_history_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_recommendation_execution_active_uq" ON "seo_recommendation_executions" USING btree ("recommendation_id") WHERE "seo_recommendation_executions"."superseded_at" IS NULL;--> statement-breakpoint
ALTER TABLE "seo_recommendation_history" DROP CONSTRAINT "seo_recommendation_history_type_valid";--> statement-breakpoint
ALTER TABLE "seo_recommendation_history" ADD CONSTRAINT "seo_recommendation_history_type_valid" CHECK ("event_type" IN ('created','refreshed','revised','status','approval','execution_applied','execution_verified','execution_failed'));
