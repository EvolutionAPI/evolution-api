import axios from 'axios';

import { Logger } from '../../config/logger.config';
import { BadRequestException, NotFoundException } from '../../exceptions';
import { makeProxyAgent } from '../../utils/makeProxyAgent';
import { InstanceDto } from '../dto/instance.dto';
import { ProxyDto } from '../dto/proxy.dto';
import { WAMonitoringService } from '../services/monitor.service';
import { ProxyService } from '../services/proxy.service';

const logger = new Logger('ProxyController');

export class ProxyController {
  constructor(private readonly proxyService: ProxyService, private readonly waMonitor: WAMonitoringService) {}

  public async createProxy(instance: InstanceDto, data: ProxyDto) {
    logger.verbose('requested createProxy from ' + instance.instanceName + ' instance');

    if (!this.waMonitor.waInstances[instance.instanceName]) {
      throw new NotFoundException(`The "${instance.instanceName}" instance does not exist`);
    }

    if (!data.enabled) {
      logger.verbose('proxy disabled');
      data.proxy = null;
    }

    if (data.proxy) {
      logger.verbose('proxy enabled');
      const testProxy = await this.testProxy(data.proxy);
      if (!testProxy) {
        throw new BadRequestException('Invalid proxy');
      }
    }

    return this.proxyService.create(instance, data);
  }

  public async findProxy(instance: InstanceDto) {
    logger.verbose('requested findProxy from ' + instance.instanceName + ' instance');

    if (!this.waMonitor.waInstances[instance.instanceName]) {
      throw new NotFoundException(`The "${instance.instanceName}" instance does not exist`);
    }

    return this.proxyService.find(instance);
  }

  private async testProxy(proxy: ProxyDto['proxy']) {
    logger.verbose('requested testProxy');
    try {
      const serverIp = await axios.get('https://icanhazip.com/');
      const response = await axios.get('https://icanhazip.com/', {
        httpsAgent: makeProxyAgent(proxy),
      });

      logger.verbose('testProxy response: ' + response.data);
      return response.data !== serverIp.data;
    } catch (error) {
      let errorMessage = error;
      if (axios.isAxiosError(error) && error.response.data) {
        errorMessage = error.response.data;
      }
      logger.error('testProxy error: ' + errorMessage);
      return false;
    }
  }
}
