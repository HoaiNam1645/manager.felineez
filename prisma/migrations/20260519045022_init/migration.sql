-- CreateTable
CREATE TABLE `Team` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'USER') NOT NULL DEFAULT 'USER',
    `teamId` VARCHAR(191) NOT NULL,
    `permissions` JSON NULL,
    `allowedAccounts` JSON NULL,
    `fcmTokens` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_teamId_idx`(`teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailAccount` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `provider` ENUM('GMAIL', 'OUTLOOK') NOT NULL,
    `token` TEXT NOT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `historySyncedUntil` DATETIME(3) NULL,
    `historicalSyncComplete` BOOLEAN NOT NULL DEFAULT false,
    `scanStartDate` DATETIME(3) NULL,
    `lastKnownHistoryId` VARCHAR(191) NULL,
    `platforms` JSON NULL,
    `sortOrder` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MailAccount_teamId_idx`(`teamId`),
    UNIQUE INDEX `MailAccount_teamId_email_key`(`teamId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Record` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `emailId` VARCHAR(191) NULL,
    `dtLocal` DATETIME(3) NOT NULL,
    `amount` DECIMAL(18, 4) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `currency` VARCHAR(8) NULL,
    `source` VARCHAR(191) NULL,
    `accountEmail` VARCHAR(191) NULL,
    `kind` ENUM('ORDER', 'FUNDS', 'CASE', 'HELP') NOT NULL,
    `caseMsg` TEXT NULL,
    `helpKind` VARCHAR(191) NULL,
    `costTotal` DECIMAL(18, 4) NULL,
    `ffCode` VARCHAR(191) NULL,
    `productName` TEXT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Record_teamId_dtLocal_idx`(`teamId`, `dtLocal`),
    INDEX `Record_teamId_orderId_idx`(`teamId`, `orderId`),
    INDEX `Record_teamId_kind_idx`(`teamId`, `kind`),
    UNIQUE INDEX `Record_teamId_emailId_key`(`teamId`, `emailId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ManualCost` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `providerName` VARCHAR(191) NOT NULL,
    `cost` DECIMAL(18, 4) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `timeZone` VARCHAR(191) NULL,
    `currency` VARCHAR(8) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ManualCost_teamId_date_idx`(`teamId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `body` TEXT NULL,
    `data` JSON NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_teamId_createdAt_idx`(`teamId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LarkEvent` (
    `id` VARCHAR(191) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailAccount` ADD CONSTRAINT `MailAccount_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Record` ADD CONSTRAINT `Record_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Record` ADD CONSTRAINT `Record_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MailAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ManualCost` ADD CONSTRAINT `ManualCost_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
