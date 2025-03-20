/*
  Warnings:

  - A unique constraint covering the columns `[openaiCredsId]` on the table `OpenaiSetting` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "OpenaiSetting_openaiCredsId_key" ON "OpenaiSetting"("openaiCredsId");
