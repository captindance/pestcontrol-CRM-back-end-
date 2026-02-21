/*
  Warnings:

  - Added the required column `created_by` to the `report_schedules` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `report_schedules` DROP FOREIGN KEY `report_schedules_user_id_fkey`;

-- AlterTable
ALTER TABLE `report_schedule_recipients` ADD COLUMN `domain` VARCHAR(191) NULL,
    ADD COLUMN `is_external` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable - Add columns with temporary default for created_by
ALTER TABLE `report_schedules` ADD COLUMN `created_by` INTEGER NULL,
    ADD COLUMN `last_modified_at` DATETIME(3) NULL,
    ADD COLUMN `last_modified_by` INTEGER NULL;

-- Backfill created_by from user_id for existing schedules
UPDATE `report_schedules` SET `created_by` = `user_id` WHERE `created_by` IS NULL;

-- Backfill last_modified_at from updated_at for existing schedules
UPDATE `report_schedules` SET `last_modified_at` = `updated_at` WHERE `last_modified_at` IS NULL;

-- Now make created_by NOT NULL
ALTER TABLE `report_schedules` MODIFY COLUMN `created_by` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `user_roles` ADD COLUMN `can_schedule_reports` BOOLEAN NULL;

-- CreateIndex
CREATE INDEX `report_schedule_recipients_schedule_id_is_external_idx` ON `report_schedule_recipients`(`schedule_id`, `is_external`);

-- CreateIndex
CREATE INDEX `report_schedules_created_by_idx` ON `report_schedules`(`created_by`);

-- CreateIndex
CREATE INDEX `report_schedules_last_modified_by_idx` ON `report_schedules`(`last_modified_by`);

-- AddForeignKey
ALTER TABLE `report_schedules` ADD CONSTRAINT `report_schedules_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_schedules` ADD CONSTRAINT `report_schedules_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_schedules` ADD CONSTRAINT `report_schedules_last_modified_by_fkey` FOREIGN KEY (`last_modified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
