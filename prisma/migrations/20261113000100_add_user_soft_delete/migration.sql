ALTER TABLE `User` ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `User_teamId_deletedAt_idx` ON `User`(`teamId`, `deletedAt`);
