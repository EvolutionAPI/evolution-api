-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "fileName" VARCHAR(500) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "mimetype" VARCHAR(100) NOT NULL,
    "createdAt" DATE DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Media_fileName_key" ON "Media"("fileName");

-- CreateIndex
CREATE UNIQUE INDEX "Media_messageId_key" ON "Media"("messageId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
