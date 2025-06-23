import { InstanceDto } from '@api/dto/instance.dto';
import { OpenaiCredsDto, OpenaiDto } from '@api/integrations/chatbot/openai/dto/openai.dto';
import { OpenaiService } from '@api/integrations/chatbot/openai/services/openai.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Openai } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { IntegrationSession, OpenaiBot } from '@prisma/client';
import OpenAI from 'openai';

import { BaseChatbotController } from '../../base-chatbot.controller';

export class OpenaiController extends BaseChatbotController<OpenaiBot, OpenaiDto> {
  constructor(
    private readonly openaiService: OpenaiService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.openaiBot;
    this.settingsRepository = this.prismaRepository.openaiSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
    this.credsRepository = this.prismaRepository.openaiCreds;
  }

  public readonly logger = new Logger('OpenaiController');
  protected readonly integrationName = 'Openai';

  integrationEnabled = configService.get<Openai>('OPENAI').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};
  private client: OpenAI;
  private credsRepository: any;

  protected getFallbackBotId(settings: any): string | undefined {
    return settings?.openaiIdFallback;
  }

  protected getFallbackFieldName(): string {
    return 'openaiIdFallback';
  }

  protected getIntegrationType(): string {
    return 'openai';
  }

  protected getAdditionalBotData(data: OpenaiDto): Record<string, any> {
    return {
      openaiCredsId: data.openaiCredsId,
      botType: data.botType,
      assistantId: data.assistantId,
      functionUrl: data.functionUrl,
      model: data.model,
      systemMessages: data.systemMessages,
      assistantMessages: data.assistantMessages,
      userMessages: data.userMessages,
      maxTokens: data.maxTokens,
    };
  }

  // Implementation for bot-specific updates
  protected getAdditionalUpdateFields(data: OpenaiDto): Record<string, any> {
    return {
      openaiCredsId: data.openaiCredsId,
      botType: data.botType,
      assistantId: data.assistantId,
      functionUrl: data.functionUrl,
      model: data.model,
      systemMessages: data.systemMessages,
      assistantMessages: data.assistantMessages,
      userMessages: data.userMessages,
      maxTokens: data.maxTokens,
    };
  }

  // Implementation for bot-specific duplicate validation on update
  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: OpenaiDto): Promise<void> {
    let whereDuplication: any = {
      id: {
        not: botId,
      },
      instanceId: instanceId,
    };

    if (data.botType === 'assistant') {
      if (!data.assistantId) throw new Error('Assistant ID is required');

      whereDuplication = {
        ...whereDuplication,
        assistantId: data.assistantId,
        botType: data.botType,
      };
    } else if (data.botType === 'chatCompletion') {
      if (!data.model) throw new Error('Model is required');
      if (!data.maxTokens) throw new Error('Max tokens is required');

      whereDuplication = {
        ...whereDuplication,
        model: data.model,
        maxTokens: data.maxTokens,
        botType: data.botType,
      };
    } else {
      throw new Error('Bot type is required');
    }

    const checkDuplicate = await this.botRepository.findFirst({
      where: whereDuplication,
    });

    if (checkDuplicate) {
      throw new Error('OpenAI Bot already exists');
    }
  }

  // Override createBot to handle OpenAI-specific credential logic
  public async createBot(instance: InstanceDto, data: OpenaiDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    // OpenAI specific validation
    let whereDuplication: any = {
      instanceId: instanceId,
    };

    if (data.botType === 'assistant') {
      if (!data.assistantId) throw new Error('Assistant ID is required');

      whereDuplication = {
        ...whereDuplication,
        assistantId: data.assistantId,
        botType: data.botType,
      };
    } else if (data.botType === 'chatCompletion') {
      if (!data.model) throw new Error('Model is required');
      if (!data.maxTokens) throw new Error('Max tokens is required');

      whereDuplication = {
        ...whereDuplication,
        model: data.model,
        maxTokens: data.maxTokens,
        botType: data.botType,
      };
    } else {
      throw new Error('Bot type is required');
    }

    const checkDuplicate = await this.botRepository.findFirst({
      where: whereDuplication,
    });

    if (checkDuplicate) {
      throw new Error('Openai Bot already exists');
    }

    // Check if settings exist and create them if not
    const existingSettings = await this.settingsRepository.findFirst({
      where: {
        instanceId: instanceId,
      },
    });

    if (!existingSettings) {
      // Create default settings with the OpenAI credentials
      await this.settings(instance, {
        openaiCredsId: data.openaiCredsId,
        expire: data.expire || 300,
        keywordFinish: data.keywordFinish || 'bye',
        delayMessage: data.delayMessage || 1000,
        unknownMessage: data.unknownMessage || 'Sorry, I dont understand',
        listeningFromMe: data.listeningFromMe !== undefined ? data.listeningFromMe : true,
        stopBotFromMe: data.stopBotFromMe !== undefined ? data.stopBotFromMe : true,
        keepOpen: data.keepOpen !== undefined ? data.keepOpen : false,
        debounceTime: data.debounceTime || 1,
        ignoreJids: data.ignoreJids || [],
        speechToText: false,
      });
    } else if (!existingSettings.openaiCredsId && data.openaiCredsId) {
      // Update settings with OpenAI credentials if they're missing
      await this.settingsRepository.update({
        where: {
          id: existingSettings.id,
        },
        data: {
          OpenaiCreds: {
            connect: {
              id: data.openaiCredsId,
            },
          },
        },
      });
    }

    // Let the base class handle the rest of the bot creation process
    return super.createBot(instance, data);
  }

  // Process OpenAI-specific bot logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: OpenaiBot,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    await this.openaiService.process(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }

  // Credentials - OpenAI specific functionality
  public async createOpenaiCreds(instance: InstanceDto, data: OpenaiCredsDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (!data.apiKey) throw new BadRequestException('API Key is required');
    if (!data.name) throw new BadRequestException('Name is required');

    // Check if API key already exists
    const existingApiKey = await this.credsRepository.findFirst({
      where: {
        apiKey: data.apiKey,
      },
    });

    if (existingApiKey) {
      throw new BadRequestException('This API key is already registered. Please use a different API key.');
    }

    // Check if name already exists for this instance
    const existingName = await this.credsRepository.findFirst({
      where: {
        name: data.name,
        instanceId: instanceId,
      },
    });

    if (existingName) {
      throw new BadRequestException('This credential name is already in use. Please choose a different name.');
    }

    try {
      const creds = await this.credsRepository.create({
        data: {
          name: data.name,
          apiKey: data.apiKey,
          instanceId: instanceId,
        },
      });

      return creds;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating openai creds');
    }
  }

  public async findOpenaiCreds(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const creds = await this.credsRepository.findMany({
      where: {
        instanceId: instanceId,
      },
      include: {
        OpenaiAssistant: true,
      },
    });

    return creds;
  }

  public async deleteCreds(instance: InstanceDto, openaiCredsId: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const creds = await this.credsRepository.findFirst({
      where: {
        id: openaiCredsId,
      },
    });

    if (!creds) {
      throw new Error('Openai Creds not found');
    }

    if (creds.instanceId !== instanceId) {
      throw new Error('Openai Creds not found');
    }

    try {
      await this.credsRepository.delete({
        where: {
          id: openaiCredsId,
        },
      });

      return { openaiCreds: { id: openaiCredsId } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error deleting openai creds');
    }
  }

  // Override the settings method to handle the OpenAI credentials
  public async settings(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const existingSettings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      // Convert keywordFinish to string if it's an array
      const keywordFinish = data.keywordFinish;

      // Additional OpenAI-specific fields
      const settingsData = {
        expire: data.expire,
        keywordFinish,
        delayMessage: data.delayMessage,
        unknownMessage: data.unknownMessage,
        listeningFromMe: data.listeningFromMe,
        stopBotFromMe: data.stopBotFromMe,
        keepOpen: data.keepOpen,
        debounceTime: data.debounceTime,
        ignoreJids: data.ignoreJids,
        splitMessages: data.splitMessages,
        timePerChar: data.timePerChar,
        openaiIdFallback: data.fallbackId,
        OpenaiCreds: data.openaiCredsId
          ? {
              connect: {
                id: data.openaiCredsId,
              },
            }
          : undefined,
        speechToText: data.speechToText,
      };

      if (existingSettings) {
        const settings = await this.settingsRepository.update({
          where: {
            id: existingSettings.id,
          },
          data: settingsData,
        });

        // Map the specific fallback field to a generic 'fallbackId' in the response
        return {
          ...settings,
          fallbackId: settings.openaiIdFallback,
        };
      } else {
        const settings = await this.settingsRepository.create({
          data: {
            ...settingsData,
            Instance: {
              connect: {
                id: instanceId,
              },
            },
          },
        });

        // Map the specific fallback field to a generic 'fallbackId' in the response
        return {
          ...settings,
          fallbackId: settings.openaiIdFallback,
        };
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error setting default settings');
    }
  }

  // Models - OpenAI specific functionality
  public async getModels(instance: InstanceDto, openaiCredsId?: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (!instanceId) throw new Error('Instance not found');

    let apiKey: string;

    if (openaiCredsId) {
      // Use specific credential ID if provided
      const creds = await this.credsRepository.findFirst({
        where: {
          id: openaiCredsId,
          instanceId: instanceId, // Ensure the credential belongs to this instance
        },
      });

      if (!creds) throw new Error('OpenAI credentials not found for the provided ID');

      apiKey = creds.apiKey;
    } else {
      // Use default credentials from settings if no ID provided
      const defaultSettings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
        include: {
          OpenaiCreds: true,
        },
      });

      if (!defaultSettings) throw new Error('Settings not found');

      if (!defaultSettings.OpenaiCreds)
        throw new Error(
          'OpenAI credentials not found. Please create credentials and associate them with the settings.',
        );

      apiKey = defaultSettings.OpenaiCreds.apiKey;
    }

    try {
      this.client = new OpenAI({ apiKey });

      const models: any = await this.client.models.list();

      return models?.body?.data;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching models');
    }
  }
}
