CREATE TABLE "subscription_overrides" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"merchant_key" text NOT NULL,
	"frequency" varchar(20),
	"is_removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_overrides_user_merchant_unique" UNIQUE("user_id","merchant_key")
);
--> statement-breakpoint
ALTER TABLE "subscription_overrides" ADD CONSTRAINT "subscription_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;