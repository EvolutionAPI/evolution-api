/*
  Warnings:

  - You are about to drop the column `difyId` on the `IntegrationSession` table. All the data in the column will be lost.
  - You are about to drop the column `openaiBotId` on the `IntegrationSession` table. All the data in the column will be lost.
  - You are about to drop the column `typebotId` on the `IntegrationSession` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "IntegrationSession" DROP CONSTRAINT "IntegrationSession_difyId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationSession" DROP CONSTRAINT "IntegrationSession_openaiBotId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationSession" DROP CONSTRAINT "IntegrationSession_typebotId_fkey";

-- AlterTable
ALTER TABLE "IntegrationSession" DROP COLUMN "difyId",
DROP COLUMN "openaiBotId",
DROP COLUMN "typebotId",
ADD COLUMN     "botId" TEXT;
