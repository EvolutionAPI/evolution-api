import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';

import { ChannelController, ChannelControllerInterface } from '../channel.controller';

export class SerproController extends ChannelController implements ChannelControllerInterface {
  private readonly logger = new Logger('SerproController');

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor);
  }

  integrationEnabled: boolean;

  // OBRIGATÓRIO para a interface!
  public async receiveWebhook(data: any) {
    // Pode redirecionar para o SERPRO específico
    return this.receiveWebhookSerpro(data);
  }

  public async receiveWebhookSerpro(data: any) {
    const numberId = data.metadata?.display_phone_number || data.display_phone_number || '552121996300';

    if (!numberId) {
      this.logger.error('WebhookService -> receiveWebhookSerpro -> numberId not found');
      return {
        status: 'success',
      };
    }

    const instance = await this.prismaRepository.instance.findFirst({
      where: { number: numberId },
    });

    if (!instance) {
      this.logger.error('WebhookService -> receiveWebhookSerpro -> instance not found');
      return {
        status: 'success',
      };
    }

    await this.waMonitor.waInstances[instance.name].connectToWhatsapp(data);

    return {
      status: 'success',
    };
  }
}
