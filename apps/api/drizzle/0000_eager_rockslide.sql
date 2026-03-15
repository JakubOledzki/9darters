CREATE TABLE `auth_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`remember_me` boolean NOT NULL DEFAULT false,
	`expires_at` varchar(40) NOT NULL,
	`created_at` varchar(40) NOT NULL,
	`last_seen_at` varchar(40) NOT NULL,
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `follows` (
	`follower_user_id` varchar(36) NOT NULL,
	`followed_user_id` varchar(36) NOT NULL,
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `follows_follower_user_id_followed_user_id_pk` PRIMARY KEY(`follower_user_id`,`followed_user_id`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` varchar(36) NOT NULL,
	`nickname` varchar(50) NOT NULL,
	`ip_address` varchar(64) NOT NULL,
	`success` boolean NOT NULL DEFAULT false,
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_events` (
	`id` varchar(36) NOT NULL,
	`match_id` varchar(36) NOT NULL,
	`actor_participant_id` varchar(36),
	`event_type` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `match_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_participants` (
	`id` varchar(36) NOT NULL,
	`match_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`display_name` varchar(100) NOT NULL,
	`order_index` int NOT NULL,
	`participant_status` enum('pending','accepted','declined') NOT NULL DEFAULT 'accepted',
	`accepted_at` varchar(40),
	`joined_at` varchar(40),
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `match_participants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`match_mode` enum('501','301','cricket','around-the-clock') NOT NULL,
	`match_kind` enum('offline','duel','tournament','training') NOT NULL,
	`match_status` enum('pending','accepted','ready','live','finished','declined','expired') NOT NULL DEFAULT 'pending',
	`is_ranking` boolean NOT NULL DEFAULT false,
	`counting_mode` enum('default','simplified') NOT NULL DEFAULT 'simplified',
	`double_out` boolean NOT NULL DEFAULT false,
	`legs_to_win` int NOT NULL,
	`sets_to_win` int NOT NULL,
	`created_by_user_id` varchar(36) NOT NULL,
	`tournament_id` varchar(36),
	`current_player_index` int NOT NULL DEFAULT 0,
	`starter_index` int NOT NULL DEFAULT 0,
	`winner_participant_id` varchar(36),
	`config_json` json NOT NULL,
	`state_json` json NOT NULL,
	`created_at` varchar(40) NOT NULL,
	`updated_at` varchar(40) NOT NULL,
	`started_at` varchar(40),
	`finished_at` varchar(40),
	CONSTRAINT `matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` varchar(500) NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`is_read` boolean NOT NULL DEFAULT false,
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rating_ledger` (
	`id` varchar(36) NOT NULL,
	`player_user_id` varchar(36) NOT NULL,
	`opponent_user_id` varchar(36) NOT NULL,
	`match_id` varchar(36) NOT NULL,
	`delta` int NOT NULL,
	`rating_before` int NOT NULL,
	`rating_after` int NOT NULL,
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `rating_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tournament_participants` (
	`id` varchar(36) NOT NULL,
	`tournament_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`display_name` varchar(50) NOT NULL,
	`participant_status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`accepted_at` varchar(40),
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `tournament_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tournament_participants_unique` UNIQUE(`tournament_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`match_mode` enum('501','301','cricket','around-the-clock') NOT NULL,
	`tournament_status` enum('pending','ready','live','finished','cancelled') NOT NULL DEFAULT 'pending',
	`is_ranking` boolean NOT NULL DEFAULT false,
	`counting_mode` enum('default','simplified') NOT NULL DEFAULT 'simplified',
	`double_out` boolean NOT NULL DEFAULT false,
	`legs_to_win` int NOT NULL,
	`sets_to_win` int NOT NULL,
	`created_by_user_id` varchar(36) NOT NULL,
	`created_at` varchar(40) NOT NULL,
	`updated_at` varchar(40) NOT NULL,
	CONSTRAINT `tournaments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`training_mode` enum('around-the-clock','doubles-practice','trebles-practice','bull-practice') NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'finished',
	`summary_json` json NOT NULL,
	`created_at` varchar(40) NOT NULL,
	`updated_at` varchar(40) NOT NULL,
	CONSTRAINT `training_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`nickname` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`rating` int NOT NULL DEFAULT 500,
	`created_at` varchar(40) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_nickname_unique` UNIQUE(`nickname`)
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_index` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `follows_follower_index` ON `follows` (`follower_user_id`);--> statement-breakpoint
CREATE INDEX `follows_followed_index` ON `follows` (`followed_user_id`);--> statement-breakpoint
CREATE INDEX `match_events_match_index` ON `match_events` (`match_id`);--> statement-breakpoint
CREATE INDEX `match_participants_match_index` ON `match_participants` (`match_id`);--> statement-breakpoint
CREATE INDEX `match_participants_user_index` ON `match_participants` (`user_id`);--> statement-breakpoint
CREATE INDEX `matches_status_index` ON `matches` (`match_status`);--> statement-breakpoint
CREATE INDEX `matches_tournament_index` ON `matches` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_unread_index` ON `notifications` (`user_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `rating_ledger_player_index` ON `rating_ledger` (`player_user_id`);--> statement-breakpoint
CREATE INDEX `tournament_participants_tournament_index` ON `tournament_participants` (`tournament_id`);--> statement-breakpoint
CREATE INDEX `tournaments_status_index` ON `tournaments` (`tournament_status`);--> statement-breakpoint
CREATE INDEX `training_sessions_user_index` ON `training_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `users_rating_index` ON `users` (`rating`);