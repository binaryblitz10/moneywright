CREATE TABLE `transaction_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`match_terms` text NOT NULL,
	`transaction_type` text,
	`name` text,
	`category` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transaction_rules_user_id_idx` ON `transaction_rules` (`user_id`);