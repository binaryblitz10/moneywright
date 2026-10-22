ALTER TABLE "sms_messages" ADD COLUMN "transaction_date" varchar(10);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "sms_verified" boolean DEFAULT false NOT NULL;