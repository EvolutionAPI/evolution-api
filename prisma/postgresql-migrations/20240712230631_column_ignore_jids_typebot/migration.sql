-- AlterTable
ALTER TABLE "Typebot" ADD COLUMN     "ignoreJids" JSONB;

-- AlterTable
ALTER TABLE "TypebotSetting" ADD COLUMN     "ignoreJids" JSONB;
