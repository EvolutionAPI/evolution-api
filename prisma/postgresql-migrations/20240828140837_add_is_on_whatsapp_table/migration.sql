-- CreateTable
CREATE TABLE "is_on_whatsapp" (
    "id" TEXT NOT NULL,
    "remote_jid" VARCHAR(100) NOT NULL,
    "name" TEXT,
    "jid_options" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "is_on_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "is_on_whatsapp_remote_jid_key" ON "is_on_whatsapp"("remote_jid");
