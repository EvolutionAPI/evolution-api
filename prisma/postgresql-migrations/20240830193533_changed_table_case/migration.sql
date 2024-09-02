/*
  Warnings:

  - You are about to drop the `is_on_whatsapp` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "is_on_whatsapp";

-- CreateTable
CREATE TABLE "IsOnWhatsapp" (
    "id" TEXT NOT NULL,
    "remoteJid" VARCHAR(100) NOT NULL,
    "jidOptions" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,

    CONSTRAINT "IsOnWhatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IsOnWhatsapp_remoteJid_key" ON "IsOnWhatsapp"("remoteJid");
