CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`spent_on` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `packing_item` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`label` text NOT NULL,
	`packed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
