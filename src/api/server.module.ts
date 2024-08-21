import { CacheEngine } from '@cache/cacheengine';
import { Chatwoot, configService, ProviderSession } from '@config/env.config';
import { eventEmitter } from '@config/event.config';
import { Logger } from '@config/logger.config';

import { ChatController } from './controllers/chat.controller';
import { GroupController } from './controllers/group.controller';
import { InstanceController } from './controllers/instance.controller';
import { LabelController } from './controllers/label.controller';
import { ProxyController } from './controllers/proxy.controller';
import { SendMessageController } from './controllers/sendMessage.controller';
import { SettingsController } from './controllers/settings.controller';
import { TemplateController } from './controllers/template.controller';
import { ChannelController } from './integrations/channel/channel.controller';
import { ChatbotController } from './integrations/chatbot/chatbot.controller';
import { ChatwootController } from './integrations/chatbot/chatwoot/controllers/chatwoot.controller';
import { ChatwootService } from './integrations/chatbot/chatwoot/services/chatwoot.service';
import { DifyController } from './integrations/chatbot/dify/controllers/dify.controller';
import { DifyService } from './integrations/chatbot/dify/services/dify.service';
import { FlowiseController } from './integrations/chatbot/flowise/controllers/flowise.controller';
import { FlowiseService } from './integrations/chatbot/flowise/services/flowise.service';
import { GenericController } from './integrations/chatbot/generic/controllers/generic.controller';
import { GenericService } from './integrations/chatbot/generic/services/generic.service';
import { OpenaiController } from './integrations/chatbot/openai/controllers/openai.controller';
import { OpenaiService } from './integrations/chatbot/openai/services/openai.service';
import { TypebotController } from './integrations/chatbot/typebot/controllers/typebot.controller';
import { TypebotService } from './integrations/chatbot/typebot/services/typebot.service';
import { EventController } from './integrations/event/event.controller';
import { RabbitmqController } from './integrations/event/rabbitmq/controllers/rabbitmq.controller';
import { SqsController } from './integrations/event/sqs/controllers/sqs.controller';
import { WebhookController } from './integrations/event/webhook/controllers/webhook.controller';
import { WebsocketController } from './integrations/event/websocket/controllers/websocket.controller';
import { S3Controller } from './integrations/storage/s3/controllers/s3.controller';
import { S3Service } from './integrations/storage/s3/services/s3.service';
import { ProviderFiles } from './provider/sessions';
import { PrismaRepository } from './repository/repository.service';
import { CacheService } from './services/cache.service';
import { WAMonitoringService } from './services/monitor.service';
import { ProxyService } from './services/proxy.service';
import { SettingsService } from './services/settings.service';
import { TemplateService } from './services/template.service';

const logger = new Logger('WA MODULE');

let chatwootCache: CacheService = null;
if (configService.get<Chatwoot>('CHATWOOT').ENABLED) {
  chatwootCache = new CacheService(new CacheEngine(configService, ChatwootService.name).getEngine());
}

export const cache = new CacheService(new CacheEngine(configService, 'instance').getEngine());
const baileysCache = new CacheService(new CacheEngine(configService, 'baileys').getEngine());

let providerFiles: ProviderFiles = null;
if (configService.get<ProviderSession>('PROVIDER').ENABLED) {
  providerFiles = new ProviderFiles(configService);
}

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

const s3Service = new S3Service(prismaRepository);
export const s3Controller = new S3Controller(s3Service);

const templateService = new TemplateService(waMonitor, prismaRepository, configService);
export const templateController = new TemplateController(templateService);

const proxyService = new ProxyService(waMonitor);
export const proxyController = new ProxyController(proxyService, waMonitor);

const chatwootService = new ChatwootService(waMonitor, configService, prismaRepository, chatwootCache);
export const chatwootController = new ChatwootController(chatwootService, configService, prismaRepository);

const settingsService = new SettingsService(waMonitor);
export const settingsController = new SettingsController(settingsService);

export const instanceController = new InstanceController(
  waMonitor,
  configService,
  prismaRepository,
  eventEmitter,
  chatwootService,
  settingsService,
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

export const eventController = new EventController(prismaRepository, waMonitor);
export const chatbotController = new ChatbotController(prismaRepository, waMonitor);
export const channelController = new ChannelController();

// events
export const websocketController = new WebsocketController(prismaRepository, waMonitor);
export const rabbitmqController = new RabbitmqController(prismaRepository, waMonitor);
export const sqsController = new SqsController(prismaRepository, waMonitor);
export const webhookController = new WebhookController(prismaRepository, waMonitor);

// chatbots
const typebotService = new TypebotService(waMonitor, configService, prismaRepository);
export const typebotController = new TypebotController(typebotService, prismaRepository, waMonitor);

const openaiService = new OpenaiService(waMonitor, configService, prismaRepository);
export const openaiController = new OpenaiController(openaiService, prismaRepository, waMonitor);

const difyService = new DifyService(waMonitor, configService, prismaRepository);
export const difyController = new DifyController(difyService, prismaRepository, waMonitor);

const genericService = new GenericService(waMonitor, configService, prismaRepository);
export const genericController = new GenericController(genericService, prismaRepository, waMonitor);

const flowiseService = new FlowiseService(waMonitor, configService, prismaRepository);
export const flowiseController = new FlowiseController(flowiseService, prismaRepository, waMonitor);

logger.info('Module - ON');
