-- CreateTable
CREATE TABLE `Instance` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `connectionStatus` ENUM('open', 'close', 'connecting') NOT NULL DEFAULT 'open',
    `ownerJid` VARCHAR(100) NULL,
    `profileName` VARCHAR(100) NULL,
    `profilePicUrl` VARCHAR(500) NULL,
    `integration` VARCHAR(100) NULL,
    `number` VARCHAR(100) NULL,
    `businessId` VARCHAR(100) NULL,
    `token` VARCHAR(255) NULL,
    `clientName` VARCHAR(100) NULL,
    `disconnectionReasonCode` INTEGER NULL,
    `disconnectionObject` JSON NULL,
    `disconnectionAt` TIMESTAMP NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,

    UNIQUE INDEX `Instance_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `creds` TEXT NULL,
    `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX `Session_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Chat` (
    `id` VARCHAR(191) NOT NULL,
    `remoteJid` VARCHAR(100) NOT NULL,
    `labels` JSON NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `remoteJid` VARCHAR(100) NOT NULL,
    `pushName` VARCHAR(100) NULL,
    `profilePicUrl` VARCHAR(500) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `key` JSON NOT NULL,
    `pushName` VARCHAR(100) NULL,
    `participant` VARCHAR(100) NULL,
    `messageType` VARCHAR(100) NOT NULL,
    `message` JSON NOT NULL,
    `contextInfo` JSON NULL,
    `source` ENUM('ios', 'android', 'web', 'unknown', 'desktop') NOT NULL,
    `messageTimestamp` INTEGER NOT NULL,
    `chatwootMessageId` INTEGER NULL,
    `chatwootInboxId` INTEGER NULL,
    `chatwootConversationId` INTEGER NULL,
    `chatwootContactInboxSourceId` VARCHAR(100) NULL,
    `chatwootIsRead` BOOLEAN NULL DEFAULT false,
    `instanceId` VARCHAR(191) NOT NULL,
    `typebotSessionId` VARCHAR(191) NULL,
    `openaiSessionId` VARCHAR(191) NULL,
    `webhookUrl` VARCHAR(500) NULL,
    `difySessionId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageUpdate` (
    `id` VARCHAR(191) NOT NULL,
    `keyId` VARCHAR(100) NOT NULL,
    `remoteJid` VARCHAR(100) NOT NULL,
    `fromMe` BOOLEAN NOT NULL,
    `participant` VARCHAR(100) NULL,
    `pollUpdates` JSON NULL,
    `status` VARCHAR(30) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Webhook` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `enabled` BOOLEAN NULL DEFAULT true,
    `events` JSON NULL,
    `webhookByEvents` BOOLEAN NULL DEFAULT false,
    `webhookBase64` BOOLEAN NULL DEFAULT false,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Webhook_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Chatwoot` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NULL DEFAULT true,
    `accountId` VARCHAR(100) NULL,
    `token` VARCHAR(100) NULL,
    `url` VARCHAR(500) NULL,
    `nameInbox` VARCHAR(100) NULL,
    `signMsg` BOOLEAN NULL DEFAULT false,
    `signDelimiter` VARCHAR(100) NULL,
    `number` VARCHAR(100) NULL,
    `reopenConversation` BOOLEAN NULL DEFAULT false,
    `conversationPending` BOOLEAN NULL DEFAULT false,
    `mergeBrazilContacts` BOOLEAN NULL DEFAULT false,
    `importContacts` BOOLEAN NULL DEFAULT false,
    `importMessages` BOOLEAN NULL DEFAULT false,
    `daysLimitImportMessages` INTEGER NULL,
    `organization` VARCHAR(100) NULL,
    `logo` VARCHAR(500) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Chatwoot_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Label` (
    `id` VARCHAR(191) NOT NULL,
    `labelId` VARCHAR(100) NULL,
    `name` VARCHAR(100) NOT NULL,
    `color` VARCHAR(100) NOT NULL,
    `predefinedId` VARCHAR(100) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Label_labelId_key`(`labelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Proxy` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `host` VARCHAR(100) NOT NULL,
    `port` VARCHAR(100) NOT NULL,
    `protocol` VARCHAR(100) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `password` VARCHAR(100) NOT NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Proxy_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `id` VARCHAR(191) NOT NULL,
    `rejectCall` BOOLEAN NOT NULL DEFAULT false,
    `msgCall` VARCHAR(100) NULL,
    `groupsIgnore` BOOLEAN NOT NULL DEFAULT false,
    `alwaysOnline` BOOLEAN NOT NULL DEFAULT false,
    `readMessages` BOOLEAN NOT NULL DEFAULT false,
    `readStatus` BOOLEAN NOT NULL DEFAULT false,
    `syncFullHistory` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Setting_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rabbitmq` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `events` JSON NOT NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Rabbitmq_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sqs` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `events` JSON NOT NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Sqs_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Websocket` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `events` JSON NOT NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Websocket_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Typebot` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255) NULL,
    `url` VARCHAR(500) NOT NULL,
    `typebot` VARCHAR(100) NOT NULL,
    `expire` INTEGER NULL DEFAULT 0,
    `keywordFinish` VARCHAR(100) NULL,
    `delayMessage` INTEGER NULL,
    `unknownMessage` VARCHAR(100) NULL,
    `listeningFromMe` BOOLEAN NULL DEFAULT false,
    `stopBotFromMe` BOOLEAN NULL DEFAULT false,
    `keepOpen` BOOLEAN NULL DEFAULT false,
    `debounceTime` INTEGER NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NULL,
    `ignoreJids` JSON NULL,
    `triggerType` ENUM('all', 'keyword', 'none') NULL,
    `triggerOperator` ENUM('contains', 'equals', 'startsWith', 'endsWith', 'regex') NULL,
    `triggerValue` VARCHAR(191) NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TypebotSession` (
    `id` VARCHAR(191) NOT NULL,
    `remoteJid` VARCHAR(100) NOT NULL,
    `pushName` VARCHAR(100) NULL,
    `sessionId` VARCHAR(100) NOT NULL,
    `status` ENUM('opened', 'closed', 'paused') NOT NULL,
    `prefilledVariables` JSON NULL,
    `awaitUser` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `typebotId` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TypebotSetting` (
    `id` VARCHAR(191) NOT NULL,
    `expire` INTEGER NULL DEFAULT 0,
    `keywordFinish` VARCHAR(100) NULL,
    `delayMessage` INTEGER NULL,
    `unknownMessage` VARCHAR(100) NULL,
    `listeningFromMe` BOOLEAN NULL DEFAULT false,
    `stopBotFromMe` BOOLEAN NULL DEFAULT false,
    `keepOpen` BOOLEAN NULL DEFAULT false,
    `debounceTime` INTEGER NULL,
    `typebotIdFallback` VARCHAR(100) NULL,
    `ignoreJids` JSON NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `TypebotSetting_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Media` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(500) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `mimetype` VARCHAR(100) NOT NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `messageId` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Media_fileName_key`(`fileName`),
    UNIQUE INDEX `Media_messageId_key`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpenaiCreds` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NULL,
    `apiKey` VARCHAR(255) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `OpenaiCreds_name_key`(`name`),
    UNIQUE INDEX `OpenaiCreds_apiKey_key`(`apiKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpenaiBot` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255) NULL,
    `botType` ENUM('assistant', 'chatCompletion') NOT NULL,
    `assistantId` VARCHAR(255) NULL,
    `functionUrl` VARCHAR(500) NULL,
    `model` VARCHAR(100) NULL,
    `systemMessages` JSON NULL,
    `assistantMessages` JSON NULL,
    `userMessages` JSON NULL,
    `maxTokens` INTEGER NULL,
    `expire` INTEGER NULL DEFAULT 0,
    `keywordFinish` VARCHAR(100) NULL,
    `delayMessage` INTEGER NULL,
    `unknownMessage` VARCHAR(100) NULL,
    `listeningFromMe` BOOLEAN NULL DEFAULT false,
    `stopBotFromMe` BOOLEAN NULL DEFAULT false,
    `keepOpen` BOOLEAN NULL DEFAULT false,
    `debounceTime` INTEGER NULL,
    `ignoreJids` JSON NULL,
    `triggerType` ENUM('all', 'keyword', 'none') NULL,
    `triggerOperator` ENUM('contains', 'equals', 'startsWith', 'endsWith', 'regex') NULL,
    `triggerValue` VARCHAR(191) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `openaiCredsId` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpenaiSession` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(255) NOT NULL,
    `remoteJid` VARCHAR(100) NOT NULL,
    `status` ENUM('opened', 'closed', 'paused') NOT NULL,
    `awaitUser` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `openaiBotId` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpenaiSetting` (
    `id` VARCHAR(191) NOT NULL,
    `expire` INTEGER NULL DEFAULT 0,
    `keywordFinish` VARCHAR(100) NULL,
    `delayMessage` INTEGER NULL,
    `unknownMessage` VARCHAR(100) NULL,
    `listeningFromMe` BOOLEAN NULL DEFAULT false,
    `stopBotFromMe` BOOLEAN NULL DEFAULT false,
    `keepOpen` BOOLEAN NULL DEFAULT false,
    `debounceTime` INTEGER NULL,
    `ignoreJids` JSON NULL,
    `speechToText` BOOLEAN NULL DEFAULT false,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `openaiCredsId` VARCHAR(191) NOT NULL,
    `openaiIdFallback` VARCHAR(100) NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `OpenaiSetting_openaiCredsId_key`(`openaiCredsId`),
    UNIQUE INDEX `OpenaiSetting_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Template` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `template` JSON NOT NULL,
    `webhookUrl` VARCHAR(500) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Template_templateId_key`(`templateId`),
    UNIQUE INDEX `Template_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dify` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255) NULL,
    `botType` ENUM('chatBot', 'textGenerator', 'agent', 'workflow') NOT NULL,
    `apiUrl` VARCHAR(255) NULL,
    `apiKey` VARCHAR(255) NULL,
    `expire` INTEGER NULL DEFAULT 0,
    `keywordFinish` VARCHAR(100) NULL,
    `delayMessage` INTEGER NULL,
    `unknownMessage` VARCHAR(100) NULL,
    `listeningFromMe` BOOLEAN NULL DEFAULT false,
    `stopBotFromMe` BOOLEAN NULL DEFAULT false,
    `keepOpen` BOOLEAN NULL DEFAULT false,
    `debounceTime` INTEGER NULL,
    `ignoreJids` JSON NULL,
    `triggerType` ENUM('all', 'keyword', 'none') NULL,
    `triggerOperator` ENUM('contains', 'equals', 'startsWith', 'endsWith', 'regex') NULL,
    `triggerValue` VARCHAR(191) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DifySession` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(255) NOT NULL,
    `remoteJid` VARCHAR(100) NOT NULL,
    `status` ENUM('opened', 'closed', 'paused') NOT NULL,
    `awaitUser` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `difyId` VARCHAR(191) NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DifySetting` (
    `id` VARCHAR(191) NOT NULL,
    `expire` INTEGER NULL DEFAULT 0,
    `keywordFinish` VARCHAR(100) NULL,
    `delayMessage` INTEGER NULL,
    `unknownMessage` VARCHAR(100) NULL,
    `listeningFromMe` BOOLEAN NULL DEFAULT false,
    `stopBotFromMe` BOOLEAN NULL DEFAULT false,
    `keepOpen` BOOLEAN NULL DEFAULT false,
    `debounceTime` INTEGER NULL,
    `ignoreJids` JSON NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `difyIdFallback` VARCHAR(100) NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `DifySetting_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chat` ADD CONSTRAINT `Chat_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_typebotSessionId_fkey` FOREIGN KEY (`typebotSessionId`) REFERENCES `TypebotSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_openaiSessionId_fkey` FOREIGN KEY (`openaiSessionId`) REFERENCES `OpenaiSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_difySessionId_fkey` FOREIGN KEY (`difySessionId`) REFERENCES `DifySession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageUpdate` ADD CONSTRAINT `MessageUpdate_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageUpdate` ADD CONSTRAINT `MessageUpdate_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Webhook` ADD CONSTRAINT `Webhook_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chatwoot` ADD CONSTRAINT `Chatwoot_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Label` ADD CONSTRAINT `Label_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proxy` ADD CONSTRAINT `Proxy_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Setting` ADD CONSTRAINT `Setting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rabbitmq` ADD CONSTRAINT `Rabbitmq_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sqs` ADD CONSTRAINT `Sqs_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Websocket` ADD CONSTRAINT `Websocket_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Typebot` ADD CONSTRAINT `Typebot_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TypebotSession` ADD CONSTRAINT `TypebotSession_typebotId_fkey` FOREIGN KEY (`typebotId`) REFERENCES `Typebot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TypebotSession` ADD CONSTRAINT `TypebotSession_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TypebotSetting` ADD CONSTRAINT `TypebotSetting_typebotIdFallback_fkey` FOREIGN KEY (`typebotIdFallback`) REFERENCES `Typebot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TypebotSetting` ADD CONSTRAINT `TypebotSetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiCreds` ADD CONSTRAINT `OpenaiCreds_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiBot` ADD CONSTRAINT `OpenaiBot_openaiCredsId_fkey` FOREIGN KEY (`openaiCredsId`) REFERENCES `OpenaiCreds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiBot` ADD CONSTRAINT `OpenaiBot_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiSession` ADD CONSTRAINT `OpenaiSession_openaiBotId_fkey` FOREIGN KEY (`openaiBotId`) REFERENCES `OpenaiBot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiSession` ADD CONSTRAINT `OpenaiSession_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiSetting` ADD CONSTRAINT `OpenaiSetting_openaiCredsId_fkey` FOREIGN KEY (`openaiCredsId`) REFERENCES `OpenaiCreds`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiSetting` ADD CONSTRAINT `OpenaiSetting_openaiIdFallback_fkey` FOREIGN KEY (`openaiIdFallback`) REFERENCES `OpenaiBot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OpenaiSetting` ADD CONSTRAINT `OpenaiSetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dify` ADD CONSTRAINT `Dify_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DifySession` ADD CONSTRAINT `DifySession_difyId_fkey` FOREIGN KEY (`difyId`) REFERENCES `Dify`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DifySession` ADD CONSTRAINT `DifySession_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DifySetting` ADD CONSTRAINT `DifySetting_difyIdFallback_fkey` FOREIGN KEY (`difyIdFallback`) REFERENCES `Dify`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DifySetting` ADD CONSTRAINT `DifySetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
