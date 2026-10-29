CREATE TABLE "budgets" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"profile_id" varchar(21) NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"category" varchar(50) NOT NULL,
	"monthly_amount" numeric(15, 2) NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_profile_category_unique" UNIQUE("profile_id","category")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_user_id_idx" ON "budgets" USING btree ("user_id");