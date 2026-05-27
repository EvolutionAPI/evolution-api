-- CreateIndex
CREATE INDEX IF NOT EXISTS "Instance_clientName_idx" ON "Instance"("clientName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Instance_token_idx" ON "Instance"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Instance_number_idx" ON "Instance"("number");
