-- AlterTable
ALTER TABLE `Record` ADD COLUMN `syncAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `syncError` TEXT NULL,
    ADD COLUMN `syncStatus` VARCHAR(191) NULL DEFAULT 'PENDING',
    ADD COLUMN `syncedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Record_teamId_syncStatus_idx` ON `Record`(`teamId`, `syncStatus`);
