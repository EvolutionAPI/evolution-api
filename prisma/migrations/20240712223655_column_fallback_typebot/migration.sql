-- AlterEnum
ALTER TYPE "TriggerOperator" ADD VALUE 'regex';

-- AlterTable
ALTER TABLE "TypebotSetting" ADD COLUMN     "typebotIdFallback" VARCHAR(100);

-- AddForeignKey
ALTER TABLE "TypebotSetting" ADD CONSTRAINT "TypebotSetting_typebotIdFallback_fkey" FOREIGN KEY ("typebotIdFallback") REFERENCES "Typebot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
