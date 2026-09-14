CREATE TYPE "public"."lead_delivery_channel" AS ENUM('crm', 'email');--> statement-breakpoint
CREATE TYPE "public"."lead_delivery_status" AS ENUM('pending', 'processing', 'retry', 'delivered', 'terminal', 'manual_action');--> statement-breakpoint
CREATE TYPE "public"."lead_rate_limit_kind" AS ENUM('ip', 'phone', 'crm_token');--> statement-breakpoint
CREATE TABLE "lead_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"media_type" varchar(160) NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"scan_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lead_attachments_checksum_sha256" CHECK ("lead_attachments"."checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lead_attachments_byte_size_valid" CHECK ("lead_attachments"."byte_size" > 0 AND "lead_attachments"."byte_size" <= 26214400),
	CONSTRAINT "lead_attachments_scan_metadata_object" CHECK (jsonb_typeof("lead_attachments"."scan_metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "lead_delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" "lead_delivery_channel" NOT NULL,
	"status" "lead_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" varchar(255),
	"lease_expires_at" timestamp with time zone,
	"last_error_code" varchar(120),
	"vendor_request_id" varchar(255),
	"response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_delivery_jobs_attempt_count_non_negative" CHECK ("lead_delivery_jobs"."attempt_count" >= 0),
	CONSTRAINT "lead_delivery_jobs_lease_fields_paired" CHECK (("lead_delivery_jobs"."lease_owner" IS NULL) = ("lead_delivery_jobs"."lease_expires_at" IS NULL)),
	CONSTRAINT "lead_delivery_jobs_response_metadata_object" CHECK (jsonb_typeof("lead_delivery_jobs"."response_metadata") = 'object'),
	CONSTRAINT "lead_delivery_jobs_response_metadata_bounded" CHECK (octet_length("lead_delivery_jobs"."response_metadata"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "lead_rate_limits" (
	"kind" "lead_rate_limit_kind" NOT NULL,
	"subject_hash" varchar(64) NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lead_rate_limits_kind_subject_hash_window_started_at_pk" PRIMARY KEY("kind","subject_hash","window_started_at"),
	CONSTRAINT "lead_rate_limits_subject_hash_sha256" CHECK ("lead_rate_limits"."subject_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lead_rate_limits_count_non_negative" CHECK ("lead_rate_limits"."count" >= 0),
	CONSTRAINT "lead_rate_limits_expires_after_window" CHECK ("lead_rate_limits"."expires_at" > "lead_rate_limits"."window_started_at")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_key" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"description" text,
	"page_path" varchar(500) NOT NULL,
	"referrer" varchar(500),
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phone_hash" varchar(64) NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"consent_version" varchar(120) NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"success_response" jsonb NOT NULL,
	CONSTRAINT "leads_request_fingerprint_sha256" CHECK ("leads"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "leads_phone_hash_sha256" CHECK ("leads"."phone_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "leads_ip_hash_sha256" CHECK ("leads"."ip_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "leads_utm_object" CHECK (jsonb_typeof("leads"."utm") = 'object'),
	CONSTRAINT "leads_expires_after_acceptance" CHECK ("leads"."expires_at" > "leads"."accepted_at")
);
--> statement-breakpoint
ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_delivery_jobs" ADD CONSTRAINT "lead_delivery_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_attachments_lead_id_uq" ON "lead_attachments" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_attachments_object_key_uq" ON "lead_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "lead_attachments_expires_at_idx" ON "lead_attachments" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_delivery_jobs_lead_channel_uq" ON "lead_delivery_jobs" USING btree ("lead_id","channel");--> statement-breakpoint
CREATE INDEX "lead_delivery_jobs_due_idx" ON "lead_delivery_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "lead_delivery_jobs_lease_expires_at_idx" ON "lead_delivery_jobs" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "lead_rate_limits_expires_at_idx" ON "lead_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_submission_key_uq" ON "leads" USING btree ("submission_key");--> statement-breakpoint
CREATE INDEX "leads_expires_at_idx" ON "leads" USING btree ("expires_at");