import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { Flowise, IntegrationSession } from '@prisma/client';

import { BaseChatbotController } from '../../base-chatbot.controller';
import { FlowiseDto } from '../dto/flowise.dto';
import { FlowiseService } from '../services/flowise.service';

export class FlowiseController extends BaseChatbotController<Flowise, FlowiseDto> {
  constructor(
    private readonly flowiseService: FlowiseService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.flowise;
    this.settingsRepository = this.prismaRepository.flowiseSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
  }

  public readonly logger = new Logger('FlowiseController');
  protected readonly integrationName = 'Flowise';

  integrationEnabled = true; // Set to true by default or use config value if available
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  // Implementation of abstract methods required by BaseChatbotController

  protected getFallbackBotId(settings: any): string | undefined {
    return settings?.flowiseIdFallback;
  }

  protected getFallbackFieldName(): string {
    return 'flowiseIdFallback';
  }

  protected getIntegrationType(): string {
    return 'flowise';
  }

  protected getAdditionalBotData(data: FlowiseDto): Record<string, any> {
    return {
      apiUrl: data.apiUrl,
      apiKey: data.apiKey,
    };
  }

  // Implementation for bot-specific updates
  protected getAdditionalUpdateFields(data: FlowiseDto): Record<string, any> {
    return {
      apiUrl: data.apiUrl,
      apiKey: data.apiKey,
    };
  }

  // Implementation for bot-specific duplicate validation on update
  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: FlowiseDto): Promise<void> {
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        id: {
          not: botId,
        },
        instanceId: instanceId,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Flowise already exists');
    }
  }

  // Process bot-specific logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: Flowise,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
  ) {
    await this.flowiseService.process(instance, remoteJid, bot, session, settings, content, pushName);
  }
}
