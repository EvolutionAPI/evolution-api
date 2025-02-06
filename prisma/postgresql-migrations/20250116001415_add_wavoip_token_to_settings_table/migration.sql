/*
Warnings:

- A unique constraint covering the columns `[remoteJid,instanceId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.

*/

-- AlterTable
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Setting'
        AND column_name = 'wavoipToken'
    ) THEN
        ALTER TABLE "Setting" ADD COLUMN "wavoipToken" VARCHAR(100);
    END IF;
END $$;