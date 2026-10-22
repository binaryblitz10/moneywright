CREATE TABLE `sms_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guid` text NOT NULL,
	`sender` text NOT NULL,
	`received_at` text NOT NULL,
	`status` text NOT NULL,
	`body` text,
	`account_id` text,
	`transaction_id` text,
	`amount` text,
	`currency` text,
	`type` text,
	`merchant` text,
	`last4` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sms_messages_user_status_idx` ON `sms_messages` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `sms_messages_user_guid_unique` ON `sms_messages` (`user_id`,`guid`);