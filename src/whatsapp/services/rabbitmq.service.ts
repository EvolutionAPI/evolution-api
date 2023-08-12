import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { RabbitmqDto } from '../dto/rabbitmq.dto';
import { RabbitmqRaw } from '../models';
import { WAMonitoringService } from './monitor.service';

export class RabbitmqService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(RabbitmqService.name);

  public create(instance: InstanceDto, data: RabbitmqDto) {
    this.logger.verbose('create rabbitmq: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setRabbitmq(data);

    return { rabbitmq: { ...instance, rabbitmq: data } };
  }

  public async find(instance: InstanceDto): Promise<RabbitmqRaw> {
    try {
      this.logger.verbose('find rabbitmq: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findRabbitmq();

      if (Object.keys(result).length === 0) {
        throw new Error('Rabbitmq not found');
      }

      return result;
    } catch (error) {
      return { enabled: false, events: [] };
    }
  }
}
