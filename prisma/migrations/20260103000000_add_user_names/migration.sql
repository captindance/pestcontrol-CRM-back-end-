-- Add first_name and last_name to users table
ALTER TABLE `users` ADD COLUMN `first_name` VARCHAR(191);
ALTER TABLE `users` ADD COLUMN `last_name` VARCHAR(191);
