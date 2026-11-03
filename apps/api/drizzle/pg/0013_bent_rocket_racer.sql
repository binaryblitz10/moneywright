CREATE TABLE "auto_fix_batches" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"profile_id" varchar(21),
	"trigger" varchar(10) NOT NULL,
	"statement_ids" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auto_fix_changes" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"batch_id" varchar(21) NOT NULL,
	"fixer" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text NOT NULL,
	"before" text NOT NULL,
	"after" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categorization_events" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"profile_id" varchar(21) NOT NULL,
	"transaction_id" varchar(21),
	"merchant_fingerprint" text,
	"description" text NOT NULL,
	"field" varchar(10) NOT NULL,
	"from_value" text,
	"to_value" text,
	"from_source" varchar(10),
	"action" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "learned_notes" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "learned_notes_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "learned_notes_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "file_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_fingerprint" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_source" varchar(10);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "name_source" varchar(10);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "duplicate_of_id" varchar(21);--> statement-breakpoint
ALTER TABLE "auto_fix_batches" ADD CONSTRAINT "auto_fix_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_fix_batches" ADD CONSTRAINT "auto_fix_batches_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_fix_changes" ADD CONSTRAINT "auto_fix_changes_batch_id_auto_fix_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."auto_fix_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_events" ADD CONSTRAINT "categorization_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_events" ADD CONSTRAINT "categorization_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_fix_batches_user_created_idx" ON "auto_fix_batches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auto_fix_changes_batch_id_idx" ON "auto_fix_changes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "categorization_events_user_created_idx" ON "categorization_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "categorization_events_user_merchant_idx" ON "categorization_events" USING btree ("user_id","merchant_fingerprint");--> statement-breakpoint
CREATE INDEX "statements_user_file_hash_idx" ON "statements" USING btree ("user_id","file_hash");--> statement-breakpoint
CREATE INDEX "transactions_user_merchant_fingerprint_idx" ON "transactions" USING btree ("user_id","merchant_fingerprint");