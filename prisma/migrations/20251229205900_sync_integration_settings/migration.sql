/*
  Warnings:

  - You are about to drop the `email_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `external_db_credentials` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `external_db_credentials` DROP FOREIGN KEY `external_db_credentials_client_id_fkey`;

-- DropTable
DROP TABLE `email_settings`;

-- DropTable
DROP TABLE `external_db_credentials`;

-- CreateTable
CREATE TABLE `integration_settings` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('email', 'database', 'sms', 'webhook', 'push', 'calendar', 'contacts', 'other') NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NULL,
    `config_json` JSON NOT NULL,
    `secrets_enc_iv` VARCHAR(191) NOT NULL,
    `secrets_enc_tag` VARCHAR(191) NOT NULL,
    `secrets_enc_cipher` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `integration_settings_kind_provider_idx`(`kind`, `provider`),
    INDEX `integration_settings_client_id_idx`(`client_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
