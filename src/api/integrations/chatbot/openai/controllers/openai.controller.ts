import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { OpenaiCredsDto, OpenaiDto } from '@api/integrations/chatbot/openai/dto/openai.dto';
import { OpenaiService } from '@api/integrations/chatbot/openai/services/openai.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Openai } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { OpenaiBot } from '@prisma/client';
import { getConversationMessage } from '@utils/getConversationMessage';
import OpenAI from 'openai';

import { ChatbotController, ChatbotControllerInterface, EmitData } from '../../chatbot.controller';

export class OpenaiController extends ChatbotController implements ChatbotControllerInterface {
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

  integrationEnabled = configService.get<Openai>('OPENAI').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};
  private client: OpenAI;
  private credsRepository: any;

  // Credentials
  public async createOpenaiCreds(instance: InstanceDto, data: OpenaiCredsDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (!data.apiKey) throw new Error('API Key is required');
    if (!data.name) throw new Error('Name is required');

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

  // Models
  public async getModels(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (!instanceId) throw new Error('Instance not found');

    const defaultSettings = await this.settingsRepository.findFirst({
      where: {
        instanceId: instanceId,
      },
      include: {
        OpenaiCreds: true,
      },
    });

    if (!defaultSettings) throw new Error('Settings not found');

    const { apiKey } = defaultSettings.OpenaiCreds;

    try {
      this.client = new OpenAI({ apiKey });

      const models: any = await this.client.models.list();

      return models?.body?.data;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching models');
    }
  }

  // Bots
  public async createBot(instance: InstanceDto, data: OpenaiDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (
      !data.openaiCredsId ||
      !data.expire ||
      !data.keywordFinish ||
      !data.delayMessage ||
      !data.unknownMessage ||
      !data.listeningFromMe ||
      !data.stopBotFromMe ||
      !data.keepOpen ||
      !data.debounceTime ||
      !data.ignoreJids ||
      !data.splitMessages ||
      !data.timePerChar
    ) {
      const defaultSettingCheck = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (!data.openaiCredsId) data.openaiCredsId = defaultSettingCheck?.openaiCredsId || null;
      if (!data.expire) data.expire = defaultSettingCheck?.expire || 0;
      if (!data.keywordFinish) data.keywordFinish = defaultSettingCheck?.keywordFinish || '';
      if (!data.delayMessage) data.delayMessage = defaultSettingCheck?.delayMessage || 1000;
      if (!data.unknownMessage) data.unknownMessage = defaultSettingCheck?.unknownMessage || '';
      if (!data.listeningFromMe) data.listeningFromMe = defaultSettingCheck?.listeningFromMe || false;
      if (!data.stopBotFromMe) data.stopBotFromMe = defaultSettingCheck?.stopBotFromMe || false;
      if (!data.keepOpen) data.keepOpen = defaultSettingCheck?.keepOpen || false;
      if (!data.debounceTime) data.debounceTime = defaultSettingCheck?.debounceTime || 0;
      if (!data.ignoreJids) data.ignoreJids = defaultSettingCheck?.ignoreJids || [];
      if (!data.splitMessages) data.splitMessages = defaultSettingCheck?.splitMessages || false;
      if (!data.timePerChar) data.timePerChar = defaultSettingCheck?.timePerChar || 0;

      if (!data.openaiCredsId) {
        throw new Error('Openai Creds Id is required');
      }

      if (!defaultSettingCheck) {
        await this.settings(instance, {
          openaiCredsId: data.openaiCredsId,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          ignoreJids: data.ignoreJids,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        });
      }
    }

    const checkTriggerAll = await this.botRepository.findFirst({
      where: {
        enabled: true,
        triggerType: 'all',
        instanceId: instanceId,
      },
    });

    if (checkTriggerAll && data.triggerType === 'all') {
      throw new Error('You already have a openai with an "All" trigger, you cannot have more bots while it is active');
    }

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

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.botRepository.findFirst({
        where: {
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }
    }

    if (data.triggerType === 'advanced') {
      if (!data.triggerValue) {
        throw new Error('Trigger value is required');
      }

      const checkDuplicate = await this.botRepository.findFirst({
        where: {
          triggerValue: data.triggerValue,
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }
    }

    try {
      const bot = await this.botRepository.create({
        data: {
          enabled: data?.enabled,
          description: data.description,
          openaiCredsId: data.openaiCredsId,
          botType: data.botType,
          assistantId: data.assistantId,
          functionUrl: data.functionUrl,
          model: data.model,
          systemMessages: data.systemMessages,
          assistantMessages: data.assistantMessages,
          userMessages: data.userMessages,
          maxTokens: data.maxTokens,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          instanceId: instanceId,
          triggerType: data.triggerType,
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          ignoreJids: data.ignoreJids,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating openai bot');
    }
  }

  public async findBot(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const bots = await this.botRepository.findMany({
      where: {
        instanceId,
      },
    });

    if (!bots.length) {
      return null;
    }

    return bots;
  }

  public async fetchBot(instance: InstanceDto, botId: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const bot = await this.botRepository.findFirst({
      where: {
        id: botId,
      },
    });

    if (!bot) {
      throw new Error('Openai Bot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Openai Bot not found');
    }

    return bot;
  }

  public async updateBot(instance: InstanceDto, botId: string, data: OpenaiDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const bot = await this.botRepository.findFirst({
      where: {
        id: botId,
      },
    });

    if (!bot) {
      throw new Error('Openai Bot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Openai Bot not found');
    }

    if (data.triggerType === 'all') {
      const checkTriggerAll = await this.botRepository.findFirst({
        where: {
          enabled: true,
          triggerType: 'all',
          id: {
            not: botId,
          },
          instanceId: instanceId,
        },
      });

      if (checkTriggerAll) {
        throw new Error(
          'You already have a openai bot with an "All" trigger, you cannot have more bots while it is active',
        );
      }
    }

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
      };
    } else if (data.botType === 'chatCompletion') {
      if (!data.model) throw new Error('Model is required');
      if (!data.maxTokens) throw new Error('Max tokens is required');

      whereDuplication = {
        ...whereDuplication,
        model: data.model,
        maxTokens: data.maxTokens,
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

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.botRepository.findFirst({
        where: {
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          id: { not: botId },
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }
    }

    if (data.triggerType === 'advanced') {
      if (!data.triggerValue) {
        throw new Error('Trigger value is required');
      }

      const checkDuplicate = await this.botRepository.findFirst({
        where: {
          triggerValue: data.triggerValue,
          id: { not: botId },
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }
    }

    try {
      const bot = await this.botRepository.update({
        where: {
          id: botId,
        },
        data: {
          enabled: data?.enabled,
          description: data.description,
          openaiCredsId: data.openaiCredsId,
          botType: data.botType,
          assistantId: data.assistantId,
          functionUrl: data.functionUrl,
          model: data.model,
          systemMessages: data.systemMessages,
          assistantMessages: data.assistantMessages,
          userMessages: data.userMessages,
          maxTokens: data.maxTokens,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          instanceId: instanceId,
          triggerType: data.triggerType,
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          ignoreJids: data.ignoreJids,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error updating openai bot');
    }
  }

  public async deleteBot(instance: InstanceDto, botId: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const bot = await this.botRepository.findFirst({
      where: {
        id: botId,
      },
    });

    if (!bot) {
      throw new Error('Openai bot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Openai bot not found');
    }
    try {
      await this.sessionRepository.deleteMany({
        where: {
          botId: botId,
        },
      });

      await this.botRepository.delete({
        where: {
          id: botId,
        },
      });

      return { bot: { id: botId } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error deleting openai bot');
    }
  }

  // Settings
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

      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (settings) {
        const updateSettings = await this.settingsRepository.update({
          where: {
            id: settings.id,
          },
          data: {
            openaiCredsId: data.openaiCredsId,
            expire: data.expire,
            keywordFinish: data.keywordFinish,
            delayMessage: data.delayMessage,
            unknownMessage: data.unknownMessage,
            listeningFromMe: data.listeningFromMe,
            stopBotFromMe: data.stopBotFromMe,
            keepOpen: data.keepOpen,
            debounceTime: data.debounceTime,
            speechToText: data.speechToText,
            openaiIdFallback: data.openaiIdFallback,
            ignoreJids: data.ignoreJids,
            splitMessages: data.splitMessages,
            timePerChar: data.timePerChar,
          },
        });

        return {
          openaiCredsId: updateSettings.openaiCredsId,
          expire: updateSettings.expire,
          keywordFinish: updateSettings.keywordFinish,
          delayMessage: updateSettings.delayMessage,
          unknownMessage: updateSettings.unknownMessage,
          listeningFromMe: updateSettings.listeningFromMe,
          stopBotFromMe: updateSettings.stopBotFromMe,
          keepOpen: updateSettings.keepOpen,
          debounceTime: updateSettings.debounceTime,
          speechToText: updateSettings.speechToText,
          openaiIdFallback: updateSettings.openaiIdFallback,
          ignoreJids: updateSettings.ignoreJids,
          splitMessages: updateSettings.splitMessages,
          timePerChar: updateSettings.timePerChar,
        };
      }

      const newSetttings = await this.settingsRepository.create({
        data: {
          openaiCredsId: data.openaiCredsId,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          openaiIdFallback: data.openaiIdFallback,
          ignoreJids: data.ignoreJids,
          speechToText: data.speechToText,
          instanceId: instanceId,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      return {
        openaiCredsId: newSetttings.openaiCredsId,
        expire: newSetttings.expire,
        keywordFinish: newSetttings.keywordFinish,
        delayMessage: newSetttings.delayMessage,
        unknownMessage: newSetttings.unknownMessage,
        listeningFromMe: newSetttings.listeningFromMe,
        stopBotFromMe: newSetttings.stopBotFromMe,
        keepOpen: newSetttings.keepOpen,
        debounceTime: newSetttings.debounceTime,
        openaiIdFallback: newSetttings.openaiIdFallback,
        ignoreJids: newSetttings.ignoreJids,
        speechToText: newSetttings.speechToText,
        splitMessages: newSetttings.splitMessages,
        timePerChar: newSetttings.timePerChar,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error setting default settings');
    }
  }

  public async fetchSettings(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    try {
      const instanceId = (
        await this.prismaRepository.instance.findFirst({
          select: { id: true },
          where: {
            name: instance.instanceName,
          },
        })
      )?.id;

      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
        include: {
          Fallback: true,
        },
      });

      if (!settings) {
        return {
          openaiCredsId: null,
          expire: 0,
          keywordFinish: '',
          delayMessage: 0,
          unknownMessage: '',
          listeningFromMe: false,
          stopBotFromMe: false,
          keepOpen: false,
          ignoreJids: [],
          splitMessages: false,
          timePerChar: 0,
          openaiIdFallback: null,
          speechToText: false,
          fallback: null,
        };
      }

      return {
        openaiCredsId: settings.openaiCredsId,
        expire: settings.expire,
        keywordFinish: settings.keywordFinish,
        delayMessage: settings.delayMessage,
        unknownMessage: settings.unknownMessage,
        listeningFromMe: settings.listeningFromMe,
        stopBotFromMe: settings.stopBotFromMe,
        keepOpen: settings.keepOpen,
        ignoreJids: settings.ignoreJids,
        splitMessages: settings.splitMessages,
        timePerChar: settings.timePerChar,
        openaiIdFallback: settings.openaiIdFallback,
        speechToText: settings.speechToText,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching default settings');
    }
  }

  // Sessions
  public async changeStatus(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const defaultSettingCheck = await this.settingsRepository.findFirst({
        where: {
          instanceId,
        },
      });

      const remoteJid = data.remoteJid;
      const status = data.status;

      if (status === 'delete') {
        await this.sessionRepository.deleteMany({
          where: {
            remoteJid: remoteJid,
            botId: { not: null },
          },
        });

        return { openai: { remoteJid: remoteJid, status: status } };
      }

      if (status === 'closed') {
        if (defaultSettingCheck?.keepOpen) {
          await this.sessionRepository.updateMany({
            where: {
              remoteJid: remoteJid,
              botId: { not: null },
              status: { not: 'closed' },
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.sessionRepository.deleteMany({
            where: {
              remoteJid: remoteJid,
            },
          });
        }

        return { openai: { ...instance, openai: { remoteJid: remoteJid, status: status } } };
      } else {
        const session = await this.sessionRepository.updateMany({
          where: {
            instanceId: instanceId,
            remoteJid: remoteJid,
            botId: { not: null },
          },
          data: {
            status: status,
          },
        });

        const openaiData = {
          remoteJid: remoteJid,
          status: status,
          session,
        };

        return { openai: { ...instance, openai: openaiData } };
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error changing status');
    }
  }

  public async fetchSessions(instance: InstanceDto, botId: string, remoteJid?: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const openaiBot = await this.botRepository.findFirst({
        where: {
          id: botId,
        },
      });

      if (openaiBot && openaiBot.instanceId !== instanceId) {
        throw new Error('Openai Bot not found');
      }

      return await this.sessionRepository.findMany({
        where: {
          instanceId: instanceId,
          remoteJid,
          botId: openaiBot ? botId : { not: null },
          type: 'openai',
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching sessions');
    }
  }

  public async ignoreJid(instance: InstanceDto, data: IgnoreJidDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Openai is disabled');

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (!settings) {
        throw new Error('Settings not found');
      }

      let ignoreJids: any = settings?.ignoreJids || [];

      if (data.action === 'add') {
        if (ignoreJids.includes(data.remoteJid)) return { ignoreJids: ignoreJids };

        ignoreJids.push(data.remoteJid);
      } else {
        ignoreJids = ignoreJids.filter((jid) => jid !== data.remoteJid);
      }

      const updateSettings = await this.settingsRepository.update({
        where: {
          id: settings.id,
        },
        data: {
          ignoreJids: ignoreJids,
        },
      });

      return {
        ignoreJids: updateSettings.ignoreJids,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error setting default settings');
    }
  }

  // Emit
  public async emit({ instance, remoteJid, msg, pushName }: EmitData) {
    if (!this.integrationEnabled) return;

    try {
      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instance.instanceId,
        },
      });

      if (this.checkIgnoreJids(settings?.ignoreJids, remoteJid)) return;

      let session = await this.getSession(remoteJid, instance);

      const content = getConversationMessage(msg);

      let findBot = (await this.findBotTrigger(
        this.botRepository,
        this.settingsRepository,
        content,
        instance,
        session,
      )) as OpenaiBot;

      if (!findBot) {
        const fallback = await this.settingsRepository.findFirst({
          where: {
            instanceId: instance.instanceId,
          },
        });

        if (fallback?.openaiIdFallback) {
          const findFallback = await this.botRepository.findFirst({
            where: {
              id: fallback.openaiIdFallback,
            },
          });

          findBot = findFallback;
        } else {
          return;
        }
      }

      let expire = findBot?.expire;
      let keywordFinish = findBot?.keywordFinish;
      let delayMessage = findBot?.delayMessage;
      let unknownMessage = findBot?.unknownMessage;
      let listeningFromMe = findBot?.listeningFromMe;
      let stopBotFromMe = findBot?.stopBotFromMe;
      let keepOpen = findBot?.keepOpen;
      let debounceTime = findBot?.debounceTime;
      let ignoreJids = findBot?.ignoreJids;
      let splitMessages = findBot?.splitMessages;
      let timePerChar = findBot?.timePerChar;

      if (!expire) expire = settings.expire;
      if (!keywordFinish) keywordFinish = settings.keywordFinish;
      if (!delayMessage) delayMessage = settings.delayMessage;
      if (!unknownMessage) unknownMessage = settings.unknownMessage;
      if (!listeningFromMe) listeningFromMe = settings.listeningFromMe;
      if (!stopBotFromMe) stopBotFromMe = settings.stopBotFromMe;
      if (!keepOpen) keepOpen = settings.keepOpen;
      if (debounceTime === undefined || debounceTime === null) debounceTime = settings.debounceTime;
      if (!ignoreJids) ignoreJids = settings.ignoreJids;
      if (splitMessages === undefined || splitMessages === null) splitMessages = settings?.splitMessages ?? false;
      if (timePerChar === undefined || timePerChar === null) timePerChar = settings?.timePerChar ?? 0;

      const key = msg.key as {
        id: string;
        remoteJid: string;
        fromMe: boolean;
        participant: string;
      };

      if (stopBotFromMe && key.fromMe && session) {
        session = await this.sessionRepository.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'paused',
          },
        });
      }

      if (!listeningFromMe && key.fromMe) {
        return;
      }

      if (session && !session.awaitUser) {
        return;
      }

      if (debounceTime && debounceTime > 0) {
        this.processDebounce(this.userMessageDebounce, content, remoteJid, debounceTime, async (debouncedContent) => {
          if (findBot.botType === 'assistant') {
            await this.openaiService.processOpenaiAssistant(
              this.waMonitor.waInstances[instance.instanceName],
              remoteJid,
              pushName,
              key.fromMe,
              findBot,
              session,
              {
                ...settings,
                expire,
                keywordFinish,
                delayMessage,
                unknownMessage,
                listeningFromMe,
                stopBotFromMe,
                keepOpen,
                debounceTime,
                ignoreJids,
                splitMessages,
                timePerChar,
              },
              debouncedContent,
            );
          }

          if (findBot.botType === 'chatCompletion') {
            await this.openaiService.processOpenaiChatCompletion(
              this.waMonitor.waInstances[instance.instanceName],
              remoteJid,
              pushName,
              findBot,
              session,
              {
                ...settings,
                expire,
                keywordFinish,
                delayMessage,
                unknownMessage,
                listeningFromMe,
                stopBotFromMe,
                keepOpen,
                debounceTime,
                ignoreJids,
                splitMessages,
                timePerChar,
              },
              debouncedContent,
            );
          }
        });
      } else {
        if (findBot.botType === 'assistant') {
          await this.openaiService.processOpenaiAssistant(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            pushName,
            key.fromMe,
            findBot,
            session,
            settings,
            content,
          );
        }

        if (findBot.botType === 'chatCompletion') {
          await this.openaiService.processOpenaiChatCompletion(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            pushName,
            findBot,
            session,
            settings,
            content,
          );
        }
      }

      return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
