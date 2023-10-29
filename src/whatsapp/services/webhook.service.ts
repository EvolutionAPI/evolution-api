import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { WAMonitoringService } from './monitor.service';

export class WebhookService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(WebhookService.name);

  public create(instance: InstanceDto, data: WebhookDto) {
    this.logger.verbose('create webhook: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setWebhook(data);

    return { webhook: { ...instance, webhook: data } };
  }

  public async find(instance: InstanceDto): Promise<WebhookDto> {
    try {
      this.logger.verbose('find webhook: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findWebhook();

      if (Object.keys(result).length === 0) {
        throw new Error('Webhook not found');
      }

      return result;
    } catch (error) {
      return { enabled: false, url: '', events: [], webhook_by_events: false, webhook_base64: false };
    }
  }
}
