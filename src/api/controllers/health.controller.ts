import { WAMonitoringService } from '@api/services/monitor.service';

import { PrismaRepository } from '../repository/repository.service';

export class HealthController {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  public async checkHealth() {
    const instancesByKey = await this.prismaRepository.instance.findMany();

    if (instancesByKey.length > 0) {
      const names = instancesByKey.map((instance) => instance.name);

      return this.waMonitor.instanceInfo(names);
    } else {
      return [];
    }
  }
}
