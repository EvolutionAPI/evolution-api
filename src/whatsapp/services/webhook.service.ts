import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { WAMonitoringService } from './monitor.service';

export class WebhookService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public create(instance: InstanceDto, data: WebhookDto) {
    this.waMonitor.waInstances[instance.instanceName].setWebhook(data);

    return { webhook: { ...instance, webhook: data } };
  }

  public async find(instance: InstanceDto): Promise<WebhookDto> {
    try {
      return await this.waMonitor.waInstances[instance.instanceName].findWebhook();
    } catch (error) {
      return { enabled: null, url: '' };
    }
  }
}
