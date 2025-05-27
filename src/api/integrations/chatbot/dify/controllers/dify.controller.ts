import { InstanceDto } from '@api/dto/instance.dto';
import { DifyDto } from '@api/integrations/chatbot/dify/dto/dify.dto';
import { DifyService } from '@api/integrations/chatbot/dify/services/dify.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Dify } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { Dify as DifyModel, IntegrationSession } from '@prisma/client';

import { BaseChatbotController } from '../../base-chatbot.controller';

export class DifyController extends BaseChatbotController<DifyModel, DifyDto> {
  constructor(
    private readonly difyService: DifyService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.dify;
    this.settingsRepository = this.prismaRepository.difySetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
  }

  public readonly logger = new Logger('DifyController');
  protected readonly integrationName = 'Dify';

  integrationEnabled = configService.get<Dify>('DIFY').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  protected getFallbackBotId(settings: any): string | undefined {
    return settings?.fallbackId;
  }

  protected getFallbackFieldName(): string {
    return 'difyIdFallback';
  }

  protected getIntegrationType(): string {
    return 'dify';
  }

  protected getAdditionalBotData(data: DifyDto): Record<string, any> {
    return {
      botType: data.botType,
      apiUrl: data.apiUrl,
      apiKey: data.apiKey,
    };
  }

  // Implementation for bot-specific updates
  protected getAdditionalUpdateFields(data: DifyDto): Record<string, any> {
    return {
      botType: data.botType,
      apiUrl: data.apiUrl,
      apiKey: data.apiKey,
    };
  }

  // Implementation for bot-specific duplicate validation on update
  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: DifyDto): Promise<void> {
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        id: {
          not: botId,
        },
        instanceId: instanceId,
        botType: data.botType,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Dify already exists');
    }
  }

  // Override createBot to add Dify-specific validation
  public async createBot(instance: InstanceDto, data: DifyDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Dify is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    // Dify-specific duplicate check
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        instanceId: instanceId,
        botType: data.botType,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Dify already exists');
    }

    // Let the base class handle the rest
    return super.createBot(instance, data);
  }

  // Process Dify-specific bot logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: DifyModel,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    await this.difyService.process(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }
}
