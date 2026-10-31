CREATE TABLE `ProductDesignLink` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `itemIndex` INTEGER NOT NULL,
    `designItemKey` VARCHAR(191) NOT NULL,
    `linkedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProductDesignLink_designItemKey_key`(`designItemKey`),
    INDEX `ProductDesignLink_teamId_idx`(`teamId`),
    INDEX `ProductDesignLink_productId_idx`(`productId`),
    INDEX `ProductDesignLink_recordId_idx`(`recordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProductDesignLink` ADD CONSTRAINT `ProductDesignLink_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductDesignLink` ADD CONSTRAINT `ProductDesignLink_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductDesignLink` ADD CONSTRAINT `ProductDesignLink_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `Record`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill every existing one-folder/one-item source into the permanent link table.
INSERT INTO `ProductDesignLink` (`id`, `teamId`, `productId`, `recordId`, `itemIndex`, `designItemKey`, `linkedById`, `createdAt`)
SELECT
    CONCAT('legacy_', LEFT(SHA2(CONCAT(`ranked`.`id`, ':', `ranked`.`source`), 256), 24)),
    `ranked`.`teamId`,
    `ranked`.`id`,
    SUBSTRING_INDEX(SUBSTRING_INDEX(`ranked`.`source`, ':', 2), ':', -1),
    CAST(SUBSTRING_INDEX(`ranked`.`source`, ':', -1) AS UNSIGNED),
    `ranked`.`source`,
    `ranked`.`createdById`,
    `ranked`.`createdAt`
FROM (
    SELECT `Product`.*,
        ROW_NUMBER() OVER (
            PARTITION BY `source`
            ORDER BY COALESCE(JSON_LENGTH(`images`), 0) DESC, `updatedAt` DESC, `id` DESC
        ) AS `linkRank`
    FROM `Product`
    WHERE `source` REGEXP '^design-item:[^:]+:[0-9]+$'
) AS `ranked`
WHERE `ranked`.`linkRank` = 1;
