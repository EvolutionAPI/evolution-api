/*
  Warnings:

  - You are about to alter the column `createdAt` on the `Chat` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Chat` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Chatwoot` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Chatwoot` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Contact` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Contact` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Dify` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Dify` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `DifySetting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `DifySetting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `disconnectionAt` on the `Instance` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Instance` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Instance` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to drop the column `difyId` on the `IntegrationSession` table. All the data in the column will be lost.
  - You are about to drop the column `openaiBotId` on the `IntegrationSession` table. All the data in the column will be lost.
  - You are about to drop the column `typebotId` on the `IntegrationSession` table. All the data in the column will be lost.
  - You are about to alter the column `createdAt` on the `IntegrationSession` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `IntegrationSession` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Label` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Label` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Media` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `OpenaiBot` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `OpenaiBot` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `OpenaiCreds` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `OpenaiCreds` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `OpenaiSetting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `OpenaiSetting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Proxy` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Proxy` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Rabbitmq` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Rabbitmq` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Session` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Setting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Setting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Sqs` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Sqs` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Template` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Template` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Typebot` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Typebot` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `TypebotSetting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `TypebotSetting` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Webhook` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Webhook` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `createdAt` on the `Websocket` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - You are about to alter the column `updatedAt` on the `Websocket` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.

*/
-- DropForeignKey
ALTER TABLE `IntegrationSession` DROP FOREIGN KEY `IntegrationSession_difyId_fkey`;

-- DropForeignKey
ALTER TABLE `IntegrationSession` DROP FOREIGN KEY `IntegrationSession_openaiBotId_fkey`;

-- DropForeignKey
ALTER TABLE `IntegrationSession` DROP FOREIGN KEY `IntegrationSession_typebotId_fkey`;

-- DropIndex
DROP INDEX `Message_typebotSessionId_fkey` ON `Message`;

-- AlterTable
ALTER TABLE `Chat` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `Chatwoot` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Contact` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `Dify` MODIFY `triggerType` ENUM('all', 'keyword', 'none', 'advanced') NULL,
    MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `DifySetting` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Instance` MODIFY `disconnectionAt` TIMESTAMP NULL,
    MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NULL;

-- AlterTable
ALTER TABLE `IntegrationSession` DROP COLUMN `difyId`,
    DROP COLUMN `openaiBotId`,
    DROP COLUMN `typebotId`,
    ADD COLUMN `botId` VARCHAR(191) NULL,
    ADD COLUMN `context` JSON NULL,
    MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Label` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Media` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `OpenaiBot` MODIFY `triggerType` ENUM('all', 'keyword', 'none', 'advanced') NULL,
    MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `OpenaiCreds` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `OpenaiSetting` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Proxy` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Rabbitmq` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Session` MODIFY `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE `Setting` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Sqs` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Template` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Typebot` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NULL,
    MODIFY `triggerType` ENUM('all', 'keyword', 'none', 'advanced') NULL;

-- AlterTable
ALTER TABLE `TypebotSetting` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Webhook` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- AlterTable
ALTER TABLE `Websocket` MODIFY `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    MODIFY `updatedAt` TIMESTAMP NOT NULL;

-- CreateTable
CREATE TABLE `GenericBot` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255) NULL,
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
    `triggerType` ENUM('all', 'keyword', 'none', 'advanced') NULL,
    `triggerOperator` ENUM('contains', 'equals', 'startsWith', 'endsWith', 'regex') NULL,
    `triggerValue` VARCHAR(191) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GenericSetting` (
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
    `botIdFallback` VARCHAR(100) NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `GenericSetting_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Flowise` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(255) NULL,
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
    `triggerType` ENUM('all', 'keyword', 'none', 'advanced') NULL,
    `triggerOperator` ENUM('contains', 'equals', 'startsWith', 'endsWith', 'regex') NULL,
    `triggerValue` VARCHAR(191) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FlowiseSetting` (
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
    `flowiseIdFallback` VARCHAR(100) NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `FlowiseSetting_instanceId_key`(`instanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GenericBot` ADD CONSTRAINT `GenericBot_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenericSetting` ADD CONSTRAINT `GenericSetting_botIdFallback_fkey` FOREIGN KEY (`botIdFallback`) REFERENCES `GenericBot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenericSetting` ADD CONSTRAINT `GenericSetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Flowise` ADD CONSTRAINT `Flowise_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlowiseSetting` ADD CONSTRAINT `FlowiseSetting_flowiseIdFallback_fkey` FOREIGN KEY (`flowiseIdFallback`) REFERENCES `Flowise`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FlowiseSetting` ADD CONSTRAINT `FlowiseSetting_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
