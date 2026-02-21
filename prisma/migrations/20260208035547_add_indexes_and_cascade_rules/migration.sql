/*
  Warnings:

  - A unique constraint covering the columns `[id,client_id]` on the table `database_connections` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `reports` DROP FOREIGN KEY `reports_client_id_fkey`;

-- CreateIndex
CREATE UNIQUE INDEX `database_connections_id_client_id_key` ON `database_connections`(`id`, `client_id`);

-- CreateIndex
CREATE INDEX `invitations_status_expires_at_idx` ON `invitations`(`status`, `expires_at`);

-- CreateIndex
CREATE INDEX `reports_client_id_status_deleted_at_idx` ON `reports`(`client_id`, `status`, `deleted_at`);

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `user_role_audit_log` RENAME INDEX `user_role_audit_log_user_role_id_fkey` TO `user_role_audit_log_user_role_id_idx`;
