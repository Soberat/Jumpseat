CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`item_id` text,
	`flight_id` text,
	`expense_id` text,
	`kind` text NOT NULL,
	`label` text,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `timeline_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`flight_id`) REFERENCES `flight`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exchange_rate` (
	`date` text PRIMARY KEY NOT NULL,
	`rates` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_member` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `expense` ADD `paid_by` text REFERENCES trip_member(id);--> statement-breakpoint
ALTER TABLE `expense` ADD `split_with` text;--> statement-breakpoint
ALTER TABLE `expense` ADD `transfer` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trip` ADD `settle_currency` text DEFAULT 'PLN' NOT NULL;