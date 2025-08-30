-- CreateTable
CREATE TABLE `N8n` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255),
    `webhookUrl` VARCHAR(255),
    `basicAuthUser` VARCHAR(255),
    `basicAuthPass` VARCHAR(255),
    `expire` INTEGER DEFAULT 0,
    `keywordFinish` VARCHAR(100),
    `delayMessage` INTEGER,
    `unknownMessage` VARCHAR(100),
    `listeningFromMe` BOOLEAN DEFAULT false,
    `stopBotFromMe` BOOLEAN DEFAULT false,
    `keepOpen` BOOLEAN DEFAULT false,
    `debounceTime` INTEGER,
    `ignoreJids` JSON,
    `splitMessages` BOOLEAN DEFAULT false,
    `timePerChar` INTEGER DEFAULT 50,
    `triggerType` ENUM('all', 'keyword', 'none') NULL,
    `triggerOperator` ENUM('contains', 'equals', 'startsWith', 'endsWith', 'regex') NULL,
    `triggerValue` VARCHAR(191) NULL,
    `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `N8nSetting` (
    `id` VARCHAR(191) NOT NULL,
    `expire` INTEGER DEFAULT 0,
    `keywordFinish` VARCHAR(100),
    `delayMessage` INTEGER,
    `unknownMessage` VARCHAR(100),
    `listeningFromMe` BOOLEAN DEFAULT false,
    `stopBotFromMe` BOOLEAN DEFAULT false,
    `keepOpen` BOOLEAN DEFAULT false,
    `debounceTime` INTEGER,
    `ignoreJids` JSON,
    `splitMessages` BOOLEAN DEFAULT false,
    `timePerChar` INTEGER DEFAULT 50,
    `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `n8nIdFallback` VARCHAR(100),
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `N8nSetting_instanceId_key` ON `N8nSetting`(`instanceId`);

-- AddForeignKey
ALTER TABLE `N8n` ADD CONSTRAINT `N8n_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `N8nSetting` ADD CONSTRAINT `N8nSetting_n8nIdFallback_fkey` FOREIGN KEY (`n8nIdFallback`) REFERENCES `N8n`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `N8nSetting` ADD CONSTRAINT `N8nSetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
