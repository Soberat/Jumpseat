ALTER TABLE `flight` ADD `arrival_date` text;--> statement-breakpoint
ALTER TABLE `flight` ADD `arrival_time` text;--> statement-breakpoint
ALTER TABLE `flight` ADD `duration_minutes` integer;--> statement-breakpoint
ALTER TABLE `share_link` ADD `can_edit` integer DEFAULT false NOT NULL;