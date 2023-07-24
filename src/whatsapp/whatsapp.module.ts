import { Auth, configService } from '../config/env.config';
import { Logger } from '../config/logger.config';
import { eventEmitter } from '../config/event.config';
import { MessageRepository } from './repository/message.repository';
import { WAMonitoringService } from './services/monitor.service';
import { ChatRepository } from './repository/chat.repository';
import { ContactRepository } from './repository/contact.repository';
import { MessageUpRepository } from './repository/messageUp.repository';
import { ChatController } from './controllers/chat.controller';
import { InstanceController } from './controllers/instance.controller';
import { SendMessageController } from './controllers/sendMessage.controller';
import { AuthService } from './services/auth.service';
import { GroupController } from './controllers/group.controller';
import { ViewsController } from './controllers/views.controller';
import { WebhookService } from './services/webhook.service';
import { WebhookController } from './controllers/webhook.controller';
import { ChatwootService } from './services/chatwoot.service';
import { ChatwootController } from './controllers/chatwoot.controller';
import { RepositoryBroker } from './repository/repository.manager';
import {
  AuthModel,
  ChatModel,
  ContactModel,
  MessageModel,
  MessageUpModel,
  ChatwootModel,
  WebhookModel,
  SettingsModel,
} from './models';
import { dbserver } from '../db/db.connect';
import { WebhookRepository } from './repository/webhook.repository';
import { ChatwootRepository } from './repository/chatwoot.repository';
import { AuthRepository } from './repository/auth.repository';
import { WAStartupService } from './services/whatsapp.service';
import { delay } from '@whiskeysockets/baileys';
import { Events } from './types/wa.types';
import { RedisCache } from '../db/redis.client';
import { SettingsRepository } from './repository/settings.repository';
import { SettingsService } from './services/settings.service';
import { SettingsController } from './controllers/settings.controller';

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
