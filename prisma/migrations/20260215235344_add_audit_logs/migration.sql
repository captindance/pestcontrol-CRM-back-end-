-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `user_id` INTEGER NULL,
    `tenant_id` INTEGER NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `resource_type` VARCHAR(50) NULL,
    `resource_id` VARCHAR(50) NULL,
    `details` JSON NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_tenant_id_idx`(`tenant_id`),
    INDEX `audit_logs_action_severity_idx`(`action`, `severity`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_user_id_tenant_id_created_at_idx`(`user_id`, `tenant_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
