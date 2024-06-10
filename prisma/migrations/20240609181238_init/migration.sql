-- CreateEnum
CREATE TYPE "InstanceConnectionStatus" AS ENUM ('open', 'close', 'connecting');

-- CreateEnum
CREATE TYPE "DeviceMessage" AS ENUM ('ios', 'android', 'web', 'unknown', 'desktop');

-- CreateEnum
CREATE TYPE "TypebotSessionStatus" AS ENUM ('open', 'closed', 'paused');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('all', 'keyword');

-- CreateEnum
CREATE TYPE "TriggerOperator" AS ENUM ('contains', 'equals', 'startsWith', 'endsWith');

-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "connectionStatus" "InstanceConnectionStatus" NOT NULL DEFAULT 'open',
    "ownerJid" VARCHAR(100),
    "profilePicUrl" VARCHAR(500),
    "integration" VARCHAR(100),
    "number" VARCHAR(100),
    "token" VARCHAR(255),
    "clientName" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "creds" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "remoteJid" VARCHAR(100) NOT NULL,
    "labels" JSONB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "remoteJid" VARCHAR(100) NOT NULL,
    "pushName" VARCHAR(100),
    "profilePicUrl" VARCHAR(500),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "key" JSONB NOT NULL,
    "pushName" VARCHAR(100),
    "participant" VARCHAR(100),
    "messageType" VARCHAR(100) NOT NULL,
    "message" JSONB NOT NULL,
    "contextInfo" JSONB,
    "source" "DeviceMessage" NOT NULL,
    "messageTimestamp" INTEGER NOT NULL,
    "chatwootMessageId" INTEGER,
    "chatwootInboxId" INTEGER,
    "chatwootConversationId" INTEGER,
    "chatwootContactInboxSourceId" VARCHAR(100),
    "chatwootIsRead" BOOLEAN,
    "instanceId" TEXT NOT NULL,
    "typebotSessionId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageUpdate" (
    "id" TEXT NOT NULL,
    "keyId" VARCHAR(100) NOT NULL,
    "remoteJid" VARCHAR(100) NOT NULL,
    "fromMe" BOOLEAN NOT NULL,
    "participant" VARCHAR(100),
    "pollUpdates" JSONB,
    "status" VARCHAR(30) NOT NULL,
    "messageId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "MessageUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "enabled" BOOLEAN DEFAULT true,
    "events" JSONB,
    "webhookByEvents" BOOLEAN DEFAULT false,
    "webhookBase64" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chatwoot" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN DEFAULT true,
    "accountId" VARCHAR(100),
    "token" VARCHAR(100),
    "url" VARCHAR(500),
    "nameInbox" VARCHAR(100),
    "signMsg" BOOLEAN DEFAULT false,
    "signDelimiter" VARCHAR(100),
    "number" VARCHAR(100),
    "reopenConversation" BOOLEAN DEFAULT false,
    "conversationPending" BOOLEAN DEFAULT false,
    "mergeBrazilContacts" BOOLEAN DEFAULT false,
    "importContacts" BOOLEAN DEFAULT false,
    "importMessages" BOOLEAN DEFAULT false,
    "daysLimitImportMessages" INTEGER,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Chatwoot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "labelId" VARCHAR(100),
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(100) NOT NULL,
    "predefinedId" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proxy" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" VARCHAR(100) NOT NULL,
    "port" VARCHAR(100) NOT NULL,
    "protocol" VARCHAR(100) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "rejectCall" BOOLEAN NOT NULL DEFAULT false,
    "msgCall" VARCHAR(100),
    "groupsIgnore" BOOLEAN NOT NULL DEFAULT false,
    "alwaysOnline" BOOLEAN NOT NULL DEFAULT false,
    "readMessages" BOOLEAN NOT NULL DEFAULT false,
    "readStatus" BOOLEAN NOT NULL DEFAULT false,
    "syncFullHistory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rabbitmq" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Rabbitmq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sqs" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Sqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Websocket" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Websocket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Typebot" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "url" VARCHAR(500) NOT NULL,
    "typebot" VARCHAR(100) NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keywordFinish" VARCHAR(100),
    "delayMessage" INTEGER,
    "unknownMessage" VARCHAR(100),
    "listeningFromMe" BOOLEAN DEFAULT false,
    "stopBotFromMe" BOOLEAN DEFAULT false,
    "keepOpen" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP,
    "triggerType" "TriggerType",
    "triggerOperator" "TriggerOperator",
    "triggerValue" TEXT,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "Typebot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypebotSession" (
    "id" TEXT NOT NULL,
    "remoteJid" VARCHAR(100) NOT NULL,
    "pushName" VARCHAR(100),
    "sessionId" VARCHAR(100) NOT NULL,
    "status" VARCHAR(100) NOT NULL,
    "prefilledVariables" JSONB,
    "awaitUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "typebotId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "TypebotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypebotSetting" (
    "id" TEXT NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keywordFinish" VARCHAR(100),
    "delayMessage" INTEGER,
    "unknownMessage" VARCHAR(100),
    "listeningFromMe" BOOLEAN DEFAULT false,
    "stopBotFromMe" BOOLEAN DEFAULT false,
    "keepOpen" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "TypebotSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instance_name_key" ON "Instance"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_token_key" ON "Instance"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionId_key" ON "Session"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_instanceId_key" ON "Webhook"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Chatwoot_instanceId_key" ON "Chatwoot"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_labelId_key" ON "Label"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "Proxy_instanceId_key" ON "Proxy"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_instanceId_key" ON "Setting"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Rabbitmq_instanceId_key" ON "Rabbitmq"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Sqs_instanceId_key" ON "Sqs"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Websocket_instanceId_key" ON "Websocket"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "TypebotSetting_instanceId_key" ON "TypebotSetting"("instanceId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_typebotSessionId_fkey" FOREIGN KEY ("typebotSessionId") REFERENCES "TypebotSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageUpdate" ADD CONSTRAINT "MessageUpdate_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageUpdate" ADD CONSTRAINT "MessageUpdate_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chatwoot" ADD CONSTRAINT "Chatwoot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proxy" ADD CONSTRAINT "Proxy_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rabbitmq" ADD CONSTRAINT "Rabbitmq_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sqs" ADD CONSTRAINT "Sqs_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Websocket" ADD CONSTRAINT "Websocket_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Typebot" ADD CONSTRAINT "Typebot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypebotSession" ADD CONSTRAINT "TypebotSession_typebotId_fkey" FOREIGN KEY ("typebotId") REFERENCES "Typebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypebotSession" ADD CONSTRAINT "TypebotSession_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypebotSetting" ADD CONSTRAINT "TypebotSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
