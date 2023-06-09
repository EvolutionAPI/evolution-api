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
import { RepositoryBroker } from './repository/repository.manager';
import {
  AuthModel,
  ChatModel,
  ContactModel,
  MessageModel,
  MessageUpModel,
} from './models';
import { dbserver } from '../db/db.connect';
import { WebhookRepository } from './repository/webhook.repository';
import { WebhookModel } from './models/webhook.model';
import { AuthRepository } from './repository/auth.repository';
import { WAStartupService } from './services/whatsapp.service';
import { delay } from '@evolution/base';
import { Events } from './types/wa.types';

const logger = new Logger('WA MODULE');

const messageRepository = new MessageRepository(MessageModel, configService);
const chatRepository = new ChatRepository(ChatModel, configService);
const contactRepository = new ContactRepository(ContactModel, configService);
const messageUpdateRepository = new MessageUpRepository(MessageUpModel, configService);
const webhookRepository = new WebhookRepository(WebhookModel, configService);
const authRepository = new AuthRepository(AuthModel, configService);

export const repository = new RepositoryBroker(
  messageRepository,
  chatRepository,
  contactRepository,
  messageUpdateRepository,
  webhookRepository,
  authRepository,
  dbserver?.getClient(),
);

export const waMonitor = new WAMonitoringService(eventEmitter, configService, repository);

const authService = new AuthService(configService, waMonitor, repository);

const webhookService = new WebhookService(waMonitor);

export const webhookController = new WebhookController(webhookService);

export const instanceController = new InstanceController(
  waMonitor,
  configService,
  repository,
  eventEmitter,
  authService,
  webhookService,
);
export const viewsController = new ViewsController(waMonitor, configService);
export const sendMessageController = new SendMessageController(waMonitor);
export const chatController = new ChatController(waMonitor);
export const groupController = new GroupController(waMonitor);

export async function initInstance() {
  const instance = new WAStartupService(configService, eventEmitter, repository);

  const mode = configService.get<Auth>('AUTHENTICATION').INSTANCE.MODE;

  instance.sendDataWebhook(
    Events.APPLICATION_STARTUP,
    {
      message: 'Application startup',
      mode,
    },
    false,
  );

  if (mode === 'container') {
    const instanceName = configService.get<Auth>('AUTHENTICATION').INSTANCE.NAME;
    const instanceWebhook =
      configService.get<Auth>('AUTHENTICATION').INSTANCE.WEBHOOK_URL;

    instance.instanceName = instanceName;

    waMonitor.waInstances[instance.instanceName] = instance;
    waMonitor.delInstanceTime(instance.instanceName);

    const hash = await authService.generateHash({
      instanceName: instance.instanceName,
    });

    if (instanceWebhook) {
      try {
        webhookService.create(instance, { enabled: true, url: instanceWebhook });
      } catch (error) {
        this.logger.log(error);
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
      this.logger.log(error);
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
