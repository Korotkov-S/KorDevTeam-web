CREATE TABLE "mcp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "mcp_tokens_token_hash_sha256" CHECK ("mcp_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mcp_tokens_name_nonempty" CHECK (length(btrim("mcp_tokens"."name")) > 0),
	CONSTRAINT "mcp_tokens_scopes_nonempty" CHECK (cardinality("mcp_tokens"."scopes") > 0),
	CONSTRAINT "mcp_tokens_expiry_valid" CHECK ("mcp_tokens"."expires_at" IS NULL OR "mcp_tokens"."expires_at" > "mcp_tokens"."created_at")
);
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tokens_token_hash_uq" ON "mcp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mcp_tokens_admin_user_id_idx" ON "mcp_tokens" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "mcp_tokens_active_idx" ON "mcp_tokens" USING btree ("revoked_at","expires_at");