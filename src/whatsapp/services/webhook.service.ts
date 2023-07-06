import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { WAMonitoringService } from './monitor.service';
import { Logger } from '../../config/logger.config';

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
      return await this.waMonitor.waInstances[instance.instanceName].findWebhook();
    } catch (error) {
      return { enabled: null, url: '' };
    }
  }
}
