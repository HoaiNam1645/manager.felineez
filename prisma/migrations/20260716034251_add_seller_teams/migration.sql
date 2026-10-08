-- AlterTable
ALTER TABLE `User` ADD COLUMN `sellerCodes` JSON NULL,
    ADD COLUMN `sellerTeamId` VARCHAR(191) NULL,
    MODIFY `role` ENUM('OWNER', 'LEADER', 'USER') NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE `SellerTeam` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SellerTeam_teamId_idx`(`teamId`),
    UNIQUE INDEX `SellerTeam_teamId_name_key`(`teamId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_sellerTeamId_idx` ON `User`(`sellerTeamId`);

-- AddForeignKey
ALTER TABLE `SellerTeam` ADD CONSTRAINT `SellerTeam_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_sellerTeamId_fkey` FOREIGN KEY (`sellerTeamId`) REFERENCES `SellerTeam`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
