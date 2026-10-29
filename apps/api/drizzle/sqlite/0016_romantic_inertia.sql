CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`monthly_amount` real NOT NULL,
	`rollover` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budgets_user_id_idx` ON `budgets` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_profile_category_unique` ON `budgets` (`profile_id`,`category`);