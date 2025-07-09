-- AlterTable
ALTER TABLE `OpenaiSetting` MODIFY COLUMN `speechToText` BOOLEAN NULL DEFAULT true;

-- Update existing records to use the new default
UPDATE `OpenaiSetting` SET `speechToText` = true WHERE `speechToText` IS NULL OR `speechToText` = false;
