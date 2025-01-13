import { Logger } from '@config/logger.config';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';

import { ChannelController, ChannelControllerInterface } from '../channel.controller';

export class EvolutionController extends ChannelController implements ChannelControllerInterface {
  private readonly logger = new Logger('EvolutionController');

  // Flag para indicar se a integração está habilitada
  integrationEnabled: boolean;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor);
    this.logger.debug('EvolutionController -> constructor called');

    // Exemplo de log ao definir flags ou propriedades adicionais
    this.integrationEnabled = true;
    this.logger.debug(`EvolutionController -> integrationEnabled set to: ${this.integrationEnabled}`);
  }

  public async receiveWebhook(data: any) {
    this.logger.debug('EvolutionController -> receiveWebhook called');
    this.logger.debug(`EvolutionController -> receiveWebhook -> data: ${JSON.stringify(data)}`);

    // Extraindo número de identificação
    const numberId = data.numberId;
    this.logger.debug(`EvolutionController -> receiveWebhook -> numberId: ${numberId}`);

    // Validando se o numberId foi informado
    if (!numberId) {
      this.logger.error('WebhookService -> receiveWebhookEvolution -> numberId not found');
      return;
    }

    try {
      // Log antes de buscar a instância
      this.logger.debug(`EvolutionController -> Looking for instance with numberId: ${numberId}`);
      const instance = await this.prismaRepository.instance.findFirst({
        where: { number: numberId },
      });

      // Log do resultado da busca
      this.logger.debug(`EvolutionController -> Prisma instance result: ${JSON.stringify(instance)}`);

      // Validando se a instância foi encontrada
      if (!instance) {
        this.logger.error('WebhookService -> receiveWebhook -> instance not found');
        return;
      }

      // Log antes de tentar conectar
      this.logger.debug(`EvolutionController -> Connecting to WhatsApp instance: ${instance.name}`);
      await this.waMonitor.waInstances[instance.name].connectToWhatsapp(data);
      this.logger.debug('EvolutionController -> Successfully connected to WhatsApp instance');

      // Retorno de sucesso
      this.logger.debug('EvolutionController -> receiveWebhook -> returning success');
      return {
        status: 'success',
      };
    } catch (error) {
      this.logger.error(`EvolutionController -> receiveWebhook -> Error: ${error.message}`);
      this.logger.debug(`EvolutionController -> receiveWebhook -> Stack trace: ${error.stack}`);
      throw error;
    }
  }
}
