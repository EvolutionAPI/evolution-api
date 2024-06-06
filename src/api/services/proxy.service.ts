import { Proxy } from '@prisma/client';

import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { ProxyDto } from '../dto/proxy.dto';
import { WAMonitoringService } from './monitor.service';

export class ProxyService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(ProxyService.name);

  public create(instance: InstanceDto, data: ProxyDto) {
    this.logger.verbose('create proxy: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setProxy(data);

    return { proxy: { ...instance, proxy: data } };
  }

  public async find(instance: InstanceDto): Promise<Proxy> {
    try {
      this.logger.verbose('find proxy: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findProxy();

      if (Object.keys(result).length === 0) {
        throw new Error('Proxy not found');
      }

      return result;
    } catch (error) {
      return null;
    }
  }
}
