import { InstanceDto } from '@api/dto/instance.dto';
import { N8nDto } from '@api/integrations/chatbot/n8n/dto/n8n.dto';
import { N8nService } from '@api/integrations/chatbot/n8n/services/n8n.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { IntegrationSession, N8n as N8nModel } from '@prisma/client';

import { BaseChatbotController } from '../../base-chatbot.controller';

export class N8nController extends BaseChatbotController<N8nModel, N8nDto> {
  constructor(
    private readonly n8nService: N8nService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.n8n;
    this.settingsRepository = this.prismaRepository.n8nSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
  }

  public readonly logger = new Logger('N8nController');
  protected readonly integrationName = 'N8n';

  integrationEnabled = configService.get('N8N').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  protected getFallbackBotId(settings: any): string | undefined {
    return settings?.fallbackId;
  }

  protected getFallbackFieldName(): string {
    return 'n8nIdFallback';
  }

  protected getIntegrationType(): string {
    return 'n8n';
  }

  protected getAdditionalBotData(data: N8nDto): Record<string, any> {
    return {
      webhookUrl: data.webhookUrl,
      basicAuthUser: data.basicAuthUser,
      basicAuthPass: data.basicAuthPass,
    };
  }

  // Implementation for bot-specific updates
  protected getAdditionalUpdateFields(data: N8nDto): Record<string, any> {
    return {
      webhookUrl: data.webhookUrl,
      basicAuthUser: data.basicAuthUser,
      basicAuthPass: data.basicAuthPass,
    };
  }

  // Implementation for bot-specific duplicate validation on update
  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: N8nDto): Promise<void> {
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        id: {
          not: botId,
        },
        instanceId: instanceId,
        webhookUrl: data.webhookUrl,
        basicAuthUser: data.basicAuthUser,
        basicAuthPass: data.basicAuthPass,
      },
    });

    if (checkDuplicate) {
      throw new Error('N8n already exists');
    }
  }

  // Bots
  public async createBot(instance: InstanceDto, data: N8nDto) {
    if (!this.integrationEnabled) throw new BadRequestException('N8n is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    // Check for N8n-specific duplicate
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        instanceId: instanceId,
        webhookUrl: data.webhookUrl,
        basicAuthUser: data.basicAuthUser,
        basicAuthPass: data.basicAuthPass,
      },
    });

    if (checkDuplicate) {
      throw new Error('N8n already exists');
    }

    // Let the base class handle the rest of the bot creation process
    return super.createBot(instance, data);
  }

  // Process N8n-specific bot logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: N8nModel,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    // Use the base class pattern instead of calling n8nService.process directly
    await this.n8nService.process(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }
}
