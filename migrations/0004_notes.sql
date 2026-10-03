CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`email_key` text,
	`subject` text NOT NULL,
	`from` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_r2_key_unique` ON `notes` (`r2_key`);--> statement-breakpoint
CREATE INDEX `notes_user_id_created_at_id_idx` ON `notes` (`user_id`,`created_at`,`id`);