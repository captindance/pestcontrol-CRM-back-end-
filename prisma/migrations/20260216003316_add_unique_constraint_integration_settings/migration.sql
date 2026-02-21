/*
  Warnings:

  - A unique constraint covering the columns `[kind,provider,client_id]` on the table `integration_settings` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `integration_settings_kind_provider_client_id_key` ON `integration_settings`(`kind`, `provider`, `client_id`);
