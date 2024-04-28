import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { IntegrationDto } from '../dto/integration.dto';
import { IntegrationRaw } from '../models';
import { WAMonitoringService } from './monitor.service';

export class IntegrationService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(IntegrationService.name);

  public create(instance: InstanceDto, data: IntegrationDto) {
    this.logger.verbose('create integration: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setIntegration(data);

    return { integration: { ...instance, integration: data } };
  }

  public async find(instance: InstanceDto): Promise<IntegrationRaw> {
    try {
      this.logger.verbose('find integration: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findIntegration();

      if (Object.keys(result).length === 0) {
        this.create(instance, { integration: 'WHATSAPP-BAILEYS', number: '', token: '' });
        return { integration: 'WHATSAPP-BAILEYS', number: '', token: '' };
      }

      return result;
    } catch (error) {
      return { integration: '', number: '', token: '' };
    }
  }
}
