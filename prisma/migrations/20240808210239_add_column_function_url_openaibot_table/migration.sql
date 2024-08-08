-- AlterTable
ALTER TABLE "Instance" ADD COLUMN     "disconnectionAt" TIMESTAMP,
ADD COLUMN     "disconnectionObject" JSONB,
ADD COLUMN     "disconnectionReasonCode" INTEGER;

-- AlterTable
ALTER TABLE "OpenaiBot" ADD COLUMN     "functionUrl" VARCHAR(500);
