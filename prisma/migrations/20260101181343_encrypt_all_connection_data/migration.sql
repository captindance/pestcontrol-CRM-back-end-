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
  - Added the required column `data_enc_cipher` to the `database_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `data_enc_iv` to the `database_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `data_enc_tag` to the `database_connections` table without a default value. This is not possible if the table is not empty.

*/

-- Add new columns with temporary defaults
ALTER TABLE `database_connections` 
    ADD COLUMN `data_enc_cipher` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `data_enc_iv` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `data_enc_tag` VARCHAR(191) NOT NULL DEFAULT '';

-- NOTE: After this migration runs, you MUST run: npx tsx scripts/migrate-encryption.ts
-- to convert the old data format to the new encrypted format

-- Then manually run the following SQL to drop the old columns:
-- ALTER TABLE `database_connections` 
--     DROP COLUMN `database_name`,
--     DROP COLUMN `engine`,
--     DROP COLUMN `host`,
--     DROP COLUMN `options_json`,
--     DROP COLUMN `port`,
--     DROP COLUMN `secrets_enc_cipher`,
--     DROP COLUMN `secrets_enc_iv`,
--     DROP COLUMN `secrets_enc_tag`,
--     DROP COLUMN `username`;


