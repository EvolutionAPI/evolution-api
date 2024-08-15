/*
  Warnings:

  - A unique constraint covering the columns `[remoteJid,instanceId]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- Remove the duplicates
DELETE FROM "Contact"
WHERE ctid NOT IN (
  SELECT min(ctid)
  FROM "Contact"
  GROUP BY "remoteJid", "instanceId"
);


-- CreateIndex
CREATE UNIQUE INDEX "Contact_remoteJid_instanceId_key" ON "Contact"("remoteJid", "instanceId");
