/*
  Warnings:

  - You are about to drop the column `email_verification_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `report_results` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_client` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[email,invitation_type,client_id]` on the table `invitations` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `database_connections` DROP FOREIGN KEY `database_connections_client_id_fkey`;

-- DropForeignKey
ALTER TABLE `report_results` DROP FOREIGN KEY `report_results_client_id_fkey`;

-- DropForeignKey
ALTER TABLE `report_results` DROP FOREIGN KEY `report_results_report_id_fkey`;

-- DropForeignKey
ALTER TABLE `user_client` DROP FOREIGN KEY `user_client_clientId_fkey`;

-- DropForeignKey
ALTER TABLE `user_client` DROP FOREIGN KEY `user_client_userId_fkey`;

-- DropIndex
DROP INDEX `invitations_email_client_id_invitation_type_key` ON `invitations`;

-- DropIndex
DROP INDEX `users_email_verification_token_key` ON `users`;

-- AlterTable
ALTER TABLE `database_connections` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `reports` ADD COLUMN `data_json` JSON NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `error` VARCHAR(191) NULL,
    ADD COLUMN `finished_at` DATETIME(3) NULL,
    ADD COLUMN `started_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `email_verification_token`,
    DROP COLUMN `role`;

-- DropTable
DROP TABLE `report_results`;

-- DropTable
DROP TABLE `user_client`;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `client_id` INTEGER NULL,
    `role` ENUM('platform_admin', 'business_owner', 'delegate', 'viewer', 'manager') NOT NULL,
    `can_view_reports` BOOLEAN NULL,
    `can_create_reports` BOOLEAN NULL,
    `can_edit_reports` BOOLEAN NULL,
    `can_delete_reports` BOOLEAN NULL,
    `can_manage_connections` BOOLEAN NULL,
    `can_invite_users` BOOLEAN NULL,
    `can_manage_users` BOOLEAN NULL,
    `manager_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_roles_client_id_idx`(`client_id`),
    INDEX `user_roles_user_id_idx`(`user_id`),
    INDEX `user_roles_user_id_client_id_manager_active_idx`(`user_id`, `client_id`, `manager_active`),
    INDEX `user_roles_user_id_role_idx`(`user_id`, `role`),
    UNIQUE INDEX `user_roles_user_id_client_id_role_key`(`user_id`, `client_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_role_audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_role_id` INTEGER NULL,
    `client_id` INTEGER NULL,
    `user_id` INTEGER NULL,
    `changed_by` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NULL,
    `old_value` VARCHAR(191) NULL,
    `new_value` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NULL,
    `request_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_role_audit_log_client_id_created_at_idx`(`client_id`, `created_at`),
    INDEX `user_role_audit_log_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `user_role_audit_log_changed_by_created_at_idx`(`changed_by`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `connection_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_role_id` INTEGER NOT NULL,
    `connection_id` INTEGER NOT NULL,
    `can_view` BOOLEAN NOT NULL DEFAULT true,
    `can_edit` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `connection_permissions_connection_id_idx`(`connection_id`),
    INDEX `connection_permissions_user_role_id_idx`(`user_role_id`),
    UNIQUE INDEX `connection_permissions_user_role_id_connection_id_key`(`user_role_id`, `connection_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `database_connections_client_id_deleted_at_idx` ON `database_connections`(`client_id`, `deleted_at`);

-- CreateIndex
CREATE UNIQUE INDEX `invitations_email_invitation_type_client_id_key` ON `invitations`(`email`, `invitation_type`, `client_id`);

-- CreateIndex
CREATE INDEX `reports_client_id_deleted_at_idx` ON `reports`(`client_id`, `deleted_at`);

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_audit_log` ADD CONSTRAINT `user_role_audit_log_user_role_id_fkey` FOREIGN KEY (`user_role_id`) REFERENCES `user_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `connection_permissions` ADD CONSTRAINT `connection_permissions_user_role_id_fkey` FOREIGN KEY (`user_role_id`) REFERENCES `user_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `connection_permissions` ADD CONSTRAINT `connection_permissions_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `database_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `database_connections` ADD CONSTRAINT `database_connections_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
