import { InstanceDto } from '@api/dto/instance.dto';
import { RabbitmqDto } from '@api/integrations/rabbitmq/dto/rabbitmq.dto';
import { initQueues } from '@api/integrations/rabbitmq/libs/amqp.server';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { Rabbitmq } from '@prisma/client';

export class RabbitmqService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger('RabbitmqService');

  public create(instance: InstanceDto, data: RabbitmqDto) {
    this.waMonitor.waInstances[instance.instanceName].setRabbitmq(data);

    initQueues(instance.instanceName, data.events);
    return { rabbitmq: { ...instance, rabbitmq: data } };
  }

  public async find(instance: InstanceDto): Promise<Rabbitmq> {
    try {
      const result = await this.waMonitor.waInstances[instance.instanceName].findRabbitmq();

      if (Object.keys(result).length === 0) {
        throw new Error('Rabbitmq not found');
      }

      return result;
    } catch (error) {
      return null;
    }
  }
}
