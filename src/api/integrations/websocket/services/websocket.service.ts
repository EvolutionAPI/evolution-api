import { InstanceDto } from '@api/dto/instance.dto';
import { WebsocketDto } from '@api/integrations/websocket/dto/websocket.dto';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { Websocket } from '@prisma/client';

export class WebsocketService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger('WebsocketService');

  public create(instance: InstanceDto, data: WebsocketDto) {
    this.waMonitor.waInstances[instance.instanceName].setWebsocket(data);

    return { websocket: { ...instance, websocket: data } };
  }

  public async find(instance: InstanceDto): Promise<Websocket> {
    try {
      const result = await this.waMonitor.waInstances[instance.instanceName].findWebsocket();

      if (Object.keys(result).length === 0) {
        throw new Error('Websocket not found');
      }

      return result;
    } catch (error) {
      return null;
    }
  }
}
