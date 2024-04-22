import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { SqsRaw } from '../../../models';
import { WAMonitoringService } from '../../../services/monitor.service';
import { SqsDto } from '../dto/sqs.dto';
import { initQueues } from '../libs/sqs.server';

export class SqsService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(SqsService.name);

  public create(instance: InstanceDto, data: SqsDto) {
    this.logger.verbose('create sqs: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setSqs(data);

    initQueues(instance.instanceName, data.events);
    return { sqs: { ...instance, sqs: data } };
  }

  public async find(instance: InstanceDto): Promise<SqsRaw> {
    try {
      this.logger.verbose('find sqs: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findSqs();

      if (Object.keys(result).length === 0) {
        throw new Error('Sqs not found');
      }

      return result;
    } catch (error) {
      return { enabled: false, events: [] };
    }
  }
}
