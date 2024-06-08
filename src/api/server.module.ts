import { CacheEngine } from '../cache/cacheengine';
import { Chatwoot, configService } from '../config/env.config';
import { eventEmitter } from '../config/event.config';
import { Logger } from '../config/logger.config';
import { ChatController } from './controllers/chat.controller';
import { GroupController } from './controllers/group.controller';
import { InstanceController } from './controllers/instance.controller';
import { LabelController } from './controllers/label.controller';
import { ProxyController } from './controllers/proxy.controller';
import { SendMessageController } from './controllers/sendMessage.controller';
import { SettingsController } from './controllers/settings.controller';
import { WebhookController } from './controllers/webhook.controller';
import { ChatwootController } from './integrations/chatwoot/controllers/chatwoot.controller';
import { ChatwootService } from './integrations/chatwoot/services/chatwoot.service';
import { RabbitmqController } from './integrations/rabbitmq/controllers/rabbitmq.controller';
import { RabbitmqService } from './integrations/rabbitmq/services/rabbitmq.service';
import { SqsController } from './integrations/sqs/controllers/sqs.controller';
import { SqsService } from './integrations/sqs/services/sqs.service';
import { TypebotController } from './integrations/typebot/controllers/typebot.controller';
import { TypebotService } from './integrations/typebot/services/typebot.service';
import { WebsocketController } from './integrations/websocket/controllers/websocket.controller';
import { WebsocketService } from './integrations/websocket/services/websocket.service';
import { ProviderFiles } from './provider/sessions';
import { PrismaRepository } from './repository/repository.service';
import { AuthService } from './services/auth.service';
import { CacheService } from './services/cache.service';
import { WAMonitoringService } from './services/monitor.service';
import { ProxyService } from './services/proxy.service';
import { SettingsService } from './services/settings.service';
import { WebhookService } from './services/webhook.service';

const logger = new Logger('WA MODULE');

let chatwootCache: CacheService = null;
if (configService.get<Chatwoot>('CHATWOOT').ENABLED) {
  chatwootCache = new CacheService(new CacheEngine(configService, ChatwootService.name).getEngine());
}

export const cache = new CacheService(new CacheEngine(configService, 'instance').getEngine());
const baileysCache = new CacheService(new CacheEngine(configService, 'baileys').getEngine());

const providerFiles = new ProviderFiles(configService);
export const prismaRepository = new PrismaRepository(configService);

export const waMonitor = new WAMonitoringService(
  eventEmitter,
  configService,
  prismaRepository,
  providerFiles,
  cache,
  chatwootCache,
  baileysCache,
);

const authService = new AuthService(prismaRepository);

const typebotService = new TypebotService(waMonitor, configService, prismaRepository, eventEmitter);
export const typebotController = new TypebotController(typebotService);

const webhookService = new WebhookService(waMonitor);
export const webhookController = new WebhookController(webhookService, waMonitor);

const websocketService = new WebsocketService(waMonitor);
export const websocketController = new WebsocketController(websocketService);

const proxyService = new ProxyService(waMonitor);
export const proxyController = new ProxyController(proxyService, waMonitor);

const rabbitmqService = new RabbitmqService(waMonitor);
export const rabbitmqController = new RabbitmqController(rabbitmqService);

const sqsService = new SqsService(waMonitor);
export const sqsController = new SqsController(sqsService);

const chatwootService = new ChatwootService(waMonitor, configService, prismaRepository, chatwootCache);
export const chatwootController = new ChatwootController(chatwootService, configService, prismaRepository);

const settingsService = new SettingsService(waMonitor);
export const settingsController = new SettingsController(settingsService);

export const instanceController = new InstanceController(
  waMonitor,
  configService,
  prismaRepository,
  eventEmitter,
  authService,
  webhookService,
  chatwootService,
  settingsService,
  websocketService,
  rabbitmqService,
  sqsService,
  typebotService,
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
