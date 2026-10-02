ALTER TABLE `expense` ADD `item_id` text REFERENCES timeline_item(id);--> statement-breakpoint
ALTER TABLE `expense` ADD `flight_id` text REFERENCES flight(id);--> statement-breakpoint
ALTER TABLE `expense` ADD `payment_status` text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE `expense` ADD `due_date` text;--> statement-breakpoint
-- Move booking costs into linked expenses before dropping the old columns.
INSERT INTO `expense` (`id`, `trip_id`, `description`, `amount_minor`, `currency`, `category`, `flight_id`, `payment_status`, `due_date`)
SELECT lower(hex(randomblob(16))), `trip_id`, `flight_number` || ' ' || `origin` || '→' || `destination`, `cost_minor`, `cost_currency`, 'flights', `id`, coalesce(`payment_status`, 'paid'), `due_date`
FROM `flight` WHERE `cost_minor` IS NOT NULL AND `cost_currency` IS NOT NULL;--> statement-breakpoint
INSERT INTO `expense` (`id`, `trip_id`, `description`, `amount_minor`, `currency`, `category`, `item_id`, `payment_status`, `due_date`)
SELECT lower(hex(randomblob(16))), `trip_id`, `title`, `cost_minor`, `cost_currency`,
  CASE `kind` WHEN 'stay' THEN 'stay' WHEN 'car' THEN 'transport' WHEN 'transport' THEN 'transport' WHEN 'restaurant' THEN 'food' ELSE 'activities' END,
  `id`, coalesce(`payment_status`, 'paid'), `due_date`
FROM `timeline_item` WHERE `cost_minor` IS NOT NULL AND `cost_currency` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `flight` DROP COLUMN `cost_minor`;--> statement-breakpoint
ALTER TABLE `flight` DROP COLUMN `cost_currency`;--> statement-breakpoint
ALTER TABLE `flight` DROP COLUMN `payment_status`;--> statement-breakpoint
ALTER TABLE `flight` DROP COLUMN `due_date`;--> statement-breakpoint
ALTER TABLE `timeline_item` DROP COLUMN `cost_minor`;--> statement-breakpoint
ALTER TABLE `timeline_item` DROP COLUMN `cost_currency`;--> statement-breakpoint
ALTER TABLE `timeline_item` DROP COLUMN `payment_status`;--> statement-breakpoint
ALTER TABLE `timeline_item` DROP COLUMN `due_date`;