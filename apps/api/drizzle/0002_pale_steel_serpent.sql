ALTER TABLE `matches` MODIFY COLUMN `match_status` enum('pending','accepted','ready','live','finished','cancelled','declined','expired') NOT NULL DEFAULT 'pending';
