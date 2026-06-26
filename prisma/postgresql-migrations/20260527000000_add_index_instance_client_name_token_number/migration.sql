-- CreateIndex
CREATE UNIQUE INDEX "Instance_clientName_idx" ON "Instance"("clientName");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_token_idx" ON "Instance"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_number_idx" ON "Instance"("number");
