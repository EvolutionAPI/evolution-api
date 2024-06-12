import { CacheEngine } from '../cache/cacheengine';
import { configService, ProviderSession } from '../config/env.config';
import { eventEmitter } from '../config/event.config';
import { Logger } from '../config/logger.config';
import { dbserver } from '../libs/db.connect';
import { ChatController } from './controllers/chat.controller';
import { GroupController } from './controllers/group.controller';
import { InstanceController } from './controllers/instance.controller';
import { LabelController } from './controllers/label.controller';
import { ProxyController } from './controllers/proxy.controller';
import { SendMessageController } from './controllers/sendMessage.controller';
import { SettingsController } from './controllers/settings.controller';
import { WebhookController } from './controllers/webhook.controller';
import { ChamaaiController } from './integrations/chamaai/controllers/chamaai.controller';
import { ChamaaiRepository } from './integrations/chamaai/repository/chamaai.repository';
import { ChamaaiService } from './integrations/chamaai/services/chamaai.service';
import { ChatwootController } from './integrations/chatwoot/controllers/chatwoot.controller';
import { ChatwootRepository } from './integrations/chatwoot/repository/chatwoot.repository';
import { ChatwootService } from './integrations/chatwoot/services/chatwoot.service';
import { RabbitmqController } from './integrations/rabbitmq/controllers/rabbitmq.controller';
import { RabbitmqRepository } from './integrations/rabbitmq/repository/rabbitmq.repository';
import { RabbitmqService } from './integrations/rabbitmq/services/rabbitmq.service';
import { SqsController } from './integrations/sqs/controllers/sqs.controller';
import { SqsRepository } from './integrations/sqs/repository/sqs.repository';
import { SqsService } from './integrations/sqs/services/sqs.service';
import { TypebotController } from './integrations/typebot/controllers/typebot.controller';
import { TypebotRepository } from './integrations/typebot/repository/typebot.repository';
import { TypebotService } from './integrations/typebot/services/typebot.service';
import { WebsocketController } from './integrations/websocket/controllers/websocket.controller';
import { WebsocketRepository } from './integrations/websocket/repository/websocket.repository';
import { WebsocketService } from './integrations/websocket/services/websocket.service';
import {
  AuthModel,
  ChamaaiModel,
  ChatModel,
  ChatwootModel,
  ContactModel,
  IntegrationModel,
  MessageModel,
  MessageUpModel,
  ProxyModel,
  RabbitmqModel,
  SettingsModel,
  SqsModel,
  TypebotModel,
  WebhookModel,
  WebsocketModel,
} from './models';
import { LabelModel } from './models/label.model';
import { ProviderFiles } from './provider/sessions';
import { AuthRepository } from './repository/auth.repository';
import { ChatRepository } from './repository/chat.repository';
import { ContactRepository } from './repository/contact.repository';
import { IntegrationRepository } from './repository/integration.repository';
import { LabelRepository } from './repository/label.repository';
import { MessageRepository } from './repository/message.repository';
import { MessageUpRepository } from './repository/messageUp.repository';
import { ProxyRepository } from './repository/proxy.repository';
import { RepositoryBroker } from './repository/repository.manager';
import { SettingsRepository } from './repository/settings.repository';
import { WebhookRepository } from './repository/webhook.repository';
import { AuthService } from './services/auth.service';
import { CacheService } from './services/cache.service';
import { IntegrationService } from './services/integration.service';
import { WAMonitoringService } from './services/monitor.service';
import { ProxyService } from './services/proxy.service';
import { SettingsService } from './services/settings.service';
import { WebhookService } from './services/webhook.service';

const logger = new Logger('WA MODULE');

const messageRepository = new MessageRepository(MessageModel, configService);
const chatRepository = new ChatRepository(ChatModel, configService);
const contactRepository = new ContactRepository(ContactModel, configService);
const messageUpdateRepository = new MessageUpRepository(MessageUpModel, configService);
const typebotRepository = new TypebotRepository(TypebotModel, configService);
const webhookRepository = new WebhookRepository(WebhookModel, configService);
const websocketRepository = new WebsocketRepository(WebsocketModel, configService);
const proxyRepository = new ProxyRepository(ProxyModel, configService);
const chamaaiRepository = new ChamaaiRepository(ChamaaiModel, configService);
const rabbitmqRepository = new RabbitmqRepository(RabbitmqModel, configService);
const sqsRepository = new SqsRepository(SqsModel, configService);
const integrationRepository = new IntegrationRepository(IntegrationModel, configService);
const chatwootRepository = new ChatwootRepository(ChatwootModel, configService);
const settingsRepository = new SettingsRepository(SettingsModel, configService);
const authRepository = new AuthRepository(AuthModel, IntegrationModel, configService);
const labelRepository = new LabelRepository(LabelModel, configService);

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
  sqsRepository,
  typebotRepository,
  proxyRepository,
  chamaaiRepository,
  integrationRepository,
  authRepository,
  labelRepository,
  configService,
  dbserver?.getClient(),
);

export const cache = new CacheService(new CacheEngine(configService, 'instance').getEngine());
const chatwootCache = new CacheService(new CacheEngine(configService, ChatwootService.name).getEngine());
const baileysCache = new CacheService(new CacheEngine(configService, 'baileys').getEngine());

let providerFiles: ProviderFiles = null;

if (configService.get<ProviderSession>('PROVIDER')?.ENABLED) {
  providerFiles = new ProviderFiles(configService);
}

export const waMonitor = new WAMonitoringService(
  eventEmitter,
  configService,
  repository,
  cache,
  chatwootCache,
  baileysCache,
  providerFiles,
);

const authService = new AuthService(configService, waMonitor, repository);

const typebotService = new TypebotService(waMonitor, configService, eventEmitter);
export const typebotController = new TypebotController(typebotService);

const webhookService = new WebhookService(waMonitor);
export const webhookController = new WebhookController(webhookService, waMonitor);

const websocketService = new WebsocketService(waMonitor);
export const websocketController = new WebsocketController(websocketService);

const proxyService = new ProxyService(waMonitor);
export const proxyController = new ProxyController(proxyService, waMonitor);

const chamaaiService = new ChamaaiService(waMonitor, configService);
export const chamaaiController = new ChamaaiController(chamaaiService);

const rabbitmqService = new RabbitmqService(waMonitor);
export const rabbitmqController = new RabbitmqController(rabbitmqService);

const sqsService = new SqsService(waMonitor);
export const sqsController = new SqsController(sqsService);

const integrationService = new IntegrationService(waMonitor);

const chatwootService = new ChatwootService(waMonitor, configService, repository, chatwootCache);
export const chatwootController = new ChatwootController(chatwootService, configService, repository);

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
  sqsService,
  typebotService,
  integrationService,
  proxyController,
  cache,
  chatwootCache,
  baileysCache,
  providerFiles,
);
export const sendMessageController = new SendMessageController(waMonitor);
export const chatController = new ChatController(waMonitor);
export const groupController = new GroupController(waMonitor);
export const labelController = new LabelController(waMonitor);

logger.info('Module - ON');
