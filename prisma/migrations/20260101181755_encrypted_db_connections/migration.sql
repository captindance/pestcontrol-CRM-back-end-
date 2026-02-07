/*
  Warnings:

  - You are about to drop the column `database_name` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `engine` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `host` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `options_json` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `port` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `secrets_enc_cipher` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `secrets_enc_iv` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `secrets_enc_tag` on the `database_connections` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `database_connections` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `database_connections` DROP COLUMN `database_name`,
    DROP COLUMN `engine`,
    DROP COLUMN `host`,
    DROP COLUMN `options_json`,
    DROP COLUMN `port`,
    DROP COLUMN `secrets_enc_cipher`,
    DROP COLUMN `secrets_enc_iv`,
    DROP COLUMN `secrets_enc_tag`,
    DROP COLUMN `username`,
    ALTER COLUMN `data_enc_cipher` DROP DEFAULT,
    ALTER COLUMN `data_enc_iv` DROP DEFAULT,
    ALTER COLUMN `data_enc_tag` DROP DEFAULT;
