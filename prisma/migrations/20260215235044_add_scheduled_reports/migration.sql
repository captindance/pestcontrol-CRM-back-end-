-- AlterTable
ALTER TABLE `clients` ADD COLUMN `allowed_email_domains` TEXT NULL,
    ADD COLUMN `require_email_approval` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `report_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `client_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `report_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `frequency` ENUM('daily', 'weekly', 'monthly', 'quarterly', 'semi_annually', 'annually') NOT NULL,
    `time_of_day` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'America/New_York',
    `day_of_week` INTEGER NULL,
    `day_of_month` INTEGER NULL,
    `next_run_at` DATETIME(3) NULL,
    `email_security_level` VARCHAR(191) NOT NULL DEFAULT 'internal',
    `requires_approval` BOOLEAN NOT NULL DEFAULT false,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `report_schedules_client_id_deleted_at_is_enabled_idx`(`client_id`, `deleted_at`, `is_enabled`),
    INDEX `report_schedules_next_run_at_is_enabled_deleted_at_idx`(`next_run_at`, `is_enabled`, `deleted_at`),
    INDEX `report_schedules_report_id_idx`(`report_id`),
    INDEX `report_schedules_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_schedule_recipients` (
    `id` VARCHAR(191) NOT NULL,
    `schedule_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `report_schedule_recipients_schedule_id_idx`(`schedule_id`),
    UNIQUE INDEX `report_schedule_recipients_schedule_id_email_key`(`schedule_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_schedule_executions` (
    `id` VARCHAR(191) NOT NULL,
    `schedule_id` VARCHAR(191) NOT NULL,
    `client_id` INTEGER NOT NULL,
    `report_id` INTEGER NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `status` ENUM('pending', 'running', 'completed', 'failed', 'cancelled') NOT NULL,
    `emails_sent` INTEGER NOT NULL DEFAULT 0,
    `emails_failed` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,

    INDEX `report_schedule_executions_schedule_id_idx`(`schedule_id`),
    INDEX `report_schedule_executions_client_id_started_at_idx`(`client_id`, `started_at`),
    INDEX `report_schedule_executions_status_started_at_idx`(`status`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `report_schedules` ADD CONSTRAINT `report_schedules_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_schedules` ADD CONSTRAINT `report_schedules_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_schedules` ADD CONSTRAINT `report_schedules_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_schedule_recipients` ADD CONSTRAINT `report_schedule_recipients_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `report_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_schedule_executions` ADD CONSTRAINT `report_schedule_executions_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `report_schedules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
