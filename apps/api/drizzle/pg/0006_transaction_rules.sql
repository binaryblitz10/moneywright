CREATE TABLE "transaction_rules" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"match_terms" text NOT NULL,
	"transaction_type" varchar(10),
	"name" text,
	"category" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_rules" ADD CONSTRAINT "transaction_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_rules_user_id_idx" ON "transaction_rules" USING btree ("user_id");