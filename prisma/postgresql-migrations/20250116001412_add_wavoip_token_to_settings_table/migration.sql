/*
  Warnings:

  - A unique constraint covering the columns `[remoteJid,instanceId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "wavoipToken" VARCHAR(100);

-- Remover registros duplicados antes de criar o índice único
DELETE FROM "Chat" a USING "Chat" b
WHERE a.ctid < b.ctid 
AND a.remoteJid = b.remoteJid 
AND a.instanceId = b.instanceId;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_remoteJid_instanceId_key" ON "Chat"("remoteJid", "instanceId");
