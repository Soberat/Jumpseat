CREATE TABLE `trip_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`request` text NOT NULL,
	`plan` text,
	`error` text,
	`applied_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
