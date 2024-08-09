/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `OpenaiCreds` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "OpenaiCreds" ADD COLUMN     "name" VARCHAR(255),
ALTER COLUMN "apiKey" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OpenaiCreds_name_key" ON "OpenaiCreds"("name");
