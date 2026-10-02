ALTER TABLE `timeline_item` ADD `day` integer;--> statement-breakpoint
-- Plan ideas added to undated trips used to carry their day only in the title ("Day 3: Fado").
UPDATE `timeline_item` SET `day` = CAST(substr(`title`, 5, instr(`title`, ':') - 5) AS INTEGER), `title` = substr(`title`, instr(`title`, ':') + 2) WHERE `start_date` IS NULL AND `title` GLOB 'Day [0-9]*: ?*';
