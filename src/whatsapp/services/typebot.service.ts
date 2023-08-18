import axios from 'axios';

import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { Session, TypebotDto } from '../dto/typebot.dto';
import { MessageRaw } from '../models';
import { WAMonitoringService } from './monitor.service';

export class TypebotService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(TypebotService.name);

  public create(instance: InstanceDto, data: TypebotDto) {
    this.logger.verbose('create typebot: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setTypebot(data);

    return { typebot: { ...instance, typebot: data } };
  }

  public async find(instance: InstanceDto): Promise<TypebotDto> {
    try {
      this.logger.verbose('find typebot: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findTypebot();

      if (Object.keys(result).length === 0) {
        throw new Error('Typebot not found');
      }

      return result;
    } catch (error) {
      return { enabled: false, url: '', typebot: '', expire: 0, sessions: [] };
    }
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    const remoteJid = data.remoteJid;
    const status = data.status;

    const findData = await this.find(instance);

    const session = findData.sessions.find((session) => session.remoteJid === remoteJid);

    if (session) {
      if (status === 'closed') {
        findData.sessions.splice(findData.sessions.indexOf(session), 1);

        const typebotData = {
          enabled: true,
          url: findData.url,
          typebot: findData.typebot,
          expire: findData.expire,
          keyword_finish: findData.keyword_finish,
          delay_message: findData.delay_message,
          unknown_message: findData.unknown_message,
          sessions: findData.sessions,
        };

        this.create(instance, typebotData);

        return { typebot: { ...instance, typebot: typebotData } };
      }

      findData.sessions.map((session) => {
        if (session.remoteJid === remoteJid) {
          session.status = status;
        }
      });
    }

    const typebotData = {
      enabled: true,
      url: findData.url,
      typebot: findData.typebot,
      expire: findData.expire,
      keyword_finish: findData.keyword_finish,
      delay_message: findData.delay_message,
      unknown_message: findData.unknown_message,
      sessions: findData.sessions,
    };

    this.create(instance, typebotData);

    return { typebot: { ...instance, typebot: typebotData } };
  }

  public async startTypebot(instance: InstanceDto, data: any) {
    const remoteJid = data.remoteJid;
    const url = data.url;
    const typebot = data.typebot;

    const id = Math.floor(Math.random() * 10000000000).toString();

    const reqData = {
      sessionId: id,
      startParams: {
        typebot: data.typebot,
        prefilledVariables: {
          remoteJid: data.remoteJid,
          pushName: data.pushName,
          instanceName: instance.instanceName,
        },
      },
    };
    console.log(reqData);

    const request = await axios.post(data.url + '/api/v1/sendMessage', reqData);

    await this.sendWAMessage(
      instance,
      remoteJid,
      request.data.messages,
      request.data.input,
      request.data.clientSideActions,
    );

    return {
      typebot: {
        ...instance,
        typebot: {
          url: url,
          remoteJid: remoteJid,
          typebot: typebot,
        },
      },
    };
  }

  private getTypeMessage(msg: any) {
    this.logger.verbose('get type message');

    const types = {
      conversation: msg.conversation,
      extendedTextMessage: msg.extendedTextMessage?.text,
    };

    this.logger.verbose('type message: ' + types);

    return types;
  }

  private getMessageContent(types: any) {
    this.logger.verbose('get message content');
    const typeKey = Object.keys(types).find((key) => types[key] !== undefined);

    const result = typeKey ? types[typeKey] : undefined;

    this.logger.verbose('message content: ' + result);

    return result;
  }

  private getConversationMessage(msg: any) {
    this.logger.verbose('get conversation message');

    const types = this.getTypeMessage(msg);

    const messageContent = this.getMessageContent(types);

    this.logger.verbose('conversation message: ' + messageContent);

    return messageContent;
  }

  public async createNewSession(instance: InstanceDto, data: any) {
    const id = Math.floor(Math.random() * 10000000000).toString();
    const reqData = {
      sessionId: id,
      startParams: {
        typebot: data.typebot,
        prefilledVariables: {
          remoteJid: data.remoteJid,
          pushName: data.pushName,
          instanceName: instance.instanceName,
        },
      },
    };

    const request = await axios.post(data.url + '/api/v1/sendMessage', reqData);

    if (request.data.sessionId) {
      data.sessions.push({
        remoteJid: data.remoteJid,
        sessionId: `${id}-${request.data.sessionId}`,
        status: 'opened',
        createdAt: Date.now(),
        updateAt: Date.now(),
      });

      const typebotData = {
        enabled: true,
        url: data.url,
        typebot: data.typebot,
        expire: data.expire,
        keyword_finish: data.keyword_finish,
        delay_message: data.delay_message,
        unknown_message: data.unknown_message,
        sessions: data.sessions,
      };

      this.create(instance, typebotData);
    }

    return request.data;
  }

  public async sendWAMessage(
    instance: InstanceDto,
    remoteJid: string,
    messages: any[],
    input: any[],
    clientSideActions: any[],
  ) {
    processMessages(this.waMonitor.waInstances[instance.instanceName], messages, input, clientSideActions).catch(
      (err) => {
        console.error('Erro ao processar mensagens:', err);
      },
    );

    function findItemAndGetSecondsToWait(array, targetId) {
      if (!array) return null;

      for (const item of array) {
        if (item.lastBubbleBlockId === targetId) {
          return item.wait?.secondsToWaitFor;
        }
      }
      return null;
    }

    async function processMessages(instance, messages, input, clientSideActions) {
      for (const message of messages) {
        const wait = findItemAndGetSecondsToWait(clientSideActions, message.id);

        if (message.type === 'text') {
          let formattedText = '';

          let linkPreview = false;

          for (const richText of message.content.richText) {
            for (const element of richText.children) {
              let text = '';
              if (element.text) {
                text = element.text;
              }

              if (element.bold) {
                text = `*${text}*`;
              }

              if (element.italic) {
                text = `_${text}_`;
              }

              if (element.underline) {
                text = `~${text}~`;
              }

              if (element.url) {
                const linkText = element.children[0].text;
                text = `[${linkText}](${element.url})`;
                linkPreview = true;
              }

              formattedText += text;
            }
            formattedText += '\n';
          }

          formattedText = formattedText.replace(/\n$/, '');

          await instance.textMessage({
            number: remoteJid.split('@')[0],
            options: {
              delay: wait ? wait * 1000 : instance.localTypebot.delay_message || 1000,
              presence: 'composing',
              linkPreview: linkPreview,
            },
            textMessage: {
              text: formattedText,
            },
          });
        }

        if (message.type === 'image') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            options: {
              delay: wait ? wait * 1000 : instance.localTypebot.delay_message || 1000,
              presence: 'composing',
            },
            mediaMessage: {
              mediatype: 'image',
              media: message.content.url,
            },
          });
        }

        if (message.type === 'video') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            options: {
              delay: wait ? wait * 1000 : instance.localTypebot.delay_message || 1000,
              presence: 'composing',
            },
            mediaMessage: {
              mediatype: 'video',
              media: message.content.url,
            },
          });
        }

        if (message.type === 'audio') {
          await instance.audioWhatsapp({
            number: remoteJid.split('@')[0],
            options: {
              delay: wait ? wait * 1000 : instance.localTypebot.delay_message || 1000,
              presence: 'recording',
              encoding: true,
            },
            audioMessage: {
              audio: message.content.url,
            },
          });
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

          await instance.textMessage({
            number: remoteJid.split('@')[0],
            options: {
              delay: 1200,
              presence: 'composing',
              linkPreview: false,
            },
            textMessage: {
              text: formattedText,
            },
          });
        }
      }
    }
  }

  public async sendTypebot(instance: InstanceDto, remoteJid: string, msg: MessageRaw) {
    const url = (await this.find(instance)).url;
    const typebot = (await this.find(instance)).typebot;
    const sessions = ((await this.find(instance)).sessions as Session[]) ?? [];
    const expire = (await this.find(instance)).expire;
    const keyword_finish = (await this.find(instance)).keyword_finish;
    const delay_message = (await this.find(instance)).delay_message;
    const unknown_message = (await this.find(instance)).unknown_message;

    const session = sessions.find((session) => session.remoteJid === remoteJid);

    if (session && expire && expire > 0) {
      const now = Date.now();

      const diff = now - session.updateAt;

      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > expire) {
        sessions.splice(sessions.indexOf(session), 1);

        const data = await this.createNewSession(instance, {
          url: url,
          typebot: typebot,
          expire: expire,
          keyword_finish: keyword_finish,
          delay_message: delay_message,
          unknown_message: unknown_message,
          sessions: sessions,
          remoteJid: remoteJid,
          pushName: msg.pushName,
        });

        await this.sendWAMessage(instance, remoteJid, data.messages, data.input, data.clientSideActions);

        return;
      }
    }

    if (session && session.status !== 'opened') {
      return;
    }

    if (!session) {
      const data = await this.createNewSession(instance, {
        url: url,
        typebot: typebot,
        expire: expire,
        keyword_finish: keyword_finish,
        delay_message: delay_message,
        unknown_message: unknown_message,
        sessions: sessions,
        remoteJid: remoteJid,
        pushName: msg.pushName,
      });

      await this.sendWAMessage(instance, remoteJid, data.messages, data.input, data.clientSideActions);

      return;
    }

    sessions.map((session) => {
      if (session.remoteJid === remoteJid) {
        session.updateAt = Date.now();
      }
    });

    const typebotData = {
      enabled: true,
      url: url,
      typebot: typebot,
      expire: expire,
      keyword_finish: keyword_finish,
      delay_message: delay_message,
      unknown_message: unknown_message,
      sessions,
    };

    this.create(instance, typebotData);

    const content = this.getConversationMessage(msg.message);

    if (!content) {
      if (unknown_message) {
        this.waMonitor.waInstances[instance.instanceName].textMessage({
          number: remoteJid.split('@')[0],
          options: {
            delay: delay_message || 1000,
            presence: 'composing',
          },
          textMessage: {
            text: unknown_message,
          },
        });
      }
      return;
    }

    if (content.toLowerCase() === keyword_finish.toLowerCase()) {
      sessions.splice(sessions.indexOf(session), 1);

      const typebotData = {
        enabled: true,
        url: url,
        typebot: typebot,
        expire: expire,
        keyword_finish: keyword_finish,
        delay_message: delay_message,
        unknown_message: unknown_message,
        sessions,
      };

      this.create(instance, typebotData);

      return;
    }

    const reqData = {
      message: content,
      sessionId: session.sessionId.split('-')[1],
    };

    const request = await axios.post(url + '/api/v1/sendMessage', reqData);

    await this.sendWAMessage(
      instance,
      remoteJid,
      request.data.messages,
      request.data.input,
      request.data.clientSideActions,
    );

    return;
  }
}
