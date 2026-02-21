-- AlterTable
ALTER TABLE `reports` ADD COLUMN `chart_image_data` LONGBLOB NULL,
    ADD COLUMN `chart_image_error` VARCHAR(191) NULL,
    ADD COLUMN `chart_image_generated_at` DATETIME(3) NULL;
