import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { getConversationMessage } from '@utils/getConversationMessage';

import { ChatbotController, ChatbotControllerInterface, EmitData } from '../../chatbot.controller';
import { FlowiseDto } from '../dto/flowise.dto';
import { FlowiseService } from '../services/flowise.service';

export class FlowiseController extends ChatbotController implements ChatbotControllerInterface {
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

  public readonly logger = new Logger(FlowiseController.name);

  integrationEnabled: boolean;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  // Bots
  public async createBot(instance: InstanceDto, data: FlowiseDto) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (
      !data.expire ||
      !data.keywordFinish ||
      !data.delayMessage ||
      !data.unknownMessage ||
      !data.listeningFromMe ||
      !data.stopBotFromMe ||
      !data.keepOpen ||
      !data.debounceTime ||
      !data.ignoreJids
    ) {
      const defaultSettingCheck = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (!data.expire) data.expire = defaultSettingCheck?.expire || 0;
      if (!data.keywordFinish) data.keywordFinish = defaultSettingCheck?.keywordFinish || '';
      if (!data.delayMessage) data.delayMessage = defaultSettingCheck?.delayMessage || 1000;
      if (!data.unknownMessage) data.unknownMessage = defaultSettingCheck?.unknownMessage || '';
      if (!data.listeningFromMe) data.listeningFromMe = defaultSettingCheck?.listeningFromMe || false;
      if (!data.stopBotFromMe) data.stopBotFromMe = defaultSettingCheck?.stopBotFromMe || false;
      if (!data.keepOpen) data.keepOpen = defaultSettingCheck?.keepOpen || false;
      if (!data.debounceTime) data.debounceTime = defaultSettingCheck?.debounceTime || 0;
      if (!data.ignoreJids) data.ignoreJids = defaultSettingCheck?.ignoreJids || [];

      if (!defaultSettingCheck) {
        await this.settings(instance, {
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          ignoreJids: data.ignoreJids,
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
      throw new Error('You already have a Flowise with an "All" trigger, you cannot have more bots while it is active');
    }

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
          enabled: data.enabled,
          description: data.description,
          apiUrl: data.apiUrl,
          apiKey: data.apiKey,
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
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating bot');
    }
  }

  public async findBot(instance: InstanceDto) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const bots = await this.botRepository.findMany({
      where: {
        instanceId: instanceId,
      },
    });

    if (!bots.length) {
      return null;
    }

    return bots;
  }

  public async fetchBot(instance: InstanceDto, botId: string) {
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
      throw new Error('Bot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Bot not found');
    }

    return bot;
  }

  public async updateBot(instance: InstanceDto, botId: string, data: FlowiseDto) {
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
      throw new Error('Bot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Bot not found');
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
        throw new Error('You already have a bot with an "All" trigger, you cannot have more bots while it is active');
      }
    }

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
      throw new Error('Bot already exists');
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
          enabled: data.enabled,
          apiUrl: data.apiUrl,
          apiKey: data.apiKey,
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
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error updating bot');
    }
  }

  public async deleteBot(instance: InstanceDto, botId: string) {
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
      throw new Error('Bot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Bot not found');
    }
    try {
      await this.prismaRepository.integrationSession.deleteMany({
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
      throw new Error('Error deleting bot');
    }
  }

  // Settings
  public async settings(instance: InstanceDto, data: any) {
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
            expire: data.expire,
            keywordFinish: data.keywordFinish,
            delayMessage: data.delayMessage,
            unknownMessage: data.unknownMessage,
            listeningFromMe: data.listeningFromMe,
            stopBotFromMe: data.stopBotFromMe,
            keepOpen: data.keepOpen,
            debounceTime: data.debounceTime,
            flowiseIdFallback: data.flowiseIdFallback,
            ignoreJids: data.ignoreJids,
          },
        });

        return {
          expire: updateSettings.expire,
          keywordFinish: updateSettings.keywordFinish,
          delayMessage: updateSettings.delayMessage,
          unknownMessage: updateSettings.unknownMessage,
          listeningFromMe: updateSettings.listeningFromMe,
          stopBotFromMe: updateSettings.stopBotFromMe,
          keepOpen: updateSettings.keepOpen,
          debounceTime: updateSettings.debounceTime,
          flowiseIdFallback: updateSettings.flowiseIdFallback,
          ignoreJids: updateSettings.ignoreJids,
        };
      }

      const newSetttings = await this.settingsRepository.create({
        data: {
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          flowiseIdFallback: data.flowiseIdFallback,
          ignoreJids: data.ignoreJids,
          instanceId: instanceId,
        },
      });

      return {
        expire: newSetttings.expire,
        keywordFinish: newSetttings.keywordFinish,
        delayMessage: newSetttings.delayMessage,
        unknownMessage: newSetttings.unknownMessage,
        listeningFromMe: newSetttings.listeningFromMe,
        stopBotFromMe: newSetttings.stopBotFromMe,
        keepOpen: newSetttings.keepOpen,
        debounceTime: newSetttings.debounceTime,
        flowiseIdFallback: newSetttings.flowiseIdFallback,
        ignoreJids: newSetttings.ignoreJids,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error setting default settings');
    }
  }

  public async fetchSettings(instance: InstanceDto) {
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
        include: {
          Fallback: true,
        },
      });

      if (!settings) {
        return {
          expire: 0,
          keywordFinish: '',
          delayMessage: 0,
          unknownMessage: '',
          listeningFromMe: false,
          stopBotFromMe: false,
          keepOpen: false,
          ignoreJids: [],
          flowiseIdFallback: '',
          fallback: null,
        };
      }

      return {
        expire: settings.expire,
        keywordFinish: settings.keywordFinish,
        delayMessage: settings.delayMessage,
        unknownMessage: settings.unknownMessage,
        listeningFromMe: settings.listeningFromMe,
        stopBotFromMe: settings.stopBotFromMe,
        keepOpen: settings.keepOpen,
        ignoreJids: settings.ignoreJids,
        flowiseIdFallback: settings.flowiseIdFallback,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching default settings');
    }
  }

  // Sessions
  public async changeStatus(instance: InstanceDto, data: any) {
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

        return { bot: { remoteJid: remoteJid, status: status } };
      }

      if (status === 'closed') {
        if (defaultSettingCheck?.keepOpen) {
          await this.sessionRepository.updateMany({
            where: {
              remoteJid: remoteJid,
              botId: { not: null },
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.sessionRepository.deleteMany({
            where: {
              remoteJid: remoteJid,
              botId: { not: null },
            },
          });
        }

        return { bot: { ...instance, bot: { remoteJid: remoteJid, status: status } } };
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

        const botData = {
          remoteJid: remoteJid,
          status: status,
          session,
        };

        return { bot: { ...instance, bot: botData } };
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error changing status');
    }
  }

  public async fetchSessions(instance: InstanceDto, botId: string, remoteJid?: string) {
    try {
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

      if (bot && bot.instanceId !== instanceId) {
        throw new Error('Dify not found');
      }

      return await this.sessionRepository.findMany({
        where: {
          instanceId: instanceId,
          remoteJid,
          botId: bot ? botId : { not: null },
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching sessions');
    }
  }

  public async ignoreJid(instance: InstanceDto, data: IgnoreJidDto) {
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
  public async emit({ instance, remoteJid, msg }: EmitData) {
    try {
      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instance.instanceId,
        },
      });

      if (this.checkIgnoreJids(settings?.ignoreJids, remoteJid)) return;

      const session = await this.getSession(remoteJid, instance);

      const content = getConversationMessage(msg);

      const findBot = await this.findBotTrigger(
        this.botRepository,
        this.settingsRepository,
        content,
        instance,
        session,
      );

      if (!findBot) return;

      let expire = findBot.expire;
      let keywordFinish = findBot.keywordFinish;
      let delayMessage = findBot.delayMessage;
      let unknownMessage = findBot.unknownMessage;
      let listeningFromMe = findBot.listeningFromMe;
      let stopBotFromMe = findBot.stopBotFromMe;
      let keepOpen = findBot.keepOpen;
      let debounceTime = findBot.debounceTime;

      if (
        !expire ||
        !keywordFinish ||
        !delayMessage ||
        !unknownMessage ||
        !listeningFromMe ||
        !stopBotFromMe ||
        !keepOpen ||
        !debounceTime
      ) {
        if (!expire) expire = settings.expire;

        if (!keywordFinish) keywordFinish = settings.keywordFinish;

        if (!delayMessage) delayMessage = settings.delayMessage;

        if (!unknownMessage) unknownMessage = settings.unknownMessage;

        if (!listeningFromMe) listeningFromMe = settings.listeningFromMe;

        if (!stopBotFromMe) stopBotFromMe = settings.stopBotFromMe;

        if (!keepOpen) keepOpen = settings.keepOpen;

        if (!debounceTime) debounceTime = settings.debounceTime;
      }

      const key = msg.key as {
        id: string;
        remoteJid: string;
        fromMe: boolean;
        participant: string;
      };

      if (stopBotFromMe && key.fromMe && session) {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'paused',
          },
        });
        return;
      }

      if (!listeningFromMe && key.fromMe) {
        return;
      }

      if (debounceTime && debounceTime > 0) {
        this.processDebounce(this.userMessageDebounce, content, remoteJid, debounceTime, async (debouncedContent) => {
          await this.flowiseService.processBot(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            findBot,
            session,
            settings,
            debouncedContent,
            msg?.pushName,
          );
        });
      } else {
        await this.flowiseService.processBot(
          this.waMonitor.waInstances[instance.instanceName],
          remoteJid,
          findBot,
          session,
          settings,
          content,
          msg?.pushName,
        );
      }

      return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
