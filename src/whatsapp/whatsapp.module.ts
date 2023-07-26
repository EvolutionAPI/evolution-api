import { delay } from '@whiskeysockets/baileys';

import { Auth, configService } from '../config/env.config';
import { eventEmitter } from '../config/event.config';
import { Logger } from '../config/logger.config';
import { dbserver } from '../db/db.connect';
import { RedisCache } from '../db/redis.client';
import { ChatController } from './controllers/chat.controller';
import { ChatwootController } from './controllers/chatwoot.controller';
import { GroupController } from './controllers/group.controller';
import { InstanceController } from './controllers/instance.controller';
import { SendMessageController } from './controllers/sendMessage.controller';
import { SettingsController } from './controllers/settings.controller';
import { ViewsController } from './controllers/views.controller';
import { WebhookController } from './controllers/webhook.controller';
import {
  AuthModel,
  ChatModel,
  ChatwootModel,
  ContactModel,
  MessageModel,
  MessageUpModel,
  SettingsModel,
  WebhookModel,
} from './models';
import { AuthRepository } from './repository/auth.repository';
import { ChatRepository } from './repository/chat.repository';
import { ChatwootRepository } from './repository/chatwoot.repository';
import { ContactRepository } from './repository/contact.repository';
import { MessageRepository } from './repository/message.repository';
import { MessageUpRepository } from './repository/messageUp.repository';
import { RepositoryBroker } from './repository/repository.manager';
import { SettingsRepository } from './repository/settings.repository';
import { WebhookRepository } from './repository/webhook.repository';
import { AuthService } from './services/auth.service';
import { ChatwootService } from './services/chatwoot.service';
import { WAMonitoringService } from './services/monitor.service';
import { SettingsService } from './services/settings.service';
import { WebhookService } from './services/webhook.service';
import { WAStartupService } from './services/whatsapp.service';
import { Events } from './types/wa.types';

const logger = new Logger('WA MODULE');

const messageRepository = new MessageRepository(MessageModel, configService);
const chatRepository = new ChatRepository(ChatModel, configService);
const contactRepository = new ContactRepository(ContactModel, configService);
const messageUpdateRepository = new MessageUpRepository(MessageUpModel, configService);
const webhookRepository = new WebhookRepository(WebhookModel, configService);
const chatwootRepository = new ChatwootRepository(ChatwootModel, configService);
const settingsRepository = new SettingsRepository(SettingsModel, configService);
const authRepository = new AuthRepository(AuthModel, configService);

export const repository = new RepositoryBroker(
  messageRepository,
  chatRepository,
  contactRepository,
  messageUpdateRepository,
  webhookRepository,
  chatwootRepository,
  settingsRepository,
  authRepository,
  configService,
  dbserver?.getClient(),
);

export const cache = new RedisCache();

export const waMonitor = new WAMonitoringService(
  eventEmitter,
  configService,
  repository,
  cache,
);

const authService = new AuthService(configService, waMonitor, repository);

const webhookService = new WebhookService(waMonitor);

export const webhookController = new WebhookController(webhookService);

const chatwootService = new ChatwootService(waMonitor, configService);

export const chatwootController = new ChatwootController(chatwootService, configService);

const settingsService = new SettingsService(waMonitor);

export const settingsController = new SettingsController(settingsService);

export const instanceController = new InstanceController(
  waMonitor,
  configService,
  repository,
  eventEmitter,
  authService,
  webhookService,
  chatwootService,
  cache,
);
export const viewsController = new ViewsController(waMonitor, configService);
export const sendMessageController = new SendMessageController(waMonitor);
export const chatController = new ChatController(waMonitor);
export const groupController = new GroupController(waMonitor);

logger.info('Module - ON');
