import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { TypebotDto } from '@api/integrations/chatbot/typebot/dto/typebot.dto';
import { TypebotService } from '@api/integrations/chatbot/typebot/services/typebot.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Events } from '@api/types/wa.types';
import { configService, Typebot } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { Typebot as TypebotModel } from '@prisma/client';
import { getConversationMessage } from '@utils/getConversationMessage';
import axios from 'axios';

import { ChatbotController, ChatbotControllerInterface } from '../../chatbot.controller';

export class TypebotController extends ChatbotController implements ChatbotControllerInterface {
  constructor(
    private readonly typebotService: TypebotService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.typebot;
    this.settingsRepository = this.prismaRepository.typebotSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
  }

  public readonly logger = new Logger('TypebotController');

  integrationEnabled = configService.get<Typebot>('TYPEBOT').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  // Bots
  public async createBot(instance: InstanceDto, data: TypebotDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

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
      if (!data.keywordFinish) data.keywordFinish = defaultSettingCheck?.keywordFinish || '#SAIR';
      if (!data.delayMessage) data.delayMessage = defaultSettingCheck?.delayMessage || 1000;
      if (!data.unknownMessage) data.unknownMessage = defaultSettingCheck?.unknownMessage || 'Desculpe, não entendi';
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
      throw new Error('You already have a typebot with an "All" trigger, you cannot have more bots while it is active');
    }

    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        url: data.url,
        typebot: data.typebot,
        instanceId: instanceId,
      },
    });

    if (checkDuplicate) {
      throw new Error('Typebot already exists');
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
          url: data.url,
          typebot: data.typebot,
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
      throw new Error('Error creating typebot');
    }
  }

  public async findBot(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

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
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

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
      throw new Error('Typebot not found');
    }

    if (bot.instanceId !== instanceId) {
      throw new Error('Typebot not found');
    }

    return bot;
  }

  public async updateBot(instance: InstanceDto, botId: string, data: TypebotDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const typebot = await this.botRepository.findFirst({
      where: {
        id: botId,
      },
    });

    if (!typebot) {
      throw new Error('Typebot not found');
    }

    if (typebot.instanceId !== instanceId) {
      throw new Error('Typebot not found');
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
          'You already have a typebot with an "All" trigger, you cannot have more bots while it is active',
        );
      }
    }

    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        url: data.url,
        typebot: data.typebot,
        id: {
          not: botId,
        },
        instanceId: instanceId,
      },
    });

    if (checkDuplicate) {
      throw new Error('Typebot already exists');
    }

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.botRepository.findFirst({
        where: {
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          id: {
            not: botId,
          },
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
          url: data.url,
          typebot: data.typebot,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          triggerType: data.triggerType,
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          ignoreJids: data.ignoreJids,
        },
      });

      return bot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error updating typebot');
    }
  }

  public async deleteBot(instance: InstanceDto, botId: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const typebot = await this.botRepository.findFirst({
      where: {
        id: botId,
      },
    });

    if (!typebot) {
      throw new Error('Typebot not found');
    }

    if (typebot.instanceId !== instanceId) {
      throw new Error('Typebot not found');
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

      return { typebot: { id: botId } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error deleting typebot');
    }
  }

  // Settings
  public async settings(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

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
            typebotIdFallback: data.typebotIdFallback,
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
          typebotIdFallback: updateSettings.typebotIdFallback,
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
          typebotIdFallback: data.typebotIdFallback,
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
        typebotIdFallback: newSetttings.typebotIdFallback,
        ignoreJids: newSetttings.ignoreJids,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error setting default settings');
    }
  }

  public async fetchSettings(instance: InstanceDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

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
          typebotIdFallback: null,
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
        typebotIdFallback: settings.typebotIdFallback,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching default settings');
    }
  }

  // Sessions
  public async startBot(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

    if (data.remoteJid === 'status@broadcast') return;

    const instanceData = await this.prismaRepository.instance.findFirst({
      where: {
        name: instance.instanceName,
      },
    });

    if (!instanceData) throw new Error('Instance not found');

    const remoteJid = data.remoteJid;
    const url = data.url;
    const typebot = data.typebot;
    const startSession = data.startSession;
    const variables = data.variables;
    let expire = data?.typebot?.expire;
    let keywordFinish = data?.typebot?.keywordFinish;
    let delayMessage = data?.typebot?.delayMessage;
    let unknownMessage = data?.typebot?.unknownMessage;
    let listeningFromMe = data?.typebot?.listeningFromMe;
    let stopBotFromMe = data?.typebot?.stopBotFromMe;
    let keepOpen = data?.typebot?.keepOpen;
    let debounceTime = data?.typebot?.debounceTime;
    let ignoreJids = data?.typebot?.ignoreJids;

    const defaultSettingCheck = await this.settingsRepository.findFirst({
      where: {
        instanceId: instanceData.id,
      },
    });

    if (this.checkIgnoreJids(defaultSettingCheck?.ignoreJids, remoteJid)) throw new Error('Jid not allowed');

    if (
      !expire ||
      !keywordFinish ||
      !delayMessage ||
      !unknownMessage ||
      !listeningFromMe ||
      !stopBotFromMe ||
      !keepOpen ||
      !debounceTime ||
      !ignoreJids
    ) {
      if (expire === undefined || expire === null) expire = defaultSettingCheck.expire;
      if (keywordFinish === undefined || keywordFinish === null) keywordFinish = defaultSettingCheck.keywordFinish;
      if (delayMessage === undefined || delayMessage === null) delayMessage = defaultSettingCheck.delayMessage;
      if (unknownMessage === undefined || unknownMessage === null) unknownMessage = defaultSettingCheck.unknownMessage;
      if (listeningFromMe === undefined || listeningFromMe === null)
        listeningFromMe = defaultSettingCheck.listeningFromMe;
      if (stopBotFromMe === undefined || stopBotFromMe === null) stopBotFromMe = defaultSettingCheck.stopBotFromMe;
      if (keepOpen === undefined || keepOpen === null) keepOpen = defaultSettingCheck.keepOpen;
      if (debounceTime === undefined || debounceTime === null) debounceTime = defaultSettingCheck.debounceTime;
      if (ignoreJids === undefined || ignoreJids === null) ignoreJids = defaultSettingCheck.ignoreJids;

      if (!defaultSettingCheck) {
        await this.settings(instance, {
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          stopBotFromMe: stopBotFromMe,
          keepOpen: keepOpen,
          debounceTime: debounceTime,
          ignoreJids: ignoreJids,
        });
      }
    }

    const prefilledVariables: any = {};

    if (variables?.length) {
      variables.forEach((variable: { name: string | number; value: string }) => {
        prefilledVariables[variable.name] = variable.value;
      });
    }

    if (startSession) {
      let findBot: any = await this.botRepository.findFirst({
        where: {
          url: url,
          typebot: typebot,
          instanceId: instanceData.id,
        },
      });

      if (!findBot) {
        findBot = await this.botRepository.create({
          data: {
            enabled: true,
            url: url,
            typebot: typebot,
            instanceId: instanceData.id,
            expire: expire,
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            stopBotFromMe: stopBotFromMe,
            keepOpen: keepOpen,
          },
        });
      }

      await this.prismaRepository.integrationSession.deleteMany({
        where: {
          remoteJid: remoteJid,
          instanceId: instanceData.id,
          botId: { not: null },
        },
      });

      await this.typebotService.processTypebot(
        instanceData,
        remoteJid,
        null,
        null,
        findBot,
        url,
        expire,
        typebot,
        keywordFinish,
        delayMessage,
        unknownMessage,
        listeningFromMe,
        stopBotFromMe,
        keepOpen,
        'init',
        prefilledVariables,
      );
    } else {
      const id = Math.floor(Math.random() * 10000000000).toString();

      try {
        const version = configService.get<Typebot>('TYPEBOT').API_VERSION;
        let url: string;
        let reqData: {};
        if (version === 'latest') {
          url = `${data.url}/api/v1/typebots/${data.typebot}/startChat`;

          reqData = {
            prefilledVariables: prefilledVariables,
          };
        } else {
          url = `${data.url}/api/v1/sendMessage`;

          reqData = {
            startParams: {
              publicId: data.typebot,
              prefilledVariables: prefilledVariables,
            },
          };
        }
        const request = await axios.post(url, reqData);

        await this.typebotService.sendWAMessage(
          instanceData,
          null,
          {
            expire: expire,
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            stopBotFromMe: stopBotFromMe,
            keepOpen: keepOpen,
          },
          remoteJid,
          request.data.messages,
          request.data.input,
          request.data.clientSideActions,
        );

        this.waMonitor.waInstances[instance.instanceName].sendDataWebhook(Events.TYPEBOT_START, {
          remoteJid: remoteJid,
          url: url,
          typebot: typebot,
          variables: variables,
          sessionId: id,
        });
      } catch (error) {
        this.logger.error(error);
        return;
      }
    }

    return {
      typebot: {
        ...instance,
        typebot: {
          url: url,
          remoteJid: remoteJid,
          typebot: typebot,
          prefilledVariables: prefilledVariables,
        },
      },
    };
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const remoteJid = data.remoteJid;
      const status = data.status;

      const defaultSettingCheck = await this.settingsRepository.findFirst({
        where: {
          instanceId,
        },
      });

      if (status === 'delete') {
        await this.sessionRepository.deleteMany({
          where: {
            remoteJid: remoteJid,
            instanceId: instanceId,
            botId: { not: null },
          },
        });

        return { typebot: { ...instance, typebot: { remoteJid: remoteJid, status: status } } };
      }

      if (status === 'closed') {
        if (defaultSettingCheck?.keepOpen) {
          await this.sessionRepository.updateMany({
            where: {
              instanceId: instanceId,
              remoteJid: remoteJid,
              botId: { not: null },
            },
            data: {
              status: status,
            },
          });
        } else {
          await this.sessionRepository.deleteMany({
            where: {
              remoteJid: remoteJid,
              instanceId: instanceId,
              botId: { not: null },
            },
          });
        }

        return { typebot: { ...instance, typebot: { remoteJid: remoteJid, status: status } } };
      }

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

      const typebotData = {
        remoteJid: remoteJid,
        status: status,
        session,
      };

      this.waMonitor.waInstances[instance.instanceName].sendDataWebhook(Events.TYPEBOT_CHANGE_STATUS, typebotData);

      return { typebot: { ...instance, typebot: typebotData } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error changing status');
    }
  }

  public async fetchSessions(instance: InstanceDto, botId: string, remoteJid?: string) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const typebot = await this.botRepository.findFirst({
        where: {
          id: botId,
        },
      });

      if (typebot && typebot.instanceId !== instanceId) {
        throw new Error('Typebot not found');
      }

      return await this.sessionRepository.findMany({
        where: {
          instanceId: instanceId,
          remoteJid,
          botId: botId ?? { not: null },
          type: 'typebot',
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching sessions');
    }
  }

  public async ignoreJid(instance: InstanceDto, data: IgnoreJidDto) {
    if (!this.integrationEnabled) throw new BadRequestException('Typebot is disabled');

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

  public async emit({
    instance,
    remoteJid,
    msg,
  }: {
    instance: InstanceDto;
    remoteJid: string;
    msg: any;
    pushName?: string;
  }) {
    if (!this.integrationEnabled) return;

    try {
      const instanceData = await this.prismaRepository.instance.findFirst({
        where: {
          name: instance.instanceName,
        },
      });

      if (!instanceData) throw new Error('Instance not found');

      const session = await this.getSession(remoteJid, instance);

      const content = getConversationMessage(msg);

      let findBot = (await this.findBotTrigger(
        this.botRepository,
        this.settingsRepository,
        content,
        instance,
        session,
      )) as TypebotModel;

      if (!findBot) {
        const fallback = await this.settingsRepository.findFirst({
          where: {
            instanceId: instance.instanceId,
          },
        });

        if (fallback?.typebotIdFallback) {
          const findFallback = await this.botRepository.findFirst({
            where: {
              id: fallback.typebotIdFallback,
            },
          });

          findBot = findFallback;
        } else {
          return;
        }
      }

      const settings = await this.prismaRepository.typebotSetting.findFirst({
        where: {
          instanceId: instance.instanceId,
        },
      });

      const url = findBot?.url;
      const typebot = findBot?.typebot;
      let expire = findBot?.expire;
      let keywordFinish = findBot?.keywordFinish;
      let delayMessage = findBot?.delayMessage;
      let unknownMessage = findBot?.unknownMessage;
      let listeningFromMe = findBot?.listeningFromMe;
      let stopBotFromMe = findBot?.stopBotFromMe;
      let keepOpen = findBot?.keepOpen;
      let debounceTime = findBot?.debounceTime;
      let ignoreJids = findBot?.ignoreJids;

      if (expire === undefined || expire === null) expire = settings.expire;
      if (keywordFinish === undefined || keywordFinish === null) keywordFinish = settings.keywordFinish;
      if (delayMessage === undefined || delayMessage === null) delayMessage = settings.delayMessage;
      if (unknownMessage === undefined || unknownMessage === null) unknownMessage = settings.unknownMessage;
      if (listeningFromMe === undefined || listeningFromMe === null) listeningFromMe = settings.listeningFromMe;
      if (stopBotFromMe === undefined || stopBotFromMe === null) stopBotFromMe = settings.stopBotFromMe;
      if (keepOpen === undefined || keepOpen === null) keepOpen = settings.keepOpen;
      if (debounceTime === undefined || debounceTime === null) debounceTime = settings.debounceTime;
      if (ignoreJids === undefined || ignoreJids === null) ignoreJids = settings.ignoreJids;

      if (this.checkIgnoreJids(ignoreJids, remoteJid)) return;

      const key = msg.key as {
        id: string;
        remoteJid: string;
        fromMe: boolean;
        participant: string;
      };

      if (stopBotFromMe && key.fromMe && session) {
        await this.sessionRepository.update({
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
          await this.typebotService.processTypebot(
            instanceData,
            remoteJid,
            msg,
            session,
            findBot,
            url,
            expire,
            typebot,
            keywordFinish,
            delayMessage,
            unknownMessage,
            listeningFromMe,
            stopBotFromMe,
            keepOpen,
            debouncedContent,
          );
        });
      } else {
        await this.typebotService.processTypebot(
          instanceData,
          remoteJid,
          msg,
          session,
          findBot,
          url,
          expire,
          typebot,
          keywordFinish,
          delayMessage,
          unknownMessage,
          listeningFromMe,
          stopBotFromMe,
          keepOpen,
          content,
        );
      }

      if (session && !session.awaitUser) return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
