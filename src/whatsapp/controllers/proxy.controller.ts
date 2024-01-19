import axios from 'axios';

import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
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
    return this.proxyService.find(instance);
  }

  private async testProxy(host: string, port: string, protocol: string, username?: string, password?: string) {
    logger.verbose('requested testProxy');
    try {
      let proxyConfig: any = {
        host: host,
        port: parseInt(port),
        protocol: protocol,
      };

      if (username && password) {
        proxyConfig = {
          ...proxyConfig,
          auth: {
            username: username,
            password: password,
          },
        };
      }
      const serverIp = await axios.get('http://meuip.com/api/meuip.php');

      const response = await axios.get('http://meuip.com/api/meuip.php', {
        proxy: proxyConfig,
      });

      logger.verbose('testProxy response: ' + response.data);
      return response.data !== serverIp.data;
    } catch (error) {
      logger.error('testProxy error: ' + error);
      return false;
    }
  }
}
