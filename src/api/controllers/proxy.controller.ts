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
      const testProxy = await this.testProxy(data.proxy);
      if (!testProxy) {
        throw new BadRequestException('Invalid proxy');
      }
      logger.verbose('proxy enabled');
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

  public async testProxy(proxy: ProxyDto['proxy']) {
    logger.verbose('requested testProxy');
    try {
      const serverIp = await axios.get('https://icanhazip.com/');
      const response = await axios.get('https://icanhazip.com/', {
        httpsAgent: makeProxyAgent(proxy),
      });

      logger.verbose('[testProxy] from IP: ' + response?.data + ' To IP: ' + serverIp?.data);
      return response?.data !== serverIp?.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        logger.error('testProxy error: ' + error.response.data);
      } else if (axios.isAxiosError(error)) {
        logger.error('testProxy error: ');
        logger.verbose(error.cause ?? error.message);
      } else {
        logger.error('testProxy error: ');
        logger.verbose(error);
      }
      return false;
    }
  }
}
