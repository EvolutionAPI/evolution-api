/*
  Warnings:

  - A unique constraint covering the columns `[labelId,instanceId]` on the table `Label` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Label_labelId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Label_labelId_instanceId_key" ON "Label"("labelId", "instanceId");
