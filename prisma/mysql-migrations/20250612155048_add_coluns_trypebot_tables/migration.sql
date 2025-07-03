-- AlterTable
ALTER TABLE `Typebot` ADD COLUMN     `splitMessages` BOOLEAN DEFAULT false,
ADD COLUMN     `timePerChar` INTEGER DEFAULT 50;

-- AlterTable
ALTER TABLE `TypebotSetting` ADD COLUMN     `splitMessages` BOOLEAN DEFAULT false,
ADD COLUMN     `timePerChar` INTEGER DEFAULT 50;
