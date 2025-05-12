/*
Warnings:

- A unique constraint covering the columns `[remoteJid,instanceId]` on the table `Chat` will be added. If there are existing duplicate values, this will fail.

*/

-- AlterTable
SET @column_exists := (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'Setting' 
    AND column_name = 'wavoipToken'
);

SET @sql := IF(@column_exists = 0, 
  'ALTER TABLE Setting ADD COLUMN wavoipToken VARCHAR(100);', 
  'SELECT "Column already exists";'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE Chat ADD CONSTRAINT unique_remote_instance UNIQUE (remoteJid, instanceId);
