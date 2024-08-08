import { Message, OpenaiBot, OpenaiCreds, OpenaiSession, OpenaiSetting } from '@prisma/client';
import axios from 'axios';
import { downloadMediaMessage } from 'baileys';
import FormData from 'form-data';
import OpenAI from 'openai';
import P from 'pino';

import { ConfigService, Language, S3 } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { sendTelemetry } from '../../../../utils/sendTelemetry';
import { InstanceDto } from '../../../dto/instance.dto';
import { PrismaRepository } from '../../../repository/repository.service';
import { WAMonitoringService } from '../../../services/monitor.service';
import { OpenaiCredsDto, OpenaiDto, OpenaiIgnoreJidDto, OpenaiSettingDto } from '../dto/openai.dto';

export class OpenaiService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  private client: OpenAI;

  private readonly logger = new Logger(OpenaiService.name);

  public async createCreds(instance: InstanceDto, data: OpenaiCredsDto) {
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
      const creds = await this.prismaRepository.openaiCreds.create({
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

  public async findCreds(instance: InstanceDto) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const creds = await this.prismaRepository.openaiCreds.findMany({
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
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const creds = await this.prismaRepository.openaiCreds.findFirst({
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
      await this.prismaRepository.openaiCreds.delete({
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

  public async create(instance: InstanceDto, data: OpenaiDto) {
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
      !data.ignoreJids
    ) {
      const defaultSettingCheck = await this.prismaRepository.openaiSetting.findFirst({
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

      if (!data.openaiCredsId) {
        throw new Error('Openai Creds Id is required');
      }

      if (!defaultSettingCheck) {
        await this.setDefaultSettings(instance, {
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
        });
      }
    }

    const checkTriggerAll = await this.prismaRepository.openaiBot.findFirst({
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

    const checkDuplicate = await this.prismaRepository.openaiBot.findFirst({
      where: whereDuplication,
    });

    if (checkDuplicate) {
      throw new Error('Openai Bot already exists');
    }

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.prismaRepository.openaiBot.findFirst({
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
      const openaiBot = await this.prismaRepository.openaiBot.create({
        data: {
          enabled: data.enabled,
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
        },
      });

      return openaiBot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error creating openai bot');
    }
  }

  public async fetch(instance: InstanceDto, openaiBotId: string) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const openaiBot = await this.prismaRepository.openaiBot.findFirst({
      where: {
        id: openaiBotId,
      },
      include: {
        OpenaiSession: true,
      },
    });

    if (!openaiBot) {
      throw new Error('Openai Bot not found');
    }

    if (openaiBot.instanceId !== instanceId) {
      throw new Error('Openai Bot not found');
    }

    return openaiBot;
  }

  public async update(instance: InstanceDto, openaiBotId: string, data: OpenaiDto) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const openaiBot = await this.prismaRepository.openaiBot.findFirst({
      where: {
        id: openaiBotId,
      },
    });

    if (!openaiBot) {
      throw new Error('Openai Bot not found');
    }

    if (openaiBot.instanceId !== instanceId) {
      throw new Error('Openai Bot not found');
    }

    if (data.triggerType === 'all') {
      const checkTriggerAll = await this.prismaRepository.openaiBot.findFirst({
        where: {
          enabled: true,
          triggerType: 'all',
          id: {
            not: openaiBotId,
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
        not: openaiBotId,
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

    const checkDuplicate = await this.prismaRepository.openaiBot.findFirst({
      where: whereDuplication,
    });

    if (checkDuplicate) {
      throw new Error('Openai Bot already exists');
    }

    if (data.triggerType === 'keyword') {
      if (!data.triggerOperator || !data.triggerValue) {
        throw new Error('Trigger operator and value are required');
      }

      const checkDuplicate = await this.prismaRepository.openaiBot.findFirst({
        where: {
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          id: {
            not: openaiBotId,
          },
          instanceId: instanceId,
        },
      });

      if (checkDuplicate) {
        throw new Error('Trigger already exists');
      }
    }

    try {
      const openaiBot = await this.prismaRepository.openaiBot.update({
        where: {
          id: openaiBotId,
        },
        data: {
          enabled: data.enabled,
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
        },
      });

      return openaiBot;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error updating openai bot');
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

    const openaiBots = await this.prismaRepository.openaiBot.findMany({
      where: {
        instanceId: instanceId,
      },
      include: {
        OpenaiSession: true,
      },
    });

    if (!openaiBots.length) {
      return null;
    }

    return openaiBots;
  }

  public async delete(instance: InstanceDto, openaiBotId: string) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    const openaiBot = await this.prismaRepository.openaiBot.findFirst({
      where: {
        id: openaiBotId,
      },
    });

    if (!openaiBot) {
      throw new Error('Openai bot not found');
    }

    if (openaiBot.instanceId !== instanceId) {
      throw new Error('Openai bot not found');
    }
    try {
      await this.prismaRepository.openaiSession.deleteMany({
        where: {
          openaiBotId: openaiBotId,
        },
      });

      await this.prismaRepository.openaiBot.delete({
        where: {
          id: openaiBotId,
        },
      });

      return { openaiBot: { id: openaiBotId } };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error deleting openai bot');
    }
  }

  public async setDefaultSettings(instance: InstanceDto, data: OpenaiSettingDto) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.openaiSetting.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (settings) {
        const updateSettings = await this.prismaRepository.openaiSetting.update({
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
        };
      }

      const newSetttings = await this.prismaRepository.openaiSetting.create({
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

      const settings = await this.prismaRepository.openaiSetting.findFirst({
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
        openaiIdFallback: settings.openaiIdFallback,
        speechToText: settings.speechToText,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error fetching default settings');
    }
  }

  public async getModels(instance: InstanceDto) {
    const instanceId = await this.prismaRepository.instance
      .findFirst({
        where: {
          name: instance.instanceName,
        },
      })
      .then((instance) => instance.id);

    if (!instanceId) throw new Error('Instance not found');

    const defaultSettings = await this.prismaRepository.openaiSetting.findFirst({
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

  public async ignoreJid(instance: InstanceDto, data: OpenaiIgnoreJidDto) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const settings = await this.prismaRepository.openaiSetting.findFirst({
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

      const updateSettings = await this.prismaRepository.openaiSetting.update({
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

  public async fetchSessions(instance: InstanceDto, openaiBotId?: string, remoteJid?: string) {
    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((instance) => instance.id);

      const openaiBot = await this.prismaRepository.openaiBot.findFirst({
        where: {
          id: openaiBotId,
        },
      });

      if (!openaiBot) {
        throw new Error('Openai Bot not found');
      }

      if (openaiBot.instanceId !== instanceId) {
        throw new Error('Openai Bot not found');
      }

      if (openaiBot) {
        return await this.prismaRepository.openaiSession.findMany({
          where: {
            openaiBotId: openaiBotId,
          },
        });
      }

      if (remoteJid) {
        return await this.prismaRepository.openaiSession.findMany({
          where: {
            remoteJid: remoteJid,
            openaiBotId: openaiBotId,
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

      const defaultSettingCheck = await this.prismaRepository.openaiSetting.findFirst({
        where: {
          instanceId,
        },
      });

      const remoteJid = data.remoteJid;
      const status = data.status;

      if (status === 'delete') {
        await this.prismaRepository.openaiSession.deleteMany({
          where: {
            remoteJid: remoteJid,
          },
        });

        return { openai: { remoteJid: remoteJid, status: status } };
      }

      if (status === 'closed') {
        if (defaultSettingCheck?.keepOpen) {
          await this.prismaRepository.openaiSession.updateMany({
            where: {
              remoteJid: remoteJid,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.openaiSession.deleteMany({
            where: {
              remoteJid: remoteJid,
            },
          });
        }

        return { openai: { ...instance, openai: { remoteJid: remoteJid, status: status } } };
      } else {
        const session = await this.prismaRepository.openaiSession.updateMany({
          where: {
            instanceId: instanceId,
            remoteJid: remoteJid,
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

  public async findOpenaiByTrigger(content: string, instanceId: string) {
    // Check for triggerType 'all'
    const findTriggerAll = await this.prismaRepository.openaiBot.findFirst({
      where: {
        enabled: true,
        triggerType: 'all',
        instanceId: instanceId,
      },
    });

    if (findTriggerAll) return findTriggerAll;

    // Check for exact match
    const findTriggerEquals = await this.prismaRepository.openaiBot.findFirst({
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
    const findRegex = await this.prismaRepository.openaiBot.findMany({
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
    const findStartsWith = await this.prismaRepository.openaiBot.findMany({
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
    const findEndsWith = await this.prismaRepository.openaiBot.findMany({
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
    const findContains = await this.prismaRepository.openaiBot.findMany({
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

    const fallback = await this.prismaRepository.openaiSetting.findFirst({
      where: {
        instanceId: instanceId,
      },
    });

    if (fallback?.openaiIdFallback) {
      const findFallback = await this.prismaRepository.openaiBot.findFirst({
        where: {
          id: fallback.openaiIdFallback,
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

  public async sendOpenai(instance: InstanceDto, remoteJid: string, msg: Message) {
    try {
      const settings = await this.prismaRepository.openaiSetting.findFirst({
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

      const session = await this.prismaRepository.openaiSession.findFirst({
        where: {
          remoteJid: remoteJid,
          instanceId: instance.instanceId,
        },
      });

      const content = this.getConversationMessage(msg);

      let findOpenai = null;

      if (!session) {
        findOpenai = await this.findOpenaiByTrigger(content, instance.instanceId);

        if (!findOpenai) {
          return;
        }
      } else {
        findOpenai = await this.prismaRepository.openaiBot.findFirst({
          where: {
            id: session.openaiBotId,
          },
        });
      }

      if (!findOpenai) return;

      let openaiCredsId = findOpenai.openaiCredsId;
      let expire = findOpenai.expire;
      let keywordFinish = findOpenai.keywordFinish;
      let delayMessage = findOpenai.delayMessage;
      let unknownMessage = findOpenai.unknownMessage;
      let listeningFromMe = findOpenai.listeningFromMe;
      let stopBotFromMe = findOpenai.stopBotFromMe;
      let keepOpen = findOpenai.keepOpen;
      let debounceTime = findOpenai.debounceTime;

      if (
        !openaiCredsId ||
        !expire ||
        !keywordFinish ||
        !delayMessage ||
        !unknownMessage ||
        !listeningFromMe ||
        !stopBotFromMe ||
        !keepOpen ||
        !debounceTime
      ) {
        if (!openaiCredsId) openaiCredsId = settings.openaiCredsId;

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
        if (keepOpen) {
          await this.prismaRepository.openaiSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.openaiSession.deleteMany({
            where: {
              openaiBotId: findOpenai.id,
              remoteJid: remoteJid,
            },
          });
        }
        return;
      }

      if (!listeningFromMe && key.fromMe) {
        return;
      }

      if (debounceTime && debounceTime > 0) {
        this.processDebounce(content, remoteJid, debounceTime, async (debouncedContent) => {
          if (findOpenai.botType === 'assistant') {
            await this.processOpenaiAssistant(
              this.waMonitor.waInstances[instance.instanceName],
              remoteJid,
              findOpenai,
              session,
              settings,
              debouncedContent,
            );
          }

          if (findOpenai.botType === 'chatCompletion') {
            await this.processOpenaiChatCompletion(
              this.waMonitor.waInstances[instance.instanceName],
              remoteJid,
              findOpenai,
              session,
              settings,
              debouncedContent,
            );
          }
        });
      } else {
        if (findOpenai.botType === 'assistant') {
          await this.processOpenaiAssistant(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            findOpenai,
            session,
            settings,
            content,
          );
        }

        if (findOpenai.botType === 'chatCompletion') {
          await this.processOpenaiChatCompletion(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            findOpenai,
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

  public async createAssistantNewSession(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    try {
      this.client = new OpenAI({
        apiKey: creds.apiKey,
      });

      const threadId = (await this.client.beta.threads.create({})).id;

      let session = null;
      if (threadId) {
        session = await this.prismaRepository.openaiSession.create({
          data: {
            remoteJid: data.remoteJid,
            sessionId: threadId,
            status: 'opened',
            awaitUser: false,
            openaiBotId: data.openaiBotId,
            instanceId: instance.instanceId,
          },
        });
      }
      return { session };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private async initAssistantNewSession(
    instance: any,
    remoteJid: string,
    openaiBot: OpenaiBot,
    settings: OpenaiSetting,
    session: OpenaiSession,
    content: string,
  ) {
    const data = await this.createAssistantNewSession(instance, {
      remoteJid,
      openaiCredsId: openaiBot.openaiCredsId,
      openaiBotId: openaiBot.id,
    });

    if (data.session) {
      session = data.session;
    }

    await this.client.beta.threads.messages.create(data.session.sessionId, {
      role: 'user',
      content,
    });

    const runAssistant = await this.client.beta.threads.runs.create(data.session.sessionId, {
      assistant_id: openaiBot.assistantId,
    });

    await instance.client.presenceSubscribe(remoteJid);

    await instance.client.sendPresenceUpdate('composing', remoteJid);

    const response = await this.getAIResponse(data.session.sessionId, runAssistant.id, openaiBot.functionUrl);

    await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = response?.data[0].content[0].text.value;

    await instance.textMessage(
      {
        number: remoteJid.split('@')[0],
        delay: settings?.delayMessage || 1000,
        text: message,
      },
      false,
    );

    await this.prismaRepository.openaiSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: true,
      },
    });

    sendTelemetry('/message/sendText');

    return;
  }

  private isJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async getAIResponse(threadId: string, runId: string, functionUrl: string) {
    const getRun = await this.client.beta.threads.runs.retrieve(threadId, runId);
    let toolCalls;

    switch (getRun.status) {
      case 'requires_action':
        toolCalls = getRun?.required_action?.submit_tool_outputs?.tool_calls;

        if (toolCalls) {
          for (const toolCall of toolCalls) {
            const id = toolCall.id;
            const functionName = toolCall?.function?.name;
            const functionArgument = this.isJSON(toolCall?.function?.arguments)
              ? JSON.parse(toolCall?.function?.arguments)
              : toolCall?.function?.arguments;

            let output = null;

            try {
              const { data } = await axios.post(functionUrl, {
                name: functionName,
                arguments: functionArgument,
              });

              output = JSON.stringify(data)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
            } catch (error) {
              output = JSON.stringify(error)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
            }

            await this.client.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: [
                {
                  tool_call_id: id,
                  output,
                },
              ],
            });
          }
        }

        return null;

      case 'queued':
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl);
      case 'in_progress':
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl);
      case 'completed':
        return await this.client.beta.threads.messages.list(threadId, {
          run_id: runId,
          limit: 1,
        });
    }
  }

  private async processOpenaiAssistant(
    instance: any,
    remoteJid: string,
    openaiBot: OpenaiBot,
    session: OpenaiSession,
    settings: OpenaiSetting,
    content: string,
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
          await this.prismaRepository.openaiSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.openaiSession.deleteMany({
            where: {
              openaiBotId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initAssistantNewSession(instance, remoteJid, openaiBot, settings, session, content);
        return;
      }
    }

    if (!session) {
      await this.initAssistantNewSession(instance, remoteJid, openaiBot, settings, session, content);
      return;
    }

    await this.prismaRepository.openaiSession.update({
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
        await this.prismaRepository.openaiSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.openaiSession.deleteMany({
          where: {
            openaiBotId: openaiBot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const threadId = session.sessionId;

    await this.client.beta.threads.messages.create(threadId, {
      role: 'user',
      content,
    });

    const runAssistant = await this.client.beta.threads.runs.create(threadId, {
      assistant_id: openaiBot.assistantId,
    });

    await instance.client.presenceSubscribe(remoteJid);

    await instance.client.sendPresenceUpdate('composing', remoteJid);

    const response = await this.getAIResponse(threadId, runAssistant.id, openaiBot.functionUrl);

    await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = response?.data[0].content[0].text.value;

    await instance.textMessage(
      {
        number: remoteJid.split('@')[0],
        delay: settings?.delayMessage || 1000,
        text: message,
      },
      false,
    );

    await this.prismaRepository.openaiSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: true,
      },
    });

    sendTelemetry('/message/sendText');

    return;
  }

  public async createChatCompletionNewSession(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const id = Math.floor(Math.random() * 10000000000).toString();

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    try {
      const session = await this.prismaRepository.openaiSession.create({
        data: {
          remoteJid: data.remoteJid,
          sessionId: id,
          status: 'opened',
          awaitUser: false,
          openaiBotId: data.openaiBotId,
          instanceId: instance.instanceId,
        },
      });

      return { session, creds };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private async initChatCompletionNewSession(
    instance: any,
    remoteJid: string,
    openaiBot: OpenaiBot,
    settings: OpenaiSetting,
    session: OpenaiSession,
    content: string,
  ) {
    const data = await this.createChatCompletionNewSession(instance, {
      remoteJid,
      openaiCredsId: openaiBot.openaiCredsId,
      openaiBotId: openaiBot.id,
    });

    session = data.session;
    const creds = data.creds;

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const systemMessages: any = openaiBot.systemMessages;

    const messagesSystem: any[] = systemMessages.map((message) => {
      return {
        role: 'system',
        content: message,
      };
    });

    const assistantMessages: any = openaiBot.assistantMessages;

    const messagesAssistant: any[] = assistantMessages.map((message) => {
      return {
        role: 'assistant',
        content: message,
      };
    });

    const userMessages: any = openaiBot.userMessages;

    const messagesUser: any[] = userMessages.map((message) => {
      return {
        role: 'user',
        content: message,
      };
    });

    const messages: any[] = [
      ...messagesSystem,
      ...messagesAssistant,
      ...messagesUser,
      {
        role: 'user',
        content: content,
      },
    ];

    await instance.client.presenceSubscribe(remoteJid);

    await instance.client.sendPresenceUpdate('composing', remoteJid);

    const completions = await this.client.chat.completions.create({
      model: openaiBot.model,
      messages: messages,
      max_tokens: openaiBot.maxTokens,
    });

    await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = completions.choices[0].message.content;

    await instance.textMessage(
      {
        number: remoteJid.split('@')[0],
        delay: settings?.delayMessage || 1000,
        text: message,
      },
      false,
    );

    await this.prismaRepository.openaiSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: true,
      },
    });

    sendTelemetry('/message/sendText');

    return;
  }

  private async processOpenaiChatCompletion(
    instance: any,
    remoteJid: string,
    openaiBot: OpenaiBot,
    session: OpenaiSession,
    settings: OpenaiSetting,
    content: string,
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
          await this.prismaRepository.openaiSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.openaiSession.deleteMany({
            where: {
              openaiBotId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initChatCompletionNewSession(instance, remoteJid, openaiBot, settings, session, content);
        return;
      }
    }

    if (!session) {
      await this.initChatCompletionNewSession(instance, remoteJid, openaiBot, settings, session, content);
      return;
    }

    await this.prismaRepository.openaiSession.update({
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
        await this.prismaRepository.openaiSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.openaiSession.deleteMany({
          where: {
            openaiBotId: openaiBot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const systemMessages: any = openaiBot.systemMessages;

    const messagesSystem: any[] = systemMessages.map((message) => {
      return {
        role: 'system',
        content: message,
      };
    });

    const assistantMessages: any = openaiBot.assistantMessages;

    const messagesAssistant: any[] = assistantMessages.map((message) => {
      return {
        role: 'assistant',
        content: message,
      };
    });

    const userMessages: any = openaiBot.userMessages;

    const messagesUser: any[] = userMessages.map((message) => {
      return {
        role: 'user',
        content: message,
      };
    });

    const messages: any[] = [
      ...messagesSystem,
      ...messagesAssistant,
      ...messagesUser,
      {
        role: 'user',
        content: content,
      },
    ];

    await instance.client.presenceSubscribe(remoteJid);

    await instance.client.sendPresenceUpdate('composing', remoteJid);

    const completions = await this.client.chat.completions.create({
      model: openaiBot.model,
      messages: messages,
      max_tokens: openaiBot.maxTokens,
    });

    await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = completions.choices[0].message.content;

    await instance.textMessage(
      {
        number: remoteJid.split('@')[0],
        delay: settings?.delayMessage || 1000,
        text: message,
      },
      false,
    );

    await this.prismaRepository.openaiSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: true,
      },
    });

    sendTelemetry('/message/sendText');

    return;
  }

  public async speechToText(creds: OpenaiCreds, msg: any, updateMediaMessage: any) {
    let audio;

    if (msg?.message?.mediaUrl) {
      audio = await axios.get(msg.message.mediaUrl, { responseType: 'arraybuffer' }).then((response) => {
        return Buffer.from(response.data, 'binary');
      });
    } else {
      audio = await downloadMediaMessage(
        { key: msg.key, message: msg?.message },
        'buffer',
        {},
        {
          logger: P({ level: 'error' }) as any,
          reuploadRequest: updateMediaMessage,
        },
      );
    }

    const lang = this.configService.get<Language>('LANGUAGE').includes('pt')
      ? 'pt'
      : this.configService.get<Language>('LANGUAGE');

    const formData = new FormData();

    formData.append('file', audio, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${creds.apiKey}`,
      },
    });

    return response?.data?.text;
  }
}
