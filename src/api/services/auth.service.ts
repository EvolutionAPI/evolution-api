import { v4 } from 'uuid';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
import { PrismaRepository } from '../repository/repository.service';
import { WAMonitoringService } from './monitor.service';

export class AuthService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  private async apikey(token?: string) {
    const apikey = token ? token : v4().toUpperCase();

    return apikey;
  }

  public async checkDuplicateToken(token: string) {
    const instances = await this.waMonitor.instanceInfo();

    const instance = instances.find((instance) => instance.instance.token === token);

    if (instance) {
      throw new BadRequestException('Token already exists');
    }

    return true;
  }

  public async generateHash(token?: string) {
    const hash = await this.apikey(token);
    return hash;
  }
}
