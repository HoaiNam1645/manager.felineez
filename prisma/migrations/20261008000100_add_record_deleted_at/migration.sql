ALTER TABLE `Record` ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `Record_teamId_deletedAt_idx` ON `Record`(`teamId`, `deletedAt`);
