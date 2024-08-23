import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';

import { ChannelController, ChannelControllerInterface } from '../channel.controller';

export class EvolutionController extends ChannelController implements ChannelControllerInterface {
  private readonly logger = new Logger(EvolutionController.name);

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor);
  }

  integrationEnabled: boolean;

  public async receiveWebhook(data: any) {
    const numberId = data.numberId;

    if (!numberId) {
      this.logger.error('WebhookService -> receiveWebhookEvolution -> numberId not found');
      return;
    }

    const instance = await this.prismaRepository.instance.findFirst({
      where: { number: numberId },
    });

    if (!instance) {
      this.logger.error('WebhookService -> receiveWebhook -> instance not found');
      return;
    }

    await this.waMonitor.waInstances[instance.name].connectToWhatsapp(data);

    return {
      status: 'success',
    };
  }
}
