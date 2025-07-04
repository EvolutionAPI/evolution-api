import { InstanceDto } from '@api/dto/instance.dto';
import { EvoaiDto } from '@api/integrations/chatbot/evoai/dto/evoai.dto';
import { EvoaiService } from '@api/integrations/chatbot/evoai/services/evoai.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Evoai } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { Evoai as EvoaiModel, IntegrationSession } from '@prisma/client';

import { BaseChatbotController } from '../../base-chatbot.controller';

export class EvoaiController extends BaseChatbotController<EvoaiModel, EvoaiDto> {
  constructor(
    private readonly evoaiService: EvoaiService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.evoai;
    this.settingsRepository = this.prismaRepository.evoaiSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
  }

  public readonly logger = new Logger('EvoaiController');
  protected readonly integrationName = 'Evoai';

  integrationEnabled = configService.get<Evoai>('EVOAI').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  protected getFallbackBotId(settings: any): string | undefined {
    return settings?.evoaiIdFallback;
  }

  protected getFallbackFieldName(): string {
    return 'evoaiIdFallback';
  }

  protected getIntegrationType(): string {
    return 'evoai';
  }

  protected getAdditionalBotData(data: EvoaiDto): Record<string, any> {
    return {
      agentUrl: data.agentUrl,
      apiKey: data.apiKey,
    };
  }

  // Implementation for bot-specific updates
  protected getAdditionalUpdateFields(data: EvoaiDto): Record<string, any> {
    return {
      agentUrl: data.agentUrl,
      apiKey: data.apiKey,
    };
  }

  // Implementation for bot-specific duplicate validation on update
  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: EvoaiDto): Promise<void> {
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        id: {
          not: botId,
        },
        instanceId: instanceId,
        agentUrl: data.agentUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Evoai already exists');
    }
  }

  // Override createBot to add EvoAI-specific validation
  public async createBot(instance: InstanceDto, data: EvoaiDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    // EvoAI-specific duplicate check
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        instanceId: instanceId,
        agentUrl: data.agentUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Evoai already exists');
    }

    // Let the base class handle the rest
    return super.createBot(instance, data);
  }

  // Process Evoai-specific bot logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: EvoaiModel,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    await this.evoaiService.process(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }
}
