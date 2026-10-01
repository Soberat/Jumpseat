CREATE TABLE `flight` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`flight_number` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`departure_date` text NOT NULL,
	`departure_time` text,
	`standby` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share_link` (
	`token` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trip`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `standby_load` (
	`id` text PRIMARY KEY NOT NULL,
	`flight_id` text NOT NULL,
	`cabin` text DEFAULT 'economy' NOT NULL,
	`seats_available` integer NOT NULL,
	`standby_listed` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`flight_id`) REFERENCES `flight`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trip` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`destination` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`timezone` text,
	`start_date` text,
	`end_date` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
