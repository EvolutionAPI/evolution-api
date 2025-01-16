/*
  Warnings:

  - A unique constraint covering the columns `[remoteJid,instanceId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "wavoipToken" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "Chat_remoteJid_instanceId_key" ON "Chat"("remoteJid", "instanceId");
