-- AlterTable
ALTER TABLE `integration_settings` MODIFY `kind` ENUM('email', 'database', 'sms', 'webhook', 'push', 'calendar', 'contacts', 'queue', 'other') NOT NULL;
