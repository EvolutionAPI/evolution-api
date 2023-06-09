import { isURL } from 'class-validator';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { WebhookService } from '../services/webhook.service';

export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  public async createWebhook(instance: InstanceDto, data: WebhookDto) {
    if (!isURL(data.url, { require_tld: false })) {
      throw new BadRequestException('Invalid "url" property');
    }
    return this.webhookService.create(instance, data);
  }

  public async findWebhook(instance: InstanceDto) {
    return this.webhookService.find(instance);
  }
}
