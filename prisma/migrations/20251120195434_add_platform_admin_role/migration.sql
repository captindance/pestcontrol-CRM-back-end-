-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('owner', 'delegate', 'platform_admin') NOT NULL;
