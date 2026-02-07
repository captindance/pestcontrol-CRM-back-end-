-- CreateTable invitations
CREATE TABLE `invitations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `client_id` INTEGER NULL,
    `invitation_type` VARCHAR(191) NOT NULL DEFAULT 'account_creation',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `token` VARCHAR(191) NOT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `accepted_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invitations_token_key`(`token`),
    UNIQUE INDEX `invitations_email_client_id_invitation_type_key`(`email`, `client_id`, `invitation_type`),
    INDEX `invitations_email_status_idx`(`email`, `status`),
    INDEX `invitations_client_id_status_idx`(`client_id`, `status`),
    CONSTRAINT `invitations_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;