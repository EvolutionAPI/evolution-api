import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { Logger } from '../../config/logger.config';
import { BadRequestException, NotFoundException } from '../../exceptions';
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
      const { host, port, protocol, username, password } = data.proxy;
      const testProxy = await this.testProxy(host, port, protocol, username, password);
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

  private async testProxy(host: string, port: string, protocol: string, username?: string, password?: string) {
    logger.verbose('requested testProxy');
    try {
      let proxyUrl = `${protocol}://${host}:${port}`;

      if (username && password) {
        proxyUrl = `${protocol}://${username}:${password}@${host}:${port}`;
      }

      const serverIp = await axios.get('https://icanhazip.com/');
      const response = await axios.get('https://icanhazip.com/', {
        httpsAgent: new HttpsProxyAgent(proxyUrl),
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
