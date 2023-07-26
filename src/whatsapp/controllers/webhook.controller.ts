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

    if (data.enabled && !isURL(data.url, { require_tld: false })) {
      throw new BadRequestException('Invalid "url" property');
    }

    if (!data.enabled) {
      logger.verbose('webhook disabled');
      data.url = '';
      data.events = [];
    }

    return this.webhookService.create(instance, data);
  }

  public async findWebhook(instance: InstanceDto) {
    logger.verbose('requested findWebhook from ' + instance.instanceName + ' instance');
    return this.webhookService.find(instance);
  }
}
