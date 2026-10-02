ALTER TABLE `flight` ADD `cost_minor` integer;--> statement-breakpoint
ALTER TABLE `flight` ADD `cost_currency` text;--> statement-breakpoint
ALTER TABLE `flight` ADD `payment_status` text;--> statement-breakpoint
ALTER TABLE `flight` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `timeline_item` ADD `cost_minor` integer;--> statement-breakpoint
ALTER TABLE `timeline_item` ADD `cost_currency` text;--> statement-breakpoint
ALTER TABLE `timeline_item` ADD `payment_status` text;--> statement-breakpoint
ALTER TABLE `timeline_item` ADD `due_date` text;