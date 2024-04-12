import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { WebsocketRaw } from '../../../models';
import { WAMonitoringService } from '../../../services/monitor.service';
import { WebsocketDto } from '../dto/websocket.dto';

export class WebsocketService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(WebsocketService.name);

  public create(instance: InstanceDto, data: WebsocketDto) {
    this.logger.verbose('create websocket: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setWebsocket(data);

    return { websocket: { ...instance, websocket: data } };
  }

  public async find(instance: InstanceDto): Promise<WebsocketRaw> {
    try {
      this.logger.verbose('find websocket: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findWebsocket();

      if (Object.keys(result).length === 0) {
        throw new Error('Websocket not found');
      }

      return result;
    } catch (error) {
      return { enabled: false, events: [] };
    }
  }
}
