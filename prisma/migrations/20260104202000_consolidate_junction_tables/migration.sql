-- Create consolidated user_client table with role-based access
CREATE TABLE `user_client` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `role` ENUM('business_owner','delegate','viewer','manager') NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `user_client_userId_clientId_role_key` UNIQUE (`user_id`, `client_id`, `role`),
  CONSTRAINT `user_client_userId_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `user_client_clientId_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE,
  INDEX `idx_client_id` (`client_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_user_client_active` (`user_id`, `client_id`, `active`)
);

-- Migrate data from owner_clients to user_client
INSERT INTO `user_client` (`user_id`, `client_id`, `role`, `active`, `created_at`, `updated_at`)
SELECT `user_id`, `client_id`, 'business_owner', true, `created_at`, `created_at`
FROM `owner_clients`;

-- Migrate data from delegate_clients to user_client
INSERT INTO `user_client` (`user_id`, `client_id`, `role`, `active`, `created_at`, `updated_at`)
SELECT `user_id`, `client_id`, 'delegate', true, `created_at`, `created_at`
FROM `delegate_clients`;

-- Migrate data from viewer_clients to user_client
INSERT INTO `user_client` (`user_id`, `client_id`, `role`, `active`, `created_at`, `updated_at`)
SELECT `user_id`, `client_id`, 'viewer', true, `created_at`, `created_at`
FROM `viewer_clients`;

-- Migrate data from manager_clients to user_client (manager role with active flag preserved)
INSERT INTO `user_client` (`user_id`, `client_id`, `role`, `active`, `created_at`, `updated_at`)
SELECT `manager_user_id`, `client_id`, 'manager', `active`, `created_at`, `created_at`
FROM `manager_clients`;

-- Drop old junction tables
DROP TABLE `manager_clients`;
DROP TABLE `owner_clients`;
DROP TABLE `delegate_clients`;
DROP TABLE `viewer_clients`;
