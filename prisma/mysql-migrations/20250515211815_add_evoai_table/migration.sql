-- CreateTable
CREATE TABLE `Evoai` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255),
    `agentUrl` VARCHAR(255),
    `apiKey` VARCHAR(255),
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
CREATE TABLE `EvoaiSetting` (
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
    `evoaiIdFallback` VARCHAR(100),
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `EvoaiSetting_instanceId_key` ON `EvoaiSetting`(`instanceId`);

-- AddForeignKey
ALTER TABLE `Evoai` ADD CONSTRAINT `Evoai_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvoaiSetting` ADD CONSTRAINT `EvoaiSetting_evoaiIdFallback_fkey` FOREIGN KEY (`evoaiIdFallback`) REFERENCES `Evoai`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvoaiSetting` ADD CONSTRAINT `EvoaiSetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
