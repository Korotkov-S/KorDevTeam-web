CREATE TABLE "admin_password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"login_hash" varchar(64) NOT NULL,
	"request_ip_hash" varchar(64) NOT NULL,
	"token_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "admin_password_reset_requests_login_hash_sha256" CHECK ("admin_password_reset_requests"."login_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_password_reset_requests_ip_hash_sha256" CHECK ("admin_password_reset_requests"."request_ip_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_password_reset_requests_token_hash_sha256" CHECK ("admin_password_reset_requests"."token_hash" IS NULL OR "admin_password_reset_requests"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_password_reset_requests_expiry_valid" CHECK ("admin_password_reset_requests"."expires_at" > "admin_password_reset_requests"."created_at"),
	CONSTRAINT "admin_password_reset_requests_token_owner_pair" CHECK (("admin_password_reset_requests"."token_hash" IS NULL) = ("admin_password_reset_requests"."admin_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "admin_password_reset_requests" ADD CONSTRAINT "admin_password_reset_requests_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_password_reset_requests_token_hash_uq" ON "admin_password_reset_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_password_reset_requests_ip_created_idx" ON "admin_password_reset_requests" USING btree ("request_ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "admin_password_reset_requests_login_created_idx" ON "admin_password_reset_requests" USING btree ("login_hash","created_at");--> statement-breakpoint
CREATE INDEX "admin_password_reset_requests_expires_at_idx" ON "admin_password_reset_requests" USING btree ("expires_at");