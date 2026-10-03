CREATE TABLE `mcp_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tokens_token_hash_unique` ON `mcp_tokens` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tokens_user_id_name_unique` ON `mcp_tokens` (`user_id`,`name`);--> statement-breakpoint
-- Give every users.mcp_token_hash a matching mcp_tokens row named "Default". The HMAC hash
-- is copied as-is, so the bearer token keeps authenticating.
INSERT INTO `mcp_tokens` (`id`, `user_id`, `name`, `token_hash`, `created_at`)
SELECT lower(hex(randomblob(4))), `id`, 'Default', `mcp_token_hash`, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `users` WHERE `mcp_token_hash` IS NOT NULL;
