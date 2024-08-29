/*
  Warnings:

  - You are about to drop the `Chat` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Chatwoot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Contact` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Dify` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DifySetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EvolutionBot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EvolutionBotSetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Flowise` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FlowiseSetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Instance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IntegrationSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Label` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Media` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Message` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MessageUpdate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OpenaiBot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OpenaiCreds` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OpenaiSetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Proxy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Rabbitmq` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Setting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Sqs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Template` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Typebot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TypebotSetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Webhook` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Websocket` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Chatwoot" DROP CONSTRAINT "Chatwoot_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Dify" DROP CONSTRAINT "Dify_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "DifySetting" DROP CONSTRAINT "DifySetting_difyIdFallback_fkey";

-- DropForeignKey
ALTER TABLE "DifySetting" DROP CONSTRAINT "DifySetting_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "EvolutionBot" DROP CONSTRAINT "EvolutionBot_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "EvolutionBotSetting" DROP CONSTRAINT "EvolutionBotSetting_botIdFallback_fkey";

-- DropForeignKey
ALTER TABLE "EvolutionBotSetting" DROP CONSTRAINT "EvolutionBotSetting_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Flowise" DROP CONSTRAINT "Flowise_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "FlowiseSetting" DROP CONSTRAINT "FlowiseSetting_flowiseIdFallback_fkey";

-- DropForeignKey
ALTER TABLE "FlowiseSetting" DROP CONSTRAINT "FlowiseSetting_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationSession" DROP CONSTRAINT "IntegrationSession_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Label" DROP CONSTRAINT "Label_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Media" DROP CONSTRAINT "Media_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Media" DROP CONSTRAINT "Media_messageId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "MessageUpdate" DROP CONSTRAINT "MessageUpdate_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "MessageUpdate" DROP CONSTRAINT "MessageUpdate_messageId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiBot" DROP CONSTRAINT "OpenaiBot_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiBot" DROP CONSTRAINT "OpenaiBot_openaiCredsId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiCreds" DROP CONSTRAINT "OpenaiCreds_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiSetting" DROP CONSTRAINT "OpenaiSetting_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiSetting" DROP CONSTRAINT "OpenaiSetting_openaiCredsId_fkey";

-- DropForeignKey
ALTER TABLE "OpenaiSetting" DROP CONSTRAINT "OpenaiSetting_openaiIdFallback_fkey";

-- DropForeignKey
ALTER TABLE "Proxy" DROP CONSTRAINT "Proxy_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Rabbitmq" DROP CONSTRAINT "Rabbitmq_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Sqs" DROP CONSTRAINT "Sqs_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Template" DROP CONSTRAINT "Template_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Typebot" DROP CONSTRAINT "Typebot_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "TypebotSetting" DROP CONSTRAINT "TypebotSetting_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "TypebotSetting" DROP CONSTRAINT "TypebotSetting_typebotIdFallback_fkey";

-- DropForeignKey
ALTER TABLE "Webhook" DROP CONSTRAINT "Webhook_instanceId_fkey";

-- DropForeignKey
ALTER TABLE "Websocket" DROP CONSTRAINT "Websocket_instanceId_fkey";

-- DropTable
DROP TABLE "Chat";

-- DropTable
DROP TABLE "Chatwoot";

-- DropTable
DROP TABLE "Contact";

-- DropTable
DROP TABLE "Dify";

-- DropTable
DROP TABLE "DifySetting";

-- DropTable
DROP TABLE "EvolutionBot";

-- DropTable
DROP TABLE "EvolutionBotSetting";

-- DropTable
DROP TABLE "Flowise";

-- DropTable
DROP TABLE "FlowiseSetting";

-- DropTable
DROP TABLE "Instance";

-- DropTable
DROP TABLE "IntegrationSession";

-- DropTable
DROP TABLE "Label";

-- DropTable
DROP TABLE "Media";

-- DropTable
DROP TABLE "Message";

-- DropTable
DROP TABLE "MessageUpdate";

-- DropTable
DROP TABLE "OpenaiBot";

-- DropTable
DROP TABLE "OpenaiCreds";

-- DropTable
DROP TABLE "OpenaiSetting";

-- DropTable
DROP TABLE "Proxy";

-- DropTable
DROP TABLE "Rabbitmq";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "Setting";

-- DropTable
DROP TABLE "Sqs";

-- DropTable
DROP TABLE "Template";

-- DropTable
DROP TABLE "Typebot";

-- DropTable
DROP TABLE "TypebotSetting";

-- DropTable
DROP TABLE "Webhook";

-- DropTable
DROP TABLE "Websocket";

-- CreateTable
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "connection_status" "InstanceConnectionStatus" NOT NULL DEFAULT 'open',
    "owner_jid" VARCHAR(100),
    "profile_name" VARCHAR(100),
    "profile_pic_url" VARCHAR(500),
    "integration" VARCHAR(100),
    "number" VARCHAR(100),
    "business_id" VARCHAR(100),
    "token" VARCHAR(255),
    "client_name" VARCHAR(100),
    "disconnection_reason_code" INTEGER,
    "disconnection_object" JSONB,
    "disconnection_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "creds" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "remote_jid" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100),
    "labels" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "remote_jid" VARCHAR(100) NOT NULL,
    "push_name" VARCHAR(100),
    "profile_pic_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "key" JSONB NOT NULL,
    "push_name" VARCHAR(100),
    "participant" VARCHAR(100),
    "message_type" VARCHAR(100) NOT NULL,
    "message" JSONB NOT NULL,
    "context_info" JSONB,
    "message_timestamp" INTEGER NOT NULL,
    "chatwoot_message_id" INTEGER,
    "chatwoot_inbox_id" INTEGER,
    "chatwoot_conversation_id" INTEGER,
    "chatwoot_contact_inbox_source_id" VARCHAR(100),
    "chatwoot_is_read" BOOLEAN,
    "webhook_url" VARCHAR(500),
    "source" "DeviceMessage" NOT NULL,
    "instance_id" TEXT NOT NULL,
    "session_id" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_updates" (
    "id" TEXT NOT NULL,
    "key_id" VARCHAR(100) NOT NULL,
    "remote_jid" VARCHAR(100) NOT NULL,
    "from_me" BOOLEAN NOT NULL,
    "participant" VARCHAR(100),
    "poll_updates" JSONB,
    "status" VARCHAR(30) NOT NULL,
    "message_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "message_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "enabled" BOOLEAN DEFAULT true,
    "events" JSONB,
    "webhook_by_events" BOOLEAN DEFAULT false,
    "webhook_base64" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatwoots" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN DEFAULT true,
    "account_id" VARCHAR(100),
    "token" VARCHAR(100),
    "url" VARCHAR(500),
    "name_inbox" VARCHAR(100),
    "sign_msg" BOOLEAN DEFAULT false,
    "sign_delimiter" VARCHAR(100),
    "number" VARCHAR(100),
    "reopen_conversation" BOOLEAN DEFAULT false,
    "conversation_pending" BOOLEAN DEFAULT false,
    "merge_brazil_contacts" BOOLEAN DEFAULT false,
    "import_contacts" BOOLEAN DEFAULT false,
    "import_messages" BOOLEAN DEFAULT false,
    "days_limit_import_messages" INTEGER,
    "organization" VARCHAR(100),
    "logo" VARCHAR(500),
    "ignore_jids" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "chatwoots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "label_id" VARCHAR(100),
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(100) NOT NULL,
    "predefined_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxies" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" VARCHAR(100) NOT NULL,
    "port" VARCHAR(100) NOT NULL,
    "protocol" VARCHAR(100) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "proxies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "reject_call" BOOLEAN NOT NULL DEFAULT false,
    "msg_call" VARCHAR(100),
    "groups_ignore" BOOLEAN NOT NULL DEFAULT false,
    "always_online" BOOLEAN NOT NULL DEFAULT false,
    "read_messages" BOOLEAN NOT NULL DEFAULT false,
    "read_status" BOOLEAN NOT NULL DEFAULT false,
    "sync_full_history" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rabbitmqs" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "rabbitmqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sqss" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "sqss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "websockets" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "websockets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "typebots" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "url" VARCHAR(500) NOT NULL,
    "typebot" VARCHAR(100) NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "ignore_jids" JSONB,
    "trigger_type" "TriggerType",
    "trigger_operator" "TriggerOperator",
    "trigger_value" TEXT,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "typebots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "typebot_settings" (
    "id" TEXT NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "typebot_id_fallback" VARCHAR(100),
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "typebot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medias" (
    "id" TEXT NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "created_at" DATE DEFAULT CURRENT_TIMESTAMP,
    "message_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "medias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openai_creds" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255),
    "api_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "openai_creds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openai_bots" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "assistant_id" VARCHAR(255),
    "function_url" VARCHAR(500),
    "model" VARCHAR(100),
    "system_messages" JSONB,
    "assistant_messages" JSONB,
    "user_messages" JSONB,
    "max_tokens" INTEGER,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "trigger_type" "TriggerType",
    "trigger_operator" "TriggerOperator",
    "trigger_value" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "bot_type" "OpenaiBotType" NOT NULL,
    "openai_creds_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "openai_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sessions" (
    "id" TEXT NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "remote_jid" VARCHAR(100) NOT NULL,
    "push_name" TEXT,
    "status" "SessionStatus" NOT NULL,
    "await_user" BOOLEAN NOT NULL DEFAULT false,
    "context" JSONB,
    "type" VARCHAR(100),
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "parameters" JSONB,
    "botId" TEXT,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "integration_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openai_settings" (
    "id" TEXT NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "speech_to_text" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "openai_creds_id" TEXT NOT NULL,
    "openai_id_fallback" VARCHAR(100),
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "openai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "template_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "template" JSONB NOT NULL,
    "webhook_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "difys" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "bot_type" "DifyBotType" NOT NULL,
    "api_url" VARCHAR(255),
    "api_key" VARCHAR(255),
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "trigger_type" "TriggerType",
    "trigger_operator" "TriggerOperator",
    "trigger_value" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "difys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dify_settings" (
    "id" TEXT NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "dify_id_fallback" VARCHAR(100),
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "dify_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_bots" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "api_url" VARCHAR(255),
    "api_key" VARCHAR(255),
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "trigger_type" "TriggerType",
    "trigger_operator" "TriggerOperator",
    "trigger_value" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "evolution_bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evolution_bot_settings" (
    "id" TEXT NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "bot_id_fallback" VARCHAR(100),
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "evolution_bot_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flowises" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "api_url" VARCHAR(255),
    "api_key" VARCHAR(255),
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "trigger_type" "TriggerType",
    "trigger_operator" "TriggerOperator",
    "trigger_value" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "flowises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flowise_settings" (
    "id" TEXT NOT NULL,
    "expire" INTEGER DEFAULT 0,
    "keyword_finish" VARCHAR(100),
    "delay_message" INTEGER,
    "unknown_message" VARCHAR(100),
    "listening_from_me" BOOLEAN DEFAULT false,
    "stop_bot_from_me" BOOLEAN DEFAULT false,
    "keep_open" BOOLEAN DEFAULT false,
    "debounce_time" INTEGER,
    "ignore_jids" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "flowise_id_fallback" VARCHAR(100),
    "instance_id" TEXT NOT NULL,

    CONSTRAINT "flowise_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instances_name_key" ON "instances"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_id_key" ON "sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_remote_jid_instance_id_key" ON "contacts"("remote_jid", "instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_instance_id_key" ON "webhooks"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoots_instance_id_key" ON "chatwoots"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "labels_label_id_instance_id_key" ON "labels"("label_id", "instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "proxies_instance_id_key" ON "proxies"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_instance_id_key" ON "settings"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "rabbitmqs_instance_id_key" ON "rabbitmqs"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "sqss_instance_id_key" ON "sqss"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "websockets_instance_id_key" ON "websockets"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "typebot_settings_instance_id_key" ON "typebot_settings"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "medias_file_name_key" ON "medias"("file_name");

-- CreateIndex
CREATE UNIQUE INDEX "medias_message_id_key" ON "medias"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "openai_creds_name_key" ON "openai_creds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "openai_creds_api_key_key" ON "openai_creds"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sessions_session_id_key" ON "integration_sessions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "openai_settings_openai_creds_id_key" ON "openai_settings"("openai_creds_id");

-- CreateIndex
CREATE UNIQUE INDEX "openai_settings_instance_id_key" ON "openai_settings"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "templates_template_id_key" ON "templates"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "templates_name_key" ON "templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dify_settings_instance_id_key" ON "dify_settings"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "evolution_bot_settings_instance_id_key" ON "evolution_bot_settings"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "flowise_settings_instance_id_key" ON "flowise_settings"("instance_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "integration_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_updates" ADD CONSTRAINT "message_updates_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_updates" ADD CONSTRAINT "message_updates_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatwoots" ADD CONSTRAINT "chatwoots_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxies" ADD CONSTRAINT "proxies_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rabbitmqs" ADD CONSTRAINT "rabbitmqs_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sqss" ADD CONSTRAINT "sqss_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "websockets" ADD CONSTRAINT "websockets_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "typebots" ADD CONSTRAINT "typebots_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "typebot_settings" ADD CONSTRAINT "typebot_settings_typebot_id_fallback_fkey" FOREIGN KEY ("typebot_id_fallback") REFERENCES "typebots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "typebot_settings" ADD CONSTRAINT "typebot_settings_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medias" ADD CONSTRAINT "medias_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medias" ADD CONSTRAINT "medias_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_creds" ADD CONSTRAINT "openai_creds_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_bots" ADD CONSTRAINT "openai_bots_openai_creds_id_fkey" FOREIGN KEY ("openai_creds_id") REFERENCES "openai_creds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_bots" ADD CONSTRAINT "openai_bots_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sessions" ADD CONSTRAINT "integration_sessions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_settings" ADD CONSTRAINT "openai_settings_openai_creds_id_fkey" FOREIGN KEY ("openai_creds_id") REFERENCES "openai_creds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_settings" ADD CONSTRAINT "openai_settings_openai_id_fallback_fkey" FOREIGN KEY ("openai_id_fallback") REFERENCES "openai_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openai_settings" ADD CONSTRAINT "openai_settings_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "difys" ADD CONSTRAINT "difys_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dify_settings" ADD CONSTRAINT "dify_settings_dify_id_fallback_fkey" FOREIGN KEY ("dify_id_fallback") REFERENCES "difys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dify_settings" ADD CONSTRAINT "dify_settings_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_bots" ADD CONSTRAINT "evolution_bots_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_bot_settings" ADD CONSTRAINT "evolution_bot_settings_bot_id_fallback_fkey" FOREIGN KEY ("bot_id_fallback") REFERENCES "evolution_bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolution_bot_settings" ADD CONSTRAINT "evolution_bot_settings_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flowises" ADD CONSTRAINT "flowises_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flowise_settings" ADD CONSTRAINT "flowise_settings_flowise_id_fallback_fkey" FOREIGN KEY ("flowise_id_fallback") REFERENCES "flowises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flowise_settings" ADD CONSTRAINT "flowise_settings_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
