import { InstanceDto } from '../dto/instance.dto';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { WAMonitoringService } from './monitor.service';
import { Logger } from '../../config/logger.config';

export class ChatwootService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(ChatwootService.name);

  public create(instance: InstanceDto, data: ChatwootDto) {
    this.logger.verbose('create chatwoot: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setChatwoot(data);

    return { chatwoot: { ...instance, chatwoot: data } };
  }

  public async find(instance: InstanceDto): Promise<ChatwootDto> {
    try {
      this.logger.verbose('find chatwoot: ' + instance.instanceName);
      return await this.waMonitor.waInstances[instance.instanceName].findChatwoot();
    } catch (error) {
      return { enabled: null, url: '' };
    }
  }
}
