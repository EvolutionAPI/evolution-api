import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Flowise } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { Flowise as FlowiseModel, IntegrationSession } from '@prisma/client';

import { BaseChatbotController } from '../../base-chatbot.controller';
import { FlowiseDto } from '../dto/flowise.dto';
import { FlowiseService } from '../services/flowise.service';

export class FlowiseController extends BaseChatbotController<FlowiseModel, FlowiseDto> {
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

  integrationEnabled = configService.get<Flowise>('FLOWISE').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

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

  protected getAdditionalUpdateFields(data: FlowiseDto): Record<string, any> {
    return {
      apiUrl: data.apiUrl,
      apiKey: data.apiKey,
    };
  }

  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: FlowiseDto): Promise<void> {
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        id: { not: botId },
        instanceId: instanceId,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Flowise already exists');
    }
  }

  // Process Flowise-specific bot logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: FlowiseModel,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    await this.flowiseService.processBot(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }

  // Override createBot to add module availability check and Flowise-specific validation
  public async createBot(instance: InstanceDto, data: FlowiseDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Flowise is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    // Flowise-specific duplicate check
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        instanceId: instanceId,
        apiUrl: data.apiUrl,
        apiKey: data.apiKey,
      },
    });

    if (checkDuplicate) {
      throw new Error('Flowise already exists');
    }

    // Let the base class handle the rest
    return super.createBot(instance, data);
  }
}
