-- AlterTable
ALTER TABLE `Record` ADD COLUMN `orderStatus` VARCHAR(16) NULL;

-- CreateIndex
CREATE INDEX `Record_teamId_orderStatus_idx` ON `Record`(`teamId`, `orderStatus`);
