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
} from './models';
import { dbserver } from '../db/db.connect';
import { WebhookRepository } from './repository/webhook.repository';
import { ChatwootRepository } from './repository/chatwoot.repository';
import { AuthRepository } from './repository/auth.repository';
import { WAStartupService } from './services/whatsapp.service';
import { delay } from '@whiskeysockets/baileys';
import { Events } from './types/wa.types';
import { RedisCache } from '../db/redis.client';

const logger = new Logger('WA MODULE');

const messageRepository = new MessageRepository(MessageModel, configService);
const chatRepository = new ChatRepository(ChatModel, configService);
const contactRepository = new ContactRepository(ContactModel, configService);
const messageUpdateRepository = new MessageUpRepository(MessageUpModel, configService);
const webhookRepository = new WebhookRepository(WebhookModel, configService);
const chatwootRepository = new ChatwootRepository(ChatwootModel, configService);
const authRepository = new AuthRepository(AuthModel, configService);

export const repository = new RepositoryBroker(
  messageRepository,
  chatRepository,
  contactRepository,
  messageUpdateRepository,
  webhookRepository,
  chatwootRepository,
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

export async function initInstance() {
  const instance = new WAStartupService(configService, eventEmitter, repository, cache);

  const mode = configService.get<Auth>('AUTHENTICATION').INSTANCE.MODE;

  logger.verbose('Sending data webhook for event: ' + Events.APPLICATION_STARTUP);
  instance.sendDataWebhook(
    Events.APPLICATION_STARTUP,
    {
      message: 'Application startup',
      mode,
    },
    false,
  );

  if (mode === 'container') {
    logger.verbose('Application startup in container mode');

    const instanceName = configService.get<Auth>('AUTHENTICATION').INSTANCE.NAME;
    logger.verbose('Instance name: ' + instanceName);

    const instanceWebhook =
      configService.get<Auth>('AUTHENTICATION').INSTANCE.WEBHOOK_URL;
    logger.verbose('Instance webhook: ' + instanceWebhook);

    const chatwootAccountId =
      configService.get<Auth>('AUTHENTICATION').INSTANCE.CHATWOOT_ACCOUNT_ID;
    logger.verbose('Chatwoot account id: ' + chatwootAccountId);

    const chatwootToken =
      configService.get<Auth>('AUTHENTICATION').INSTANCE.CHATWOOT_TOKEN;
    logger.verbose('Chatwoot token: ' + chatwootToken);

    const chatwootUrl = configService.get<Auth>('AUTHENTICATION').INSTANCE.CHATWOOT_URL;
    logger.verbose('Chatwoot url: ' + chatwootUrl);

    instance.instanceName = instanceName;

    waMonitor.waInstances[instance.instanceName] = instance;
    waMonitor.delInstanceTime(instance.instanceName);

    const hash = await authService.generateHash({
      instanceName: instance.instanceName,
      token: configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
    });
    logger.verbose('Hash generated: ' + hash);

    if (instanceWebhook) {
      logger.verbose('Creating webhook for instance: ' + instanceName);
      try {
        webhookService.create(instance, { enabled: true, url: instanceWebhook });
        logger.verbose('Webhook created');
      } catch (error) {
        logger.log(error);
      }
    }

    if (chatwootUrl && chatwootToken && chatwootAccountId) {
      logger.verbose('Creating chatwoot for instance: ' + instanceName);
      try {
        chatwootService.create(instance, {
          enabled: true,
          url: chatwootUrl,
          token: chatwootToken,
          account_id: chatwootAccountId,
          sign_msg: false,
        });
        logger.verbose('Chatwoot created');
      } catch (error) {
        logger.log(error);
      }
    }

    try {
      const state = instance.connectionStatus?.state;

      switch (state) {
        case 'close':
          await instance.connectToWhatsapp();
          await delay(2000);
          return instance.qrCode;
        case 'connecting':
          return instance.qrCode;
        default:
          return await this.connectionState({ instanceName });
      }
    } catch (error) {
      logger.log(error);
    }

    const result = {
      instance: {
        instanceName: instance.instanceName,
        status: 'created',
      },
      hash,
      webhook: instanceWebhook,
    };

    logger.info(result);

    return result;
  }

  return null;
}

logger.info('Module - ON');
