import { configService } from '../config/env.config';
import { eventEmitter } from '../config/event.config';
import { Logger } from '../config/logger.config';
import { dbserver } from '../libs/db.connect';
import { RedisCache } from '../libs/redis.client';
import { ChatController } from './controllers/chat.controller';
import { ChatwootController } from './controllers/chatwoot.controller';
import { GroupController } from './controllers/group.controller';
import { InstanceController } from './controllers/instance.controller';
import { ProxyController } from './controllers/proxy.controller';
import { RabbitmqController } from './controllers/rabbitmq.controller';
import { SendMessageController } from './controllers/sendMessage.controller';
import { SettingsController } from './controllers/settings.controller';
import { TypebotController } from './controllers/typebot.controller';
import { ViewsController } from './controllers/views.controller';
import { WebhookController } from './controllers/webhook.controller';
import { WebsocketController } from './controllers/websocket.controller';
import {
  AuthModel,
  ChatModel,
  ChatwootModel,
  ContactModel,
  MessageModel,
  MessageUpModel,
  ProxyModel,
  RabbitmqModel,
  SettingsModel,
  TypebotModel,
  WebhookModel,
  WebsocketModel,
} from './models';
import { AuthRepository } from './repository/auth.repository';
import { ChatRepository } from './repository/chat.repository';
import { ChatwootRepository } from './repository/chatwoot.repository';
import { ContactRepository } from './repository/contact.repository';
import { MessageRepository } from './repository/message.repository';
import { MessageUpRepository } from './repository/messageUp.repository';
import { ProxyRepository } from './repository/proxy.repository';
import { RabbitmqRepository } from './repository/rabbitmq.repository';
import { RepositoryBroker } from './repository/repository.manager';
import { SettingsRepository } from './repository/settings.repository';
import { TypebotRepository } from './repository/typebot.repository';
import { WebhookRepository } from './repository/webhook.repository';
import { WebsocketRepository } from './repository/websocket.repository';
import { AuthService } from './services/auth.service';
import { ChatwootService } from './services/chatwoot.service';
import { WAMonitoringService } from './services/monitor.service';
import { ProxyService } from './services/proxy.service';
import { RabbitmqService } from './services/rabbitmq.service';
import { SettingsService } from './services/settings.service';
import { TypebotService } from './services/typebot.service';
import { WebhookService } from './services/webhook.service';
import { WebsocketService } from './services/websocket.service';

const logger = new Logger('WA MODULE');

const messageRepository = new MessageRepository(MessageModel, configService);
const chatRepository = new ChatRepository(ChatModel, configService);
const contactRepository = new ContactRepository(ContactModel, configService);
const messageUpdateRepository = new MessageUpRepository(MessageUpModel, configService);
const typebotRepository = new TypebotRepository(TypebotModel, configService);
const webhookRepository = new WebhookRepository(WebhookModel, configService);
const websocketRepository = new WebsocketRepository(WebsocketModel, configService);
const proxyRepository = new ProxyRepository(ProxyModel, configService);
const rabbitmqRepository = new RabbitmqRepository(RabbitmqModel, configService);
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
  websocketRepository,
  rabbitmqRepository,
  typebotRepository,
  proxyRepository,
  authRepository,
  configService,
  dbserver?.getClient(),
);

export const cache = new RedisCache();

export const waMonitor = new WAMonitoringService(eventEmitter, configService, repository, cache);

const authService = new AuthService(configService, waMonitor, repository);

const typebotService = new TypebotService(waMonitor);

export const typebotController = new TypebotController(typebotService);

const webhookService = new WebhookService(waMonitor);

export const webhookController = new WebhookController(webhookService);

const websocketService = new WebsocketService(waMonitor);

export const websocketController = new WebsocketController(websocketService);

const proxyService = new ProxyService(waMonitor);

export const proxyController = new ProxyController(proxyService);

const rabbitmqService = new RabbitmqService(waMonitor);

export const rabbitmqController = new RabbitmqController(rabbitmqService);

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
  settingsService,
  websocketService,
  rabbitmqService,
  typebotService,
  cache,
);
export const viewsController = new ViewsController(waMonitor, configService);
export const sendMessageController = new SendMessageController(waMonitor);
export const chatController = new ChatController(waMonitor);
export const groupController = new GroupController(waMonitor);

logger.info('Module - ON');
