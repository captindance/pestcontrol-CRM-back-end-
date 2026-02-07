-- AlterTable
ALTER TABLE `reports` ADD COLUMN `connection_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `database_connections` (
    `id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `engine` VARCHAR(191) NOT NULL,
    `host` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL,
    `database_name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `secrets_enc_iv` VARCHAR(191) NOT NULL,
    `secrets_enc_tag` VARCHAR(191) NOT NULL,
    `secrets_enc_cipher` VARCHAR(191) NOT NULL,
    `options_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `database_connections_client_id_idx`(`client_id`),
    INDEX `database_connections_client_id_name_idx`(`client_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `reports_connection_id_idx` ON `reports`(`connection_id`);

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `database_connections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `database_connections` ADD CONSTRAINT `database_connections_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
