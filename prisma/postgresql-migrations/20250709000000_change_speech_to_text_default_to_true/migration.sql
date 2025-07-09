-- AlterTable
ALTER TABLE "OpenaiSetting" ALTER COLUMN "speechToText" SET DEFAULT true;

-- Update existing records to use the new default
UPDATE "OpenaiSetting" SET "speechToText" = true WHERE "speechToText" IS NULL OR "speechToText" = false;
