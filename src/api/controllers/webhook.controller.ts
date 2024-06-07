import { isURL } from 'class-validator';

import { BadRequestException } from '../../exceptions';
import { Events } from '../../validate/validate.schema';
import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { WAMonitoringService } from '../services/monitor.service';
import { WebhookService } from '../services/webhook.service';

export class WebhookController {
  constructor(private readonly webhookService: WebhookService, private readonly waMonitor: WAMonitoringService) {}

  public async createWebhook(instance: InstanceDto, data: WebhookDto) {
    if (!isURL(data.url, { require_tld: false })) {
      throw new BadRequestException('Invalid "url" property');
    }

    data.enabled = data.enabled ?? true;

    if (!data.enabled) {
      data.url = '';
      data.events = [];
    } else if (data.events.length === 0) {
      data.events = Events;
    }

    return this.webhookService.create(instance, data);
  }

  public async findWebhook(instance: InstanceDto) {
    return this.webhookService.find(instance);
  }

  public async receiveWebhook(instance: InstanceDto, data: any) {
    return await this.waMonitor.waInstances[instance.instanceName].connectToWhatsapp(data);
  }
}
