-- AlterTable
ALTER TABLE `users` ADD COLUMN `password_hash` VARCHAR(191) NULL,
    MODIFY `role` ENUM('owner', 'delegate', 'platform_admin', 'manager') NOT NULL;

-- CreateTable
CREATE TABLE `manager_clients` (
    `id` VARCHAR(191) NOT NULL,
    `manager_user_id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `manager_clients_manager_user_id_client_id_key`(`manager_user_id`, `client_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `manager_clients` ADD CONSTRAINT `manager_clients_manager_user_id_fkey` FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `manager_clients` ADD CONSTRAINT `manager_clients_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
