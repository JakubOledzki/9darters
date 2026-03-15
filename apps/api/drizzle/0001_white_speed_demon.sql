ALTER TABLE `matches` ADD `play_mode` enum('online','stationary') DEFAULT 'online' NOT NULL;--> statement-breakpoint
UPDATE `matches` SET `play_mode` = 'stationary' WHERE `match_kind` = 'offline';--> statement-breakpoint
ALTER TABLE `tournaments` ADD `play_mode` enum('online','stationary') DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` boolean DEFAULT false NOT NULL;
