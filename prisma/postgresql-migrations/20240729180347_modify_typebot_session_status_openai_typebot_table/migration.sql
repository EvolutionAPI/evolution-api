/*
  Warnings:

  - The values [open] on the enum `TypebotSessionStatus` will be removed. If these variants are still used in the database, this will fail.
  - Changed the type of `status` on the `TypebotSession` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TypebotSessionStatus_new" AS ENUM ('opened', 'closed', 'paused');
ALTER TABLE "TypebotSession" ALTER COLUMN "status" TYPE "TypebotSessionStatus_new" USING ("status"::text::"TypebotSessionStatus_new");
ALTER TABLE "OpenaiSession" ALTER COLUMN "status" TYPE "TypebotSessionStatus_new" USING ("status"::text::"TypebotSessionStatus_new");
ALTER TYPE "TypebotSessionStatus" RENAME TO "TypebotSessionStatus_old";
ALTER TYPE "TypebotSessionStatus_new" RENAME TO "TypebotSessionStatus";
DROP TYPE "TypebotSessionStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "TypebotSession" DROP COLUMN "status",
ADD COLUMN     "status" "TypebotSessionStatus" NOT NULL;
