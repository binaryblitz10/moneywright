CREATE TABLE `auto_fix_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text,
	`trigger` text NOT NULL,
	`statement_ids` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auto_fix_batches_user_created_idx` ON `auto_fix_batches` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auto_fix_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`fixer` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`description` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `auto_fix_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auto_fix_changes_batch_id_idx` ON `auto_fix_changes` (`batch_id`);--> statement-breakpoint
CREATE TABLE `categorization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`transaction_id` text,
	`merchant_fingerprint` text,
	`description` text NOT NULL,
	`field` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`from_source` text,
	`action` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `categorization_events_user_created_idx` ON `categorization_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `categorization_events_user_merchant_idx` ON `categorization_events` (`user_id`,`merchant_fingerprint`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `learned_notes` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `learned_notes_updated_at` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `learned_notes_edited_at` text;--> statement-breakpoint
ALTER TABLE `statements` ADD `file_hash` text;--> statement-breakpoint
CREATE INDEX `statements_user_file_hash_idx` ON `statements` (`user_id`,`file_hash`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `merchant_fingerprint` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_source` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `name_source` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `duplicate_of_id` text;--> statement-breakpoint
CREATE INDEX `transactions_user_merchant_fingerprint_idx` ON `transactions` (`user_id`,`merchant_fingerprint`);