import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { ProxyDto } from '../dto/proxy.dto';
import { ProxyService } from '../services/proxy.service';

const logger = new Logger('ProxyController');

export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  public async createProxy(instance: InstanceDto, data: ProxyDto) {
    logger.verbose('requested createProxy from ' + instance.instanceName + ' instance');

    if (!data.enabled) {
      logger.verbose('proxy disabled');
      data.proxy = '';
    }

    return this.proxyService.create(instance, data);
  }

  public async findProxy(instance: InstanceDto) {
    logger.verbose('requested findProxy from ' + instance.instanceName + ' instance');
    return this.proxyService.find(instance);
  }
}
