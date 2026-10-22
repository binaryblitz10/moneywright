ALTER TABLE `sms_messages` ADD `transaction_date` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `sms_verified` integer DEFAULT false NOT NULL;