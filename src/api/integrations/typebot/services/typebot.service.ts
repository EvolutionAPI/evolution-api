import { Message, Typebot as TypebotModel, TypebotSession } from '@prisma/client';
import axios from 'axios';

import { Auth, ConfigService, HttpServer, S3, Typebot } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { sendTelemetry } from '../../../../utils/sendTelemetry';
import { InstanceDto } from '../../../dto/instance.dto';
import { PrismaRepository } from '../../../repository/repository.service';
import { WAMonitoringService } from '../../../services/monitor.service';
import { Events } from '../../../types/wa.types';
import { TypebotDto, TypebotIgnoreJidDto } from '../dto/typebot.dto';

export class TypebotService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  private readonly logger = new Logger(TypebotService.name);

  public async create(instance: InstanceDto, data: TypebotDto) {
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
      const defaultSettingCheck = await this.prismaRepository.typebotSetting.findFirst({
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
        await this.setDefaultSettings(instance, {
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

    const checkTriggerAll = await this.prismaRepository.typebot.findFirst({
      where: {
        enabled: true,
        triggerType: 'all',
        instanceId: instanceId,
      },
    });

    if (checkTriggerAll && data.triggerType === 'all') {
      throw new Error('You already have a typebot with an "All" trigger, you cannot have more bots while it is active');
    }

    const checkDuplicate = await this.prismaRepository.typebot.findFirst({
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

      const checkDuplicate = await this.prismaRepository.typebot.findFirst({
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

    try {
      const typebot = await this.prismaRepository.typebot.create({
        data: {
          enabled: data.enabled,
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

      return typebot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating typebot');
    }
  }

  public async fetch(instance: InstanceDto, typebotId: string) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const typebot = await this.prismaRepository.typebot.findFirst({
      where: {
        id: typebotId,
      },
      include: {
        sessions: true,
      },
    });

    if (!typebot) {
      throw new Error('Typebot not found');
    }

    if (typebot.instanceId !== instanceId) {
      throw new Error('Typebot not found');
    }

    return typebot;
  }

  public async update(instance: InstanceDto, typebotId: string, data: any) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const typebot = await this.prismaRepository.typebot.findFirst({
      where: {
        id: typebotId,
      },
    });

    if (!typebot) {
      throw new Error('Typebot not found');
    }

    if (typebot.instanceId !== instanceId) {
      throw new Error('Typebot not found');
    }

    if (data.triggerType === 'all') {
      const checkTriggerAll = await this.prismaRepository.typebot.findFirst({
        where: {
          enabled: true,
          triggerType: 'all',
          id: {
            not: typebotId,
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

    const checkDuplicate = await this.prismaRepository.typebot.findFirst({
      where: {
        url: data.url,
        typebot: data.typebot,
        id: {
          not: typebotId,
        },
        instanceId: instanceId,
      },
    });

    if (checkDuplicate) {
      throw new Error('Typebot already exists');
    }

    if (data.triggerType !== 'all') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.prismaRepository.typebot.findFirst({
        where: {
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          id: {
            not: typebotId,
          },
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }

      try {
        const typebot = await this.prismaRepository.typebot.update({
          where: {
            id: typebotId,
          },
          data: {
            enabled: data.enabled,
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

        return typebot;
      } catch (error) {
        this.logger.error(error);
        throw new Error('Error updating typebot');
      }
    }
  }

  public async find(instance: InstanceDto): Promise<any> {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const typebots = await this.prismaRepository.typebot.findMany({
      where: {
        instanceId: instanceId,
      },
      include: {
        sessions: true,
      },
    });

    if (!typebots.length) {
      this.logger.error('Typebot not found');
      return null;
    }

    return typebots;
  }

  public async delete(instance: InstanceDto, typebotId: string) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const typebot = await this.prismaRepository.typebot.findFirst({
      where: {
        id: typebotId,
      },
    });

    if (!typebot) {
      throw new Error('Typebot not found');
    }

    if (typebot.instanceId !== instanceId) {
      throw new Error('Typebot not found');
    }
    try {
      await this.prismaRepository.typebotSession.deleteMany({
        where: {
          typebotId: typebotId,
        },
      });

      await this.prismaRepository.typebot.delete({
        where: {
          id: typebotId,
        },
      });

      return { typebot: { id: typebotId } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error deleting typebot');
    }
  }

  public async setDefaultSettings(instance: InstanceDto, data: any) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.typebotSetting.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (settings) {
        const updateSettings = await this.prismaRepository.typebotSetting.update({
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

      const newSetttings = await this.prismaRepository.typebotSetting.create({
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

  public async fetchDefaultSettings(instance: InstanceDto) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.typebotSetting.findFirst({
        where: {
          instanceId: instanceId,
        },
        include: {
          Fallback: true,
        },
      });

      if (!settings) {
        throw new Error('Default settings not found');
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

  public async ignoreJid(instance: InstanceDto, data: TypebotIgnoreJidDto) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.typebotSetting.findFirst({
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

      const updateSettings = await this.prismaRepository.typebotSetting.update({
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

  public async fetchSessions(instance: InstanceDto, typebotId?: string, remoteJid?: string) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const typebot = await this.prismaRepository.typebot.findFirst({
        where: {
          id: typebotId,
        },
      });

      if (!typebot) {
        throw new Error('Typebot not found');
      }

      if (typebot.instanceId !== instanceId) {
        throw new Error('Typebot not found');
      }

      if (typebotId) {
        return await this.prismaRepository.typebotSession.findMany({
          where: {
            typebotId: typebotId,
          },
        });
      }

      if (remoteJid) {
        return await this.prismaRepository.typebotSession.findMany({
          where: {
            remoteJid: remoteJid,
            instanceId: instanceId,
          },
        });
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching sessions');
    }
  }

  public async changeStatus(instance: InstanceDto, data: any) {
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

      if (status === 'closed') {
        await this.prismaRepository.typebotSession.deleteMany({
          where: {
            remoteJid: remoteJid,
            instanceId: instanceId,
          },
        });

        return { typebot: { ...instance, typebot: { remoteJid: remoteJid, status: status } } };
      } else {
        const session = await this.prismaRepository.typebotSession.updateMany({
          where: {
            instanceId: instanceId,
            remoteJid: remoteJid,
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
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error changing status');
    }
  }

  public async startTypebot(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

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

    const defaultSettingCheck = await this.prismaRepository.typebotSetting.findFirst({
      where: {
        instanceId,
      },
    });

    if (defaultSettingCheck?.ignoreJids) {
      const ignoreJids: any = defaultSettingCheck.ignoreJids;

      let ignoreGroups = false;
      let ignoreContacts = false;

      if (ignoreJids.includes('@g.us')) {
        ignoreGroups = true;
      }

      if (ignoreJids.includes('@s.whatsapp.net')) {
        ignoreContacts = true;
      }

      if (ignoreGroups && remoteJid.includes('@g.us')) {
        this.logger.warn('Ignoring message from group: ' + remoteJid);
        throw new Error('Group not allowed');
      }

      if (ignoreContacts && remoteJid.includes('@s.whatsapp.net')) {
        this.logger.warn('Ignoring message from contact: ' + remoteJid);
        throw new Error('Contact not allowed');
      }

      if (ignoreJids.includes(remoteJid)) {
        this.logger.warn('Ignoring message from jid: ' + remoteJid);
        throw new Error('Jid not allowed');
      }
    }

    if (
      !expire ||
      !keywordFinish ||
      !delayMessage ||
      !unknownMessage ||
      !listeningFromMe ||
      !stopBotFromMe ||
      !keepOpen
    ) {
      if (!expire) expire = defaultSettingCheck?.expire || 0;
      if (!keywordFinish) keywordFinish = defaultSettingCheck?.keywordFinish || '#SAIR';
      if (!delayMessage) delayMessage = defaultSettingCheck?.delayMessage || 1000;
      if (!unknownMessage) unknownMessage = defaultSettingCheck?.unknownMessage || 'Desculpe, não entendi';
      if (!listeningFromMe) listeningFromMe = defaultSettingCheck?.listeningFromMe || false;
      if (!stopBotFromMe) stopBotFromMe = defaultSettingCheck?.stopBotFromMe || false;
      if (!keepOpen) keepOpen = defaultSettingCheck?.keepOpen || false;

      if (!defaultSettingCheck) {
        await this.setDefaultSettings(instance, {
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          stopBotFromMe: stopBotFromMe,
          keepOpen: keepOpen,
        });
      }
    }

    const prefilledVariables = {
      remoteJid: remoteJid,
      instanceName: instance.instanceName,
      serverUrl: this.configService.get<HttpServer>('SERVER').URL,
      apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
    };

    if (variables?.length) {
      variables.forEach((variable: { name: string | number; value: string }) => {
        prefilledVariables[variable.name] = variable.value;
      });
    }

    if (startSession) {
      console.log('startSession', startSession);
      let findTypebot: any = await this.prismaRepository.typebot.findFirst({
        where: {
          url: url,
          typebot: typebot,
          instanceId,
        },
      });

      console.log('findTypebot', findTypebot);

      if (!findTypebot) {
        findTypebot = await this.prismaRepository.typebot.create({
          data: {
            enabled: true,
            url: url,
            typebot: typebot,
            expire: expire,
            triggerType: 'none',
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            stopBotFromMe: stopBotFromMe,
            keepOpen: keepOpen,
            instanceId,
          },
        });
      }

      console.log('findTypebot2', findTypebot);

      await this.prismaRepository.typebotSession.deleteMany({
        where: {
          remoteJid: remoteJid,
          instanceId,
        },
      });

      const response = await this.createNewSession(
        {
          instanceName: instance.instanceName,
          instanceId: instanceId,
        },
        {
          enabled: true,
          url: url,
          typebot: typebot,
          remoteJid: remoteJid,
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          stopBotFromMe: stopBotFromMe,
          keepOpen: keepOpen,
          prefilledVariables: prefilledVariables,
          typebotId: findTypebot.id,
        },
      );

      if (response.sessionId) {
        await this.sendWAMessage(
          instance,
          response.session,
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
          response.messages,
          response.input,
          response.clientSideActions,
        );

        this.waMonitor.waInstances[instance.instanceName].sendDataWebhook(Events.TYPEBOT_START, {
          remoteJid: remoteJid,
          url: url,
          typebot: typebot,
          prefilledVariables: prefilledVariables,
          sessionId: `${response.sessionId}`,
        });
      } else {
        throw new Error('Session ID not found in response');
      }
    } else {
      const id = Math.floor(Math.random() * 10000000000).toString();

      try {
        const version = this.configService.get<Typebot>('TYPEBOT').API_VERSION;
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

        await this.sendWAMessage(
          instance,
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

  private getTypeMessage(msg: any) {
    let mediaId: string;

    if (this.configService.get<S3>('S3').ENABLE) mediaId = msg.message.mediaUrl;
    else mediaId = msg.key.id;

    const types = {
      conversation: msg?.message?.conversation,
      extendedTextMessage: msg?.message?.extendedTextMessage?.text,
      contactMessage: msg?.message?.contactMessage?.displayName,
      locationMessage: msg?.message?.locationMessage?.degreesLatitude,
      viewOnceMessageV2:
        msg?.message?.viewOnceMessageV2?.message?.imageMessage?.url ||
        msg?.message?.viewOnceMessageV2?.message?.videoMessage?.url ||
        msg?.message?.viewOnceMessageV2?.message?.audioMessage?.url,
      listResponseMessage: msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      responseRowId: msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      // Medias
      audioMessage: msg?.message?.audioMessage ? `audioMessage|${mediaId}` : undefined,
      imageMessage: msg?.message?.imageMessage ? `imageMessage|${mediaId}` : undefined,
      videoMessage: msg?.message?.videoMessage ? `videoMessage|${mediaId}` : undefined,
      documentMessage: msg?.message?.documentMessage ? `documentMessage|${mediaId}` : undefined,
      documentWithCaptionMessage: msg?.message?.auddocumentWithCaptionMessageioMessage
        ? `documentWithCaptionMessage|${mediaId}`
        : undefined,
    };

    const messageType = Object.keys(types).find((key) => types[key] !== undefined) || 'unknown';

    return { ...types, messageType };
  }

  private getMessageContent(types: any) {
    const typeKey = Object.keys(types).find((key) => types[key] !== undefined);

    const result = typeKey ? types[typeKey] : undefined;

    return result;
  }

  private getConversationMessage(msg: any) {
    const types = this.getTypeMessage(msg);

    const messageContent = this.getMessageContent(types);

    return messageContent;
  }

  public async createNewSession(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;
    const id = Math.floor(Math.random() * 10000000000).toString();

    try {
      const version = this.configService.get<Typebot>('TYPEBOT').API_VERSION;
      let url: string;
      let reqData: {};
      if (version === 'latest') {
        url = `${data.url}/api/v1/typebots/${data.typebot}/startChat`;

        reqData = {
          prefilledVariables: {
            ...data.prefilledVariables,
            remoteJid: data.remoteJid,
            pushName: data.pushName || data.prefilledVariables?.pushName || '',
            instanceName: instance.instanceName,
            serverUrl: this.configService.get<HttpServer>('SERVER').URL,
            apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
          },
        };
      } else {
        url = `${data.url}/api/v1/sendMessage`;

        reqData = {
          startParams: {
            publicId: data.typebot,
            prefilledVariables: {
              ...data.prefilledVariables,
              remoteJid: data.remoteJid,
              pushName: data.pushName || data.prefilledVariables?.pushName || '',
              instanceName: instance.instanceName,
              serverUrl: this.configService.get<HttpServer>('SERVER').URL,
              apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
            },
          },
        };
      }
      const request = await axios.post(url, reqData);

      let session = null;
      if (request?.data?.sessionId) {
        session = await this.prismaRepository.typebotSession.create({
          data: {
            remoteJid: data.remoteJid,
            pushName: data.pushName || '',
            sessionId: `${id}-${request.data.sessionId}`,
            status: 'opened',
            prefilledVariables: {
              ...data.prefilledVariables,
              remoteJid: data.remoteJid,
              pushName: data.pushName || '',
              instanceName: instance.instanceName,
              serverUrl: this.configService.get<HttpServer>('SERVER').URL,
              apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
            },
            awaitUser: false,
            typebotId: data.typebotId,
            instanceId: instance.instanceId,
          },
        });
      }
      return { ...request.data, session };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  public async sendWAMessage(
    instance: InstanceDto,
    session: TypebotSession,
    settings: {
      expire: number;
      keywordFinish: string;
      delayMessage: number;
      unknownMessage: string;
      listeningFromMe: boolean;
      stopBotFromMe: boolean;
      keepOpen: boolean;
    },
    remoteJid: string,
    messages: any,
    input: any,
    clientSideActions: any,
  ) {
    processMessages(
      this.waMonitor.waInstances[instance.instanceName],
      session,
      settings,
      messages,
      input,
      clientSideActions,
      applyFormatting,
      this.prismaRepository,
    ).catch((err) => {
      console.error('Erro ao processar mensagens:', err);
    });

    function findItemAndGetSecondsToWait(array, targetId) {
      if (!array) return null;

      for (const item of array) {
        if (item.lastBubbleBlockId === targetId) {
          return item.wait?.secondsToWaitFor;
        }
      }
      return null;
    }

    function applyFormatting(element) {
      let text = '';

      if (element.text) {
        text += element.text;
      }

      if (element.children && element.type !== 'a') {
        for (const child of element.children) {
          text += applyFormatting(child);
        }
      }

      if (element.type === 'p' && element.type !== 'inline-variable') {
        text = text.trim() + '\n';
      }

      if (element.type === 'inline-variable') {
        text = text.trim();
      }

      if (element.type === 'ol') {
        text =
          '\n' +
          text
            .split('\n')
            .map((line, index) => (line ? `${index + 1}. ${line}` : ''))
            .join('\n');
      }

      if (element.type === 'li') {
        text = text
          .split('\n')
          .map((line) => (line ? `  ${line}` : ''))
          .join('\n');
      }

      let formats = '';

      if (element.bold) {
        formats += '*';
      }

      if (element.italic) {
        formats += '_';
      }

      if (element.underline) {
        formats += '~';
      }

      let formattedText = `${formats}${text}${formats.split('').reverse().join('')}`;

      if (element.url) {
        formattedText = element.children[0]?.text ? `[${formattedText}]\n(${element.url})` : `${element.url}`;
      }

      return formattedText;
    }

    async function processMessages(
      instance: any,
      session: TypebotSession,
      settings: {
        expire: number;
        keywordFinish: string;
        delayMessage: number;
        unknownMessage: string;
        listeningFromMe: boolean;
        stopBotFromMe: boolean;
        keepOpen: boolean;
      },
      messages: any,
      input: any,
      clientSideActions: any,
      applyFormatting: any,
      prismaRepository: PrismaRepository,
    ) {
      for (const message of messages) {
        if (message.type === 'text') {
          let formattedText = '';

          for (const richText of message.content.richText) {
            for (const element of richText.children) {
              formattedText += applyFormatting(element);
            }
            formattedText += '\n';
          }

          formattedText = formattedText.replace(/\*\*/g, '').replace(/__/, '').replace(/~~/, '').replace(/\n$/, '');

          formattedText = formattedText.replace(/\n$/, '');

          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: formattedText,
            },
            false,
          );

          sendTelemetry('/message/sendText');
        }

        if (message.type === 'image') {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'image',
              media: message.content.url,
            },
            false,
          );

          sendTelemetry('/message/sendMedia');
        }

        if (message.type === 'video') {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: 'video',
              media: message.content.url,
            },
            false,
          );

          sendTelemetry('/message/sendMedia');
        }

        if (message.type === 'audio') {
          await instance.audioWhatsapp(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              encoding: true,
              audio: message.content.url,
            },
            false,
          );

          sendTelemetry('/message/sendWhatsAppAudio');
        }

        const wait = findItemAndGetSecondsToWait(clientSideActions, message.id);

        if (wait) {
          await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        }
      }

      if (input) {
        if (input.type === 'choice input') {
          let formattedText = '';

          const items = input.items;

          for (const item of items) {
            formattedText += `▶️ ${item.content}\n`;
          }

          formattedText = formattedText.replace(/\n$/, '');

          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: formattedText,
            },
            false,
          );

          sendTelemetry('/message/sendText');
        }

        await prismaRepository.typebotSession.update({
          where: {
            id: session.id,
          },
          data: {
            awaitUser: true,
          },
        });
      } else {
        if (!settings?.keepOpen) {
          await prismaRepository.typebotSession.deleteMany({
            where: {
              id: session.id,
            },
          });
        } else {
          await prismaRepository.typebotSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        }
      }
    }
  }

  public async findTypebotByTrigger(content: string, instanceId: string) {
    // Check for triggerType 'all'
    const findTriggerAll = await this.prismaRepository.typebot.findFirst({
      where: {
        enabled: true,
        triggerType: 'all',
        instanceId: instanceId,
      },
    });

    if (findTriggerAll) return findTriggerAll;

    // Check for exact match
    const findTriggerEquals = await this.prismaRepository.typebot.findFirst({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'equals',
        triggerValue: content,
        instanceId: instanceId,
      },
    });

    if (findTriggerEquals) return findTriggerEquals;

    // Check for regex match
    const findRegex = await this.prismaRepository.typebot.findMany({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'regex',
        instanceId: instanceId,
      },
    });

    let findTriggerRegex = null;

    for (const regex of findRegex) {
      const regexValue = new RegExp(regex.triggerValue);

      if (regexValue.test(content)) {
        findTriggerRegex = regex;
        break;
      }
    }

    if (findTriggerRegex) return findTriggerRegex;

    // Check for startsWith match
    const findTriggerStartsWith = await this.prismaRepository.typebot.findFirst({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'startsWith',
        triggerValue: {
          startsWith: content,
        },
        instanceId: instanceId,
      },
    });

    if (findTriggerStartsWith) return findTriggerStartsWith;

    // Check for endsWith match
    const findTriggerEndsWith = await this.prismaRepository.typebot.findFirst({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'endsWith',
        triggerValue: {
          endsWith: content,
        },
        instanceId: instanceId,
      },
    });

    if (findTriggerEndsWith) return findTriggerEndsWith;

    // Check for contains match
    const findTriggerContains = await this.prismaRepository.typebot.findFirst({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'contains',
        triggerValue: {
          contains: content,
        },
        instanceId: instanceId,
      },
    });

    if (findTriggerContains) return findTriggerContains;

    const fallback = await this.prismaRepository.typebotSetting.findFirst({
      where: {
        instanceId: instanceId,
      },
    });

    if (fallback?.typebotIdFallback) {
      const findFallback = await this.prismaRepository.typebot.findFirst({
        where: {
          id: fallback.typebotIdFallback,
        },
      });

      if (findFallback) return findFallback;
    }

    return null;
  }

  private processDebounce(content: string, remoteJid: string, debounceTime: number, callback: any) {
    if (this.userMessageDebounce[remoteJid]) {
      this.userMessageDebounce[remoteJid].message += ` ${content}`;
      this.logger.log('message debounced: ' + this.userMessageDebounce[remoteJid].message);
      clearTimeout(this.userMessageDebounce[remoteJid].timeoutId);
    } else {
      this.userMessageDebounce[remoteJid] = {
        message: content,
        timeoutId: null,
      };
    }

    this.userMessageDebounce[remoteJid].timeoutId = setTimeout(() => {
      const myQuestion = this.userMessageDebounce[remoteJid].message;
      this.logger.log('Debounce complete. Processing message: ' + myQuestion);

      delete this.userMessageDebounce[remoteJid];
      callback(myQuestion);
    }, debounceTime * 1000);
  }

  public async sendTypebot(instance: InstanceDto, remoteJid: string, msg: Message) {
    try {
      const settings = await this.prismaRepository.typebotSetting.findFirst({
        where: {
          instanceId: instance.instanceId,
        },
      });

      if (settings?.ignoreJids) {
        const ignoreJids: any = settings.ignoreJids;

        let ignoreGroups = false;
        let ignoreContacts = false;

        if (ignoreJids.includes('@g.us')) {
          ignoreGroups = true;
        }

        if (ignoreJids.includes('@s.whatsapp.net')) {
          ignoreContacts = true;
        }

        if (ignoreGroups && remoteJid.endsWith('@g.us')) {
          this.logger.warn('Ignoring message from group: ' + remoteJid);
          return;
        }

        if (ignoreContacts && remoteJid.endsWith('@s.whatsapp.net')) {
          this.logger.warn('Ignoring message from contact: ' + remoteJid);
          return;
        }

        if (ignoreJids.includes(remoteJid)) {
          this.logger.warn('Ignoring message from jid: ' + remoteJid);
          return;
        }
      }

      const session = await this.prismaRepository.typebotSession.findFirst({
        where: {
          remoteJid: remoteJid,
        },
      });

      const content = this.getConversationMessage(msg);

      let findTypebot = null;

      if (!session) {
        findTypebot = await this.findTypebotByTrigger(content, instance.instanceId);

        if (!findTypebot) {
          return;
        }
      } else {
        findTypebot = await this.prismaRepository.typebot.findFirst({
          where: {
            id: session.typebotId,
          },
        });
      }

      const url = findTypebot?.url;
      const typebot = findTypebot?.typebot;
      let expire = findTypebot?.expire;
      let keywordFinish = findTypebot?.keywordFinish;
      let delayMessage = findTypebot?.delayMessage;
      let unknownMessage = findTypebot?.unknownMessage;
      let listeningFromMe = findTypebot?.listeningFromMe;
      let stopBotFromMe = findTypebot?.stopBotFromMe;
      let keepOpen = findTypebot?.keepOpen;
      let debounceTime = findTypebot?.debounceTime;

      if (
        !expire ||
        !keywordFinish ||
        !delayMessage ||
        !unknownMessage ||
        !listeningFromMe ||
        !stopBotFromMe ||
        !keepOpen
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

      if (!listeningFromMe && key.fromMe) {
        return;
      }

      if (stopBotFromMe && listeningFromMe && key.fromMe && session) {
        await this.prismaRepository.typebotSession.deleteMany({
          where: {
            typebotId: findTypebot.id,
            remoteJid: remoteJid,
          },
        });
        return;
      }

      if (debounceTime && debounceTime > 0) {
        this.processDebounce(content, remoteJid, debounceTime, async (debouncedContent) => {
          await this.processTypebot(
            instance,
            remoteJid,
            msg,
            session,
            findTypebot,
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
        await this.processTypebot(
          instance,
          remoteJid,
          msg,
          session,
          findTypebot,
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

      // await this.processTypebot(
      //   instance,
      //   remoteJid,
      //   msg,
      //   session,
      //   findTypebot,
      //   url,
      //   expire,
      //   typebot,
      //   keywordFinish,
      //   delayMessage,
      //   unknownMessage,
      //   listeningFromMe,
      //   stopBotFromMe,
      //   keepOpen,
      //   content,
      // );

      if (session && !session.awaitUser) return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private async processTypebot(
    instance: InstanceDto,
    remoteJid: string,
    msg: Message,
    session: TypebotSession,
    findTypebot: TypebotModel,
    url: string,
    expire: number,
    typebot: string,
    keywordFinish: string,
    delayMessage: number,
    unknownMessage: string,
    listeningFromMe: boolean,
    stopBotFromMe: boolean,
    keepOpen: boolean,
    content: string,
  ) {
    if (session && expire && expire > 0) {
      const now = Date.now();

      const sessionUpdatedAt = new Date(session.updatedAt).getTime();

      const diff = now - sessionUpdatedAt;

      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > expire) {
        await this.prismaRepository.typebotSession.deleteMany({
          where: {
            typebotId: findTypebot.id,
            remoteJid: remoteJid,
          },
        });

        const data = await this.createNewSession(instance, {
          enabled: findTypebot.enabled,
          url: url,
          typebot: typebot,
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          remoteJid: remoteJid,
          pushName: msg.pushName,
          typebotId: findTypebot.id,
        });

        if (data.session) {
          session = data.session;
        }

        await this.sendWAMessage(
          instance,
          session,
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
          data.messages,
          data.input,
          data.clientSideActions,
        );

        if (data.messages.length === 0) {
          const content = this.getConversationMessage(msg.message);

          if (!content) {
            if (unknownMessage) {
              this.waMonitor.waInstances[instance.instanceName].textMessage(
                {
                  number: remoteJid.split('@')[0],
                  delay: delayMessage || 1000,
                  text: unknownMessage,
                },
                false,
              );

              sendTelemetry('/message/sendText');
            }
            return;
          }

          if (keywordFinish && content.toLowerCase() === keywordFinish.toLowerCase()) {
            await this.prismaRepository.typebotSession.deleteMany({
              where: {
                typebotId: findTypebot.id,
                remoteJid: remoteJid,
              },
            });
            return;
          }

          try {
            const version = this.configService.get<Typebot>('TYPEBOT').API_VERSION;
            let urlTypebot: string;
            let reqData: {};
            if (version === 'latest') {
              urlTypebot = `${url}/api/v1/sessions/${data.sessionId}/continueChat`;
              reqData = {
                message: content,
              };
            } else {
              urlTypebot = `${url}/api/v1/sendMessage`;
              reqData = {
                message: content,
                sessionId: data.sessionId,
              };
            }

            const request = await axios.post(urlTypebot, reqData);

            await this.sendWAMessage(
              instance,
              session,
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
          } catch (error) {
            this.logger.error(error);
            return;
          }
        }

        return;
      }
    }

    if (session && session.status !== 'opened') {
      return;
    }

    if (!session) {
      const data = await this.createNewSession(instance, {
        enabled: findTypebot?.enabled,
        url: url,
        typebot: typebot,
        expire: expire,
        keywordFinish: keywordFinish,
        delayMessage: delayMessage,
        unknownMessage: unknownMessage,
        listeningFromMe: listeningFromMe,
        remoteJid: remoteJid,
        pushName: msg.pushName,
        typebotId: findTypebot.id,
      });

      if (data?.session) {
        session = data.session;
      }

      await this.sendWAMessage(
        instance,
        session,
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
        data?.messages,
        data?.input,
        data?.clientSideActions,
      );

      if (data.messages.length === 0) {
        if (!content) {
          if (unknownMessage) {
            this.waMonitor.waInstances[instance.instanceName].textMessage(
              {
                number: remoteJid.split('@')[0],
                delay: delayMessage || 1000,
                text: unknownMessage,
              },
              false,
            );

            sendTelemetry('/message/sendText');
          }
          return;
        }

        if (keywordFinish && content.toLowerCase() === keywordFinish.toLowerCase()) {
          await this.prismaRepository.typebotSession.deleteMany({
            where: {
              typebotId: findTypebot.id,
              remoteJid: remoteJid,
            },
          });

          return;
        }

        let request: any;
        try {
          const version = this.configService.get<Typebot>('TYPEBOT').API_VERSION;
          let urlTypebot: string;
          let reqData: {};
          if (version === 'latest') {
            urlTypebot = `${url}/api/v1/sessions/${data.sessionId}/continueChat`;
            reqData = {
              message: content,
            };
          } else {
            urlTypebot = `${url}/api/v1/sendMessage`;
            reqData = {
              message: content,
              sessionId: data.sessionId,
            };
          }
          request = await axios.post(urlTypebot, reqData);

          await this.sendWAMessage(
            instance,
            session,
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
        } catch (error) {
          this.logger.error(error);
          return;
        }
      }
      return;
    }

    await this.prismaRepository.typebotSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: false,
      },
    });

    if (!content) {
      if (unknownMessage) {
        this.waMonitor.waInstances[instance.instanceName].textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: delayMessage || 1000,
            text: unknownMessage,
          },
          false,
        );

        sendTelemetry('/message/sendText');
      }
      return;
    }

    if (keywordFinish && content.toLowerCase() === keywordFinish.toLowerCase()) {
      await this.prismaRepository.typebotSession.deleteMany({
        where: {
          typebotId: findTypebot.id,
          remoteJid: remoteJid,
        },
      });
      return;
    }

    const version = this.configService.get<Typebot>('TYPEBOT').API_VERSION;
    let urlTypebot: string;
    let reqData: {};
    if (version === 'latest') {
      urlTypebot = `${url}/api/v1/sessions/${session.sessionId.split('-')[1]}/continueChat`;
      reqData = {
        message: content,
      };
    } else {
      urlTypebot = `${url}/api/v1/sendMessage`;
      reqData = {
        message: content,
        sessionId: session.sessionId.split('-')[1],
      };
    }
    const request = await axios.post(urlTypebot, reqData);

    await this.sendWAMessage(
      instance,
      session,
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
      request?.data?.messages,
      request?.data?.input,
      request?.data?.clientSideActions,
    );

    return;
  }
}
