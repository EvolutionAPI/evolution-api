-- AlterTable
UPDATE "Message" SET "status" = 'PENDING';

ALTER TABLE "Message"
ALTER COLUMN "status"
SET
    DATA TYPE VARCHAR(30);