import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { EvoaiDto } from '@api/integrations/chatbot/evoai/dto/evoai.dto';
import { EvoaiService } from '@api/integrations/chatbot/evoai/services/evoai.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Evoai } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { Evoai as EvoaiModel } from '@prisma/client';
import { getConversationMessage } from '@utils/getConversationMessage';

import { ChatbotController, ChatbotControllerInterface, EmitData } from '../../chatbot.controller';

export class EvoaiController extends ChatbotController implements ChatbotControllerInterface {
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

  integrationEnabled = configService.get<Evoai>('EVOAI').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  // Bots
  public async createBot(instance: InstanceDto, data: EvoaiDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
      !data.ignoreJids ||
      !data.splitMessages ||
      !data.timePerChar
    ) {
      const defaultSettingCheck = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (data.expire === undefined || data.expire === null) data.expire = defaultSettingCheck.expire;
      if (data.keywordFinish === undefined || data.keywordFinish === null)
        data.keywordFinish = defaultSettingCheck.keywordFinish;
      if (data.delayMessage === undefined || data.delayMessage === null)
        data.delayMessage = defaultSettingCheck.delayMessage;
      if (data.unknownMessage === undefined || data.unknownMessage === null)
        data.unknownMessage = defaultSettingCheck.unknownMessage;
      if (data.listeningFromMe === undefined || data.listeningFromMe === null)
        data.listeningFromMe = defaultSettingCheck.listeningFromMe;
      if (data.stopBotFromMe === undefined || data.stopBotFromMe === null)
        data.stopBotFromMe = defaultSettingCheck.stopBotFromMe;
      if (data.keepOpen === undefined || data.keepOpen === null) data.keepOpen = defaultSettingCheck.keepOpen;
      if (data.debounceTime === undefined || data.debounceTime === null)
        data.debounceTime = defaultSettingCheck.debounceTime;
      if (data.ignoreJids === undefined || data.ignoreJids === null) data.ignoreJids = defaultSettingCheck.ignoreJids;
      if (data.splitMessages === undefined || data.splitMessages === null)
        data.splitMessages = defaultSettingCheck?.splitMessages ?? false;
      if (data.timePerChar === undefined || data.timePerChar === null)
        data.timePerChar = defaultSettingCheck?.timePerChar ?? 0;

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
      throw new Error('You already have a evoai with an "All" trigger, you cannot have more bots while it is active');
    }

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
          agentUrl: data.agentUrl,
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
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating evoai');
    }
  }

  public async findBot(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
      throw new Error('Evoai not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Evoai not found');
    }

    return bot;
  }

  public async updateBot(instance: InstanceDto, botId: string, data: EvoaiDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
      throw new Error('Evoai not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Evoai not found');
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
        throw new Error('You already have a evoai with an "All" trigger, you cannot have more bots while it is active');
      }
    }

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
          agentUrl: data.agentUrl,
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
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error updating evoai');
    }
  }

  public async deleteBot(instance: InstanceDto, botId: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
      throw new Error('Evoai not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Evoai not found');
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
      throw new Error('Error deleting evoai bot');
    }
  }

  // Settings
  public async settings(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
            evoaiIdFallback: data.evoaiIdFallback,
            ignoreJids: data.ignoreJids,
            splitMessages: data.splitMessages,
            timePerChar: data.timePerChar,
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
          evoaiIdFallback: updateSettings.evoaiIdFallback,
          ignoreJids: updateSettings.ignoreJids,
          splitMessages: updateSettings.splitMessages,
          timePerChar: updateSettings.timePerChar,
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
          evoaiIdFallback: data.evoaiIdFallback,
          ignoreJids: data.ignoreJids,
          instanceId: instanceId,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
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
        evoaiIdFallback: newSetttings.evoaiIdFallback,
        ignoreJids: newSetttings.ignoreJids,
        splitMessages: newSetttings.splitMessages,
        timePerChar: newSetttings.timePerChar,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error setting default settings');
    }
  }

  public async fetchSettings(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
          splitMessages: false,
          timePerChar: 0,
          evoaiIdFallback: '',
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
        splitMessages: settings.splitMessages,
        timePerChar: settings.timePerChar,
        evoaiIdFallback: settings.evoaiIdFallback,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching default settings');
    }
  }

  // Sessions
  public async changeStatus(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
        throw new Error('Evoai not found');
      }

      return await this.sessionRepository.findMany({
        where: {
          instanceId: instanceId,
          remoteJid,
          botId: bot ? botId : { not: null },
          type: 'evoai',
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching sessions');
    }
  }

  public async ignoreJid(instance: InstanceDto, data: IgnoreJidDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Evoai is disabled');

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
    if (!this.integrationEnabled) return;

    try {
      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instance.instanceId,
        },
      });

      if (this.checkIgnoreJids(settings?.ignoreJids, remoteJid)) return;

      const session = await this.getSession(remoteJid, instance);

      const content = getConversationMessage(msg);

      let findBot = (await this.findBotTrigger(this.botRepository, content, instance, session)) as EvoaiModel;

      if (!findBot) {
        const fallback = await this.settingsRepository.findFirst({
          where: {
            instanceId: instance.instanceId,
          },
        });

        if (fallback?.evoaiIdFallback) {
          const findFallback = await this.botRepository.findFirst({
            where: {
              id: fallback.evoaiIdFallback,
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

      if (expire === undefined || expire === null) expire = settings.expire;
      if (keywordFinish === undefined || keywordFinish === null) keywordFinish = settings.keywordFinish;
      if (delayMessage === undefined || delayMessage === null) delayMessage = settings.delayMessage;
      if (unknownMessage === undefined || unknownMessage === null) unknownMessage = settings.unknownMessage;
      if (listeningFromMe === undefined || listeningFromMe === null) listeningFromMe = settings.listeningFromMe;
      if (stopBotFromMe === undefined || stopBotFromMe === null) stopBotFromMe = settings.stopBotFromMe;
      if (keepOpen === undefined || keepOpen === null) keepOpen = settings.keepOpen;
      if (debounceTime === undefined || debounceTime === null) debounceTime = settings.debounceTime;
      if (ignoreJids === undefined || ignoreJids === null) ignoreJids = settings.ignoreJids;
      if (splitMessages === undefined || splitMessages === null) splitMessages = settings?.splitMessages ?? false;
      if (timePerChar === undefined || timePerChar === null) timePerChar = settings?.timePerChar ?? 0;

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

      if (session && !session.awaitUser) {
        return;
      }

      if (debounceTime && debounceTime > 0) {
        this.processDebounce(this.userMessageDebounce, content, remoteJid, debounceTime, async (debouncedContent) => {
          await this.evoaiService.processEvoai(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
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
            msg?.pushName,
            msg,
          );
        });
      } else {
        await this.evoaiService.processEvoai(
          this.waMonitor.waInstances[instance.instanceName],
          remoteJid,
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
          content,
          msg?.pushName,
          msg,
        );
      }

      return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
