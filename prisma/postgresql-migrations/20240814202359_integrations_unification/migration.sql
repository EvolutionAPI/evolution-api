/*
  Warnings:

  - You are about to drop the column `difySessionId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `openaiSessionId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `typebotSessionId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `DifySession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OpenaiSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TypebotSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('opened', 'closed', 'paused');

-- DropForeignKey
ALTER TABLE "DifySession" DROP CONSTRAINT "DifySession_difyId_fkey";

-- DropForeignKey
ALTER TABLE "DifySession" DROP CONSTRAINT "DifySession_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_difySessionId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_openaiSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_typebotSessionId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiSession" DROP CONSTRAINT "OpenaiSession_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiSession" DROP CONSTRAINT "OpenaiSession_openaiBotId_fkey";

-- DropForeignKey
ALTER TABLE "TypebotSession" DROP CONSTRAINT "TypebotSession_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "TypebotSession" DROP CONSTRAINT "TypebotSession_typebotId_fkey";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "difySessionId",
DROP COLUMN "openaiSessionId",
DROP COLUMN "typebotSessionId",
ADD COLUMN     "sessionId" TEXT;

-- DropTable
DROP TABLE "DifySession";

-- DropTable
DROP TABLE "OpenaiSession";

-- DropTable
DROP TABLE "TypebotSession";

-- DropEnum
DROP TYPE "TypebotSessionStatus";

-- CreateTable
CREATE TABLE "IntegrationSession" (
    "id" TEXT NOT NULL,
    "sessionId" VARCHAR(255) NOT NULL,
    "remoteJid" VARCHAR(100) NOT NULL,
    "pushName" TEXT,
    "status" "SessionStatus" NOT NULL,
    "awaitUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,
    "parameters" JSONB,
    "openaiBotId" TEXT,
    "difyId" TEXT,
    "typebotId" TEXT,

    CONSTRAINT "IntegrationSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "IntegrationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSession" ADD CONSTRAINT "IntegrationSession_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSession" ADD CONSTRAINT "IntegrationSession_openaiBotId_fkey" FOREIGN KEY ("openaiBotId") REFERENCES "OpenaiBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSession" ADD CONSTRAINT "IntegrationSession_difyId_fkey" FOREIGN KEY ("difyId") REFERENCES "Dify"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSession" ADD CONSTRAINT "IntegrationSession_typebotId_fkey" FOREIGN KEY ("typebotId") REFERENCES "Typebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
