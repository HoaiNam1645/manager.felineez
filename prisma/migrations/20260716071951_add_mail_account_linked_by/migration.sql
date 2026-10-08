-- AlterTable
ALTER TABLE `MailAccount` ADD COLUMN `linkedByUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `MailAccount_linkedByUserId_idx` ON `MailAccount`(`linkedByUserId`);

-- AddForeignKey
ALTER TABLE `MailAccount` ADD CONSTRAINT `MailAccount_linkedByUserId_fkey` FOREIGN KEY (`linkedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
