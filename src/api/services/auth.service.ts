import { v4 } from 'uuid';

import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { MongodbRepository } from '../repository/mongodb/repository.manager';
import { PrismaRepository } from '../repository/prisma/repository.service';
import { WAMonitoringService } from './monitor.service';

export class AuthService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly mongodbRepository: MongodbRepository,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  private async apikey(instance: InstanceDto, token?: string) {
    const apikey = token ? token : v4().toUpperCase();

    this.logger.verbose(token ? 'APIKEY defined: ' + apikey : 'APIKEY created: ' + apikey);

    const auth = await this.mongodbRepository.auth.create(
      { apikey, instanceId: instance.instanceId },
      instance.instanceName,
    );

    this.logger.verbose('APIKEY saved in database');

    if (auth['error']) {
      this.logger.error({
        localError: AuthService.name + '.apikey',
        error: auth['error'],
      });
      throw new BadRequestException('Authentication error', auth['error']?.toString());
    }

    return { apikey };
  }

  public async checkDuplicateToken(token: string) {
    const instances = await this.waMonitor.instanceInfo();

    this.logger.verbose('checking duplicate token');

    const instance = instances.find((instance) => instance.instance.apikey === token);

    if (instance) {
      throw new BadRequestException('Token already exists');
    }

    this.logger.verbose('available token');

    return true;
  }

  public async generateHash(instance: InstanceDto, token?: string) {
    this.logger.verbose('generating hash apiKey to instance: ' + instance.instanceName);

    return (await this.apikey(instance, token)) as { apikey: string };
  }
}
