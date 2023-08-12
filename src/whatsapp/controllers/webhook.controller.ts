import { isURL } from 'class-validator';

import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { WebhookService } from '../services/webhook.service';

const logger = new Logger('WebhookController');

export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  public async createWebhook(instance: InstanceDto, data: WebhookDto) {
    logger.verbose('requested createWebhook from ' + instance.instanceName + ' instance');

    if (!isURL(data.url, { require_tld: false })) {
      throw new BadRequestException('Invalid "url" property');
    }

    data.enabled = data.enabled ?? true;

    if (!data.enabled) {
      logger.verbose('webhook disabled');
      data.url = '';
      data.events = [];
    } else if (data.events.length === 0) {
      logger.verbose('webhook events empty');
      data.events = [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_SET',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONTACTS_SET',
        'CONTACTS_UPSERT',
        'CONTACTS_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_SET',
        'CHATS_UPSERT',
        'CHATS_UPDATE',
        'CHATS_DELETE',
        'GROUPS_UPSERT',
        'GROUP_UPDATE',
        'GROUP_PARTICIPANTS_UPDATE',
        'CONNECTION_UPDATE',
        'CALL',
        'NEW_JWT_TOKEN',
      ];
    }

    return this.webhookService.create(instance, data);
  }

  public async findWebhook(instance: InstanceDto) {
    logger.verbose('requested findWebhook from ' + instance.instanceName + ' instance');
    return this.webhookService.find(instance);
  }
}
