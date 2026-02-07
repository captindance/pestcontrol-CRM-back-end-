-- First modify the enum to include both old and new values
ALTER TABLE `users` MODIFY `role` ENUM('owner','business_owner','delegate','platform_admin','manager') NOT NULL;

-- Then update existing data
UPDATE `users` SET `role` = 'business_owner' WHERE `role` = 'owner';

-- Finally remove the old enum value
ALTER TABLE `users` MODIFY `role` ENUM('business_owner','delegate','platform_admin','manager') NOT NULL;
