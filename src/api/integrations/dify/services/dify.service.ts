import { Dify, DifySession, DifySetting, Message } from '@prisma/client';
import axios from 'axios';
import { Readable } from 'stream';

import { Auth, ConfigService, HttpServer, S3 } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { sendTelemetry } from '../../../../utils/sendTelemetry';
import { InstanceDto } from '../../../dto/instance.dto';
import { PrismaRepository } from '../../../repository/repository.service';
import { WAMonitoringService } from '../../../services/monitor.service';
import { DifyDto, DifyIgnoreJidDto, DifySettingDto } from '../dto/dify.dto';

export class DifyService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  private readonly logger = new Logger(DifyService.name);

  public async create(instance: InstanceDto, data: DifyDto) {
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
      const defaultSettingCheck = await this.prismaRepository.difySetting.findFirst({
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

    const checkTriggerAll = await this.prismaRepository.dify.findFirst({
      where: {
        enabled: true,
        triggerType: 'all',
        instanceId: instanceId,
      },
    });

    if (checkTriggerAll && data.triggerType === 'all') {
      throw new Error('You already have a dify with an "All" trigger, you cannot have more bots while it is active');
    }

    const checkDuplicate = await this.prismaRepository.dify.findFirst({
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

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.prismaRepository.dify.findFirst({
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
      const dify = await this.prismaRepository.dify.create({
        data: {
          enabled: data.enabled,
          description: data.description,
          botType: data.botType,
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

      return dify;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating dify');
    }
  }

  public async fetch(instance: InstanceDto, difyId: string) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const dify = await this.prismaRepository.dify.findFirst({
      where: {
        id: difyId,
      },
      include: {
        DifySession: true,
      },
    });

    if (!dify) {
      throw new Error('Dify not found');
    }

    if (dify.instanceId !== instanceId) {
      throw new Error('Dify not found');
    }

    return dify;
  }

  public async update(instance: InstanceDto, difyId: string, data: DifyDto) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const dify = await this.prismaRepository.dify.findFirst({
      where: {
        id: difyId,
      },
    });

    if (!dify) {
      throw new Error('Dify not found');
    }

    if (dify.instanceId !== instanceId) {
      throw new Error('Dify not found');
    }

    if (data.triggerType === 'all') {
      const checkTriggerAll = await this.prismaRepository.dify.findFirst({
        where: {
          enabled: true,
          triggerType: 'all',
          id: {
            not: difyId,
          },
          instanceId: instanceId,
        },
      });

      if (checkTriggerAll) {
        throw new Error('You already have a dify with an "All" trigger, you cannot have more bots while it is active');
      }
    }

    const checkDuplicate = await this.prismaRepository.dify.findFirst({
      where: {
        id: {
          not: difyId,
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

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.prismaRepository.dify.findFirst({
        where: {
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          id: {
            not: difyId,
          },
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }
    }

    try {
      const dify = await this.prismaRepository.dify.update({
        where: {
          id: difyId,
        },
        data: {
          enabled: data.enabled,
          botType: data.botType,
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

      return dify;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error updating dify');
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

    const difys = await this.prismaRepository.dify.findMany({
      where: {
        instanceId: instanceId,
      },
      include: {
        DifySession: true,
      },
    });

    if (!difys.length) {
      return null;
    }

    return difys;
  }

  public async delete(instance: InstanceDto, difyId: string) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const dify = await this.prismaRepository.dify.findFirst({
      where: {
        id: difyId,
      },
    });

    if (!dify) {
      throw new Error('Dify not found');
    }

    if (dify.instanceId !== instanceId) {
      throw new Error('Dify not found');
    }
    try {
      await this.prismaRepository.difySession.deleteMany({
        where: {
          difyId: difyId,
        },
      });

      await this.prismaRepository.dify.delete({
        where: {
          id: difyId,
        },
      });

      return { dify: { id: difyId } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error deleting openai bot');
    }
  }

  public async setDefaultSettings(instance: InstanceDto, data: DifySettingDto) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.difySetting.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (settings) {
        const updateSettings = await this.prismaRepository.difySetting.update({
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
            difyIdFallback: data.difyIdFallback,
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
          difyIdFallback: updateSettings.difyIdFallback,
          ignoreJids: updateSettings.ignoreJids,
        };
      }

      const newSetttings = await this.prismaRepository.difySetting.create({
        data: {
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          difyIdFallback: data.difyIdFallback,
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
        difyIdFallback: newSetttings.difyIdFallback,
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

      const settings = await this.prismaRepository.difySetting.findFirst({
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
          difyIdFallback: '',
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
        difyIdFallback: settings.difyIdFallback,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching default settings');
    }
  }

  public async ignoreJid(instance: InstanceDto, data: DifyIgnoreJidDto) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.difySetting.findFirst({
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

      const updateSettings = await this.prismaRepository.difySetting.update({
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

  public async fetchSessions(instance: InstanceDto, difyId?: string, remoteJid?: string) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const dify = await this.prismaRepository.dify.findFirst({
        where: {
          id: difyId,
        },
      });

      if (dify && dify.instanceId !== instanceId) {
        throw new Error('Dify not found');
      }

      if (dify) {
        return await this.prismaRepository.difySession.findMany({
          where: {
            difyId: difyId,
          },
          include: {
            Dify: true,
          },
        });
      }

      if (remoteJid) {
        return await this.prismaRepository.difySession.findMany({
          where: {
            remoteJid: remoteJid,
            difyId: difyId,
          },
          include: {
            Dify: true,
          },
        });
      }

      return await this.prismaRepository.difySession.findMany({
        where: {
          instanceId: instanceId,
        },
        include: {
          Dify: true,
        },
      });
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

      const defaultSettingCheck = await this.prismaRepository.difySetting.findFirst({
        where: {
          instanceId,
        },
      });

      const remoteJid = data.remoteJid;
      const status = data.status;

      if (status === 'delete') {
        await this.prismaRepository.difySession.deleteMany({
          where: {
            remoteJid: remoteJid,
          },
        });

        return { dify: { remoteJid: remoteJid, status: status } };
      }

      if (status === 'closed') {
        if (defaultSettingCheck?.keepOpen) {
          await this.prismaRepository.difySession.updateMany({
            where: {
              remoteJid: remoteJid,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.difySession.deleteMany({
            where: {
              remoteJid: remoteJid,
            },
          });
        }

        return { dify: { ...instance, dify: { remoteJid: remoteJid, status: status } } };
      } else {
        const session = await this.prismaRepository.difySession.updateMany({
          where: {
            instanceId: instanceId,
            remoteJid: remoteJid,
          },
          data: {
            status: status,
          },
        });

        const difyData = {
          remoteJid: remoteJid,
          status: status,
          session,
        };

        return { dify: { ...instance, dify: difyData } };
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error changing status');
    }
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
      audioMessage: msg?.message?.speechToText
        ? msg?.message?.speechToText
        : msg?.message?.audioMessage
        ? `audioMessage|${mediaId}`
        : undefined,
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

  public async findDifyByTrigger(content: string, instanceId: string) {
    // Check for triggerType 'all'
    const findTriggerAll = await this.prismaRepository.dify.findFirst({
      where: {
        enabled: true,
        triggerType: 'all',
        instanceId: instanceId,
      },
    });

    if (findTriggerAll) return findTriggerAll;

    // Check for exact match
    const findTriggerEquals = await this.prismaRepository.dify.findFirst({
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
    const findRegex = await this.prismaRepository.dify.findMany({
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
    const findStartsWith = await this.prismaRepository.dify.findMany({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'startsWith',
        instanceId: instanceId,
      },
    });

    let findTriggerStartsWith = null;

    for (const startsWith of findStartsWith) {
      if (content.startsWith(startsWith.triggerValue)) {
        findTriggerStartsWith = startsWith;
        break;
      }
    }

    if (findTriggerStartsWith) return findTriggerStartsWith;

    // Check for endsWith match
    const findEndsWith = await this.prismaRepository.dify.findMany({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'endsWith',
        instanceId: instanceId,
      },
    });

    let findTriggerEndsWith = null;

    for (const endsWith of findEndsWith) {
      if (content.endsWith(endsWith.triggerValue)) {
        findTriggerEndsWith = endsWith;
        break;
      }
    }

    if (findTriggerEndsWith) return findTriggerEndsWith;

    // Check for contains match
    const findContains = await this.prismaRepository.dify.findMany({
      where: {
        enabled: true,
        triggerType: 'keyword',
        triggerOperator: 'contains',
        instanceId: instanceId,
      },
    });

    let findTriggerContains = null;

    for (const contains of findContains) {
      if (content.includes(contains.triggerValue)) {
        findTriggerContains = contains;
        break;
      }
    }

    if (findTriggerContains) return findTriggerContains;

    const fallback = await this.prismaRepository.difySetting.findFirst({
      where: {
        instanceId: instanceId,
      },
    });

    if (fallback?.difyIdFallback) {
      const findFallback = await this.prismaRepository.dify.findFirst({
        where: {
          id: fallback.difyIdFallback,
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

  public async sendDify(instance: InstanceDto, remoteJid: string, msg: Message) {
    try {
      const settings = await this.prismaRepository.difySetting.findFirst({
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

      const session = await this.prismaRepository.difySession.findFirst({
        where: {
          remoteJid: remoteJid,
          instanceId: instance.instanceId,
        },
      });

      const content = this.getConversationMessage(msg);

      let findDify = null;

      if (!session) {
        findDify = await this.findDifyByTrigger(content, instance.instanceId);

        if (!findDify) {
          return;
        }
      } else {
        findDify = await this.prismaRepository.dify.findFirst({
          where: {
            id: session.difyId,
          },
        });
      }

      if (!findDify) return;

      let expire = findDify.expire;
      let keywordFinish = findDify.keywordFinish;
      let delayMessage = findDify.delayMessage;
      let unknownMessage = findDify.unknownMessage;
      let listeningFromMe = findDify.listeningFromMe;
      let stopBotFromMe = findDify.stopBotFromMe;
      let keepOpen = findDify.keepOpen;
      let debounceTime = findDify.debounceTime;

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
        await this.prismaRepository.difySession.update({
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
        this.processDebounce(content, remoteJid, debounceTime, async (debouncedContent) => {
          await this.processDify(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            findDify,
            session,
            settings,
            debouncedContent,
            msg?.pushName,
          );
        });
      } else {
        await this.processDify(
          this.waMonitor.waInstances[instance.instanceName],
          remoteJid,
          findDify,
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

  public async createNewSession(instance: InstanceDto, data: any) {
    try {
      const session = await this.prismaRepository.difySession.create({
        data: {
          remoteJid: data.remoteJid,
          sessionId: data.remoteJid,
          status: 'opened',
          awaitUser: false,
          difyId: data.difyId,
          instanceId: instance.instanceId,
        },
      });

      return { session };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private async initNewSession(
    instance: any,
    remoteJid: string,
    dify: Dify,
    settings: DifySetting,
    session: DifySession,
    content: string,
    pushName?: string,
  ) {
    const data = await this.createNewSession(instance, {
      remoteJid,
      difyId: dify.id,
    });

    if (data.session) {
      session = data.session;
    }

    let endpoint: string = dify.apiUrl;

    if (dify.botType === 'chatBot') {
      endpoint += '/chat-messages';
      const payload = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: message,
        },
        false,
      );

      await this.prismaRepository.difySession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'textGenerator') {
      endpoint += '/completion-messages';
      const payload = {
        inputs: {
          query: content,
          pushName: pushName,
          remoteJid: remoteJid,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: message,
        },
        false,
      );

      await this.prismaRepository.difySession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'agent') {
      endpoint += '/chat-messages';
      const payload = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'streaming',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
        responseType: 'stream',
      });

      let conversationId;

      const stream = response.data;
      const reader = new Readable().wrap(stream);

      reader.on('data', (chunk) => {
        const data = chunk.toString();

        try {
          const event = JSON.parse(data);
          if (event.event === 'agent_message') {
            conversationId = conversationId ?? event?.conversation_id;
          }
        } catch (error) {
          console.error('Error parsing stream data:', error);
        }
      });

      reader.on('end', async () => {
        await instance.client.sendPresenceUpdate('paused', remoteJid);

        const message = response?.data?.answer;

        await instance.textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            text: message,
          },
          false,
        );

        await this.prismaRepository.difySession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: conversationId,
          },
        });

        sendTelemetry('/message/sendText');
      });

      reader.on('error', (error) => {
        console.error('Error reading stream:', error);
      });

      return;
    }

    if (dify.botType === 'workflow') {
      endpoint += '/workflows/run';
      const payload = {
        inputs: {
          query: content,
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.data.outputs.text;

      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: message,
        },
        false,
      );

      if (settings.keepOpen) {
        await this.prismaRepository.difySession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.difySession.delete({
          where: {
            id: session.id,
          },
        });
      }

      sendTelemetry('/message/sendText');

      return;
    }

    return;
  }

  private async processDify(
    instance: any,
    remoteJid: string,
    dify: Dify,
    session: DifySession,
    settings: DifySetting,
    content: string,
    pushName?: string,
  ) {
    if (session && session.status !== 'opened') {
      return;
    }

    if (session && settings.expire && settings.expire > 0) {
      const now = Date.now();

      const sessionUpdatedAt = new Date(session.updatedAt).getTime();

      const diff = now - sessionUpdatedAt;

      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > settings.expire) {
        if (settings.keepOpen) {
          await this.prismaRepository.difySession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.difySession.deleteMany({
            where: {
              difyId: dify.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initNewSession(instance, remoteJid, dify, settings, session, content, pushName);
        return;
      }
    }

    if (!session) {
      await this.initNewSession(instance, remoteJid, dify, settings, session, content, pushName);
      return;
    }

    await this.prismaRepository.difySession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: false,
      },
    });

    if (!content) {
      if (settings.unknownMessage) {
        this.waMonitor.waInstances[instance.instanceName].textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings.delayMessage || 1000,
            text: settings.unknownMessage,
          },
          false,
        );

        sendTelemetry('/message/sendText');
      }
      return;
    }

    if (settings.keywordFinish && content.toLowerCase() === settings.keywordFinish.toLowerCase()) {
      if (settings.keepOpen) {
        await this.prismaRepository.difySession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.difySession.deleteMany({
          where: {
            difyId: dify.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    let endpoint: string = dify.apiUrl;

    if (dify.botType === 'chatBot') {
      endpoint += '/chat-messages';
      const payload = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: message,
        },
        false,
      );

      await this.prismaRepository.difySession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'textGenerator') {
      endpoint += '/completion-messages';
      const payload = {
        inputs: {
          query: content,
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.answer;

      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: message,
        },
        false,
      );

      await this.prismaRepository.difySession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: response?.data?.conversation_id,
        },
      });

      sendTelemetry('/message/sendText');

      return;
    }

    if (dify.botType === 'agent') {
      endpoint += '/chat-messages';
      const payload = {
        inputs: {
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        query: content,
        response_mode: 'streaming',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
        responseType: 'stream',
      });

      let completeMessage = '';
      let conversationId;

      const stream = response.data;
      const reader = new Readable().wrap(stream);

      reader.on('data', (chunk) => {
        const data = chunk.toString();
        const lines = data.split('\n');

        lines.forEach((line) => {
          if (line.startsWith('data: ')) {
            const jsonString = line.substring(6);
            try {
              const event = JSON.parse(jsonString);
              if (event.event === 'agent_message') {
                completeMessage += event.answer;
                conversationId = conversationId ?? event?.conversation_id;
              }
            } catch (error) {
              console.error('Error parsing stream data:', error);
            }
          }
        });
      });

      reader.on('end', async () => {
        await instance.client.sendPresenceUpdate('paused', remoteJid);

        await instance.textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            text: completeMessage,
          },
          false,
        );

        await this.prismaRepository.difySession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: conversationId,
          },
        });

        sendTelemetry('/message/sendText');
      });

      reader.on('error', (error) => {
        console.error('Error reading stream:', error);
      });

      return;
    }

    if (dify.botType === 'workflow') {
      endpoint += '/workflows/run';
      const payload = {
        inputs: {
          query: content,
          remoteJid: remoteJid,
          pushName: pushName,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
        },
        response_mode: 'blocking',
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      await instance.client.presenceSubscribe(remoteJid);

      await instance.client.sendPresenceUpdate('composing', remoteJid);

      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${dify.apiKey}`,
        },
      });

      await instance.client.sendPresenceUpdate('paused', remoteJid);

      const message = response?.data?.data.outputs.text;

      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: message,
        },
        false,
      );

      if (settings.keepOpen) {
        await this.prismaRepository.difySession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.difySession.delete({
          where: {
            id: session.id,
          },
        });
      }

      sendTelemetry('/message/sendText');

      return;
    }

    return;
  }
}
