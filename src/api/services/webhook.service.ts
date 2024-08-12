import { InstanceDto } from '@api/dto/instance.dto';
import { WebhookDto } from '@api/dto/webhook.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { Webhook } from '@prisma/client';
import axios from 'axios';

import { WAMonitoringService } from './monitor.service';

export class WebhookService {
  constructor(private readonly waMonitor: WAMonitoringService, public readonly prismaRepository: PrismaRepository) {}

  private readonly logger = new Logger('WebhookService');

  public create(instance: InstanceDto, data: WebhookDto) {
    this.waMonitor.waInstances[instance.instanceName].setWebhook(data);

    return { webhook: { ...instance, webhook: data } };
  }

  public async find(instance: InstanceDto): Promise<Webhook> {
    try {
      const result = await this.waMonitor.waInstances[instance.instanceName].findWebhook();

      if (Object.keys(result).length === 0) {
        throw new Error('Webhook not found');
      }

      return result;
    } catch (error) {
      return null;
    }
  }

  public async receiveWebhook(data: any) {
    if (data.object === 'whatsapp_business_account') {
      if (data.entry[0]?.changes[0]?.field === 'message_template_status_update') {
        const template = await this.prismaRepository.template.findFirst({
          where: { templateId: `${data.entry[0].changes[0].value.message_template_id}` },
        });

        if (!template) {
          console.log('template not found');
          return;
        }

        const { webhookUrl } = template;

        await axios.post(webhookUrl, data.entry[0].changes[0].value, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        return;
      }

      data.entry?.forEach(async (entry: any) => {
        const numberId = entry.changes[0].value.metadata.phone_number_id;

        if (!numberId) {
          this.logger.error('WebhookService -> receiveWebhook -> numberId not found');
          return;
        }

        const instance = await this.prismaRepository.instance.findFirst({
          where: { number: numberId },
        });

        if (!instance) {
          this.logger.error('WebhookService -> receiveWebhook -> instance not found');
          return;
        }

        await this.waMonitor.waInstances[instance.name].connectToWhatsapp(data);

        return;
      });
    }

    return;
  }
}
