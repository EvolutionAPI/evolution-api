import { InstanceDto } from '@api/dto/instance.dto';
import { SqsDto } from '@api/integrations/sqs/dto/sqs.dto';
import { initQueues } from '@api/integrations/sqs/libs/sqs.server';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { Sqs } from '@prisma/client';

export class SqsService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger('SqsService');

  public create(instance: InstanceDto, data: SqsDto) {
    this.waMonitor.waInstances[instance.instanceName].setSqs(data);

    initQueues(instance.instanceName, data.events);
    return { sqs: { ...instance, sqs: data } };
  }

  public async find(instance: InstanceDto): Promise<Sqs> {
    try {
      const result = await this.waMonitor.waInstances[instance.instanceName].findSqs();

      if (Object.keys(result).length === 0) {
        throw new Error('Sqs not found');
      }

      return result;
    } catch (error) {
      return null;
    }
  }
}
