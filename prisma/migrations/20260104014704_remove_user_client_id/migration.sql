/*
  Warnings:

  - You are about to drop the column `client_id` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_client_id_fkey`;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `client_id`;
