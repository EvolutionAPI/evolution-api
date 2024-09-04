/*
  Warnings:

  - A unique constraint covering the columns `[url,typebot,instanceId]` on the table `Typebot` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Typebot_url_typebot_instanceId_key" ON "Typebot"("url", "typebot", "instanceId");
