CREATE TABLE "pin_config" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"backup_code_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "categorization_hints" text;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD COLUMN "institution" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "institution" text;