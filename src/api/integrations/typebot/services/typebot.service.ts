import { Message } from '@prisma/client';
import axios from 'axios';
import EventEmitter2 from 'eventemitter2';

import { ConfigService, Typebot } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { WAMonitoringService } from '../../../services/monitor.service';
import { Events } from '../../../types/wa.types';
import { TypebotDto } from '../dto/typebot.dto';

export class TypebotService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.eventEmitter.on('typebot:end', async (data) => {
      const keep_open = this.configService.get<Typebot>('TYPEBOT').KEEP_OPEN;
      if (keep_open) return;

      await this.clearSessions(data.instance, data.remoteJid);
    });
  }

  private readonly logger = new Logger(TypebotService.name);

  public create(instance: InstanceDto, data: TypebotDto) {
    this.waMonitor.waInstances[instance.instanceName].setTypebot(data);

    return { typebot: { ...instance, typebot: data } };
  }

  public async find(instance: InstanceDto): Promise<TypebotDto> {
    try {
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
          enabled: findData.enabled,
          url: findData.url,
          typebot: findData.typebot,
          expire: findData.expire,
          keywordFinish: findData.keywordFinish,
          delayMessage: findData.delayMessage,
          unknownMessage: findData.unknownMessage,
          listeningFromMe: findData.listeningFromMe,
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
    } else if (status === 'paused') {
      // const session: Session = {
      //   remoteJid: remoteJid,
      //   sessionId: Math.floor(Math.random() * 10000000000).toString(),
      //   status: status,
      //   createdAt: Date.now(),
      //   updateAt: Date.now(),
      //   prefilledVariables: {
      //     remoteJid: remoteJid,
      //     pushName: '',
      //     additionalData: {},
      //   },
      // };
      // findData.sessions.push(session);
    }

    const typebotData = {
      enabled: findData.enabled,
      url: findData.url,
      typebot: findData.typebot,
      expire: findData.expire,
      keywordFinish: findData.keywordFinish,
      delayMessage: findData.delayMessage,
      unknownMessage: findData.unknownMessage,
      listeningFromMe: findData.listeningFromMe,
      sessions: findData.sessions,
    };

    this.create(instance, typebotData);

    this.waMonitor.waInstances[instance.instanceName].sendDataWebhook(Events.TYPEBOT_CHANGE_STATUS, {
      remoteJid: remoteJid,
      status: status,
      url: findData.url,
      typebot: findData.typebot,
      session,
    });

    return { typebot: { ...instance, typebot: typebotData } };
  }

  public async clearSessions(instance: InstanceDto, remoteJid: string) {
    const findTypebot = await this.find(instance);
    const sessions = [];
    // const sessions = (findTypebot.sessions as Session[]) ?? [];

    const sessionWithRemoteJid = sessions.filter((session) => session.remoteJid === remoteJid);

    if (sessionWithRemoteJid.length > 0) {
      sessionWithRemoteJid.forEach((session) => {
        sessions.splice(sessions.indexOf(session), 1);
      });

      const typebotData = {
        enabled: findTypebot.enabled,
        url: findTypebot.url,
        typebot: findTypebot.typebot,
        expire: findTypebot.expire,
        keywordFinish: findTypebot.keywordFinish,
        delayMessage: findTypebot.delayMessage,
        unknownMessage: findTypebot.unknownMessage,
        listeningFromMe: findTypebot.listeningFromMe,
        sessions,
      };

      this.create(instance, typebotData);

      return sessions;
    }

    return sessions;
  }

  public async startTypebot(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const remoteJid = data.remoteJid;
    const url = data.url;
    const typebot = data.typebot;
    const startSession = data.startSession;
    const variables = data.variables;
    const findTypebot = await this.find(instance);
    const expire = findTypebot.expire;
    const keywordFinish = findTypebot.keywordFinish;
    const delayMessage = findTypebot.delayMessage;
    const unknownMessage = findTypebot.unknownMessage;
    const listeningFromMe = findTypebot.listeningFromMe;

    const prefilledVariables = {
      remoteJid: remoteJid,
      instanceName: instance.instanceName,
    };

    if (variables?.length) {
      variables.forEach((variable: { name: string | number; value: string }) => {
        prefilledVariables[variable.name] = variable.value;
      });
    }

    if (startSession) {
      const newSessions = await this.clearSessions(instance, remoteJid);

      const response = await this.createNewSession(instance, {
        enabled: findTypebot.enabled,
        url: url,
        typebot: typebot,
        remoteJid: remoteJid,
        expire: expire,
        keywordFinish: keywordFinish,
        delayMessage: delayMessage,
        unknownMessage: unknownMessage,
        listeningFromMe: listeningFromMe,
        sessions: newSessions,
        prefilledVariables: prefilledVariables,
      });

      if (response.sessionId) {
        await this.sendWAMessage(instance, remoteJid, response.messages, response.input, response.clientSideActions);

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
    const types = {
      conversation: msg.conversation,
      extendedTextMessage: msg.extendedTextMessage?.text,
      audioMessage: msg.audioMessage?.url,
      imageMessage: msg.imageMessage?.url,
      videoMessage: msg.videoMessage?.url,
      documentMessage: msg.documentMessage?.fileName,
      contactMessage: msg.contactMessage?.displayName,
      locationMessage: msg.locationMessage?.degreesLatitude,
      viewOnceMessageV2:
        msg.viewOnceMessageV2?.message?.imageMessage?.url ||
        msg.viewOnceMessageV2?.message?.videoMessage?.url ||
        msg.viewOnceMessageV2?.message?.audioMessage?.url,
      listResponseMessage: msg.listResponseMessage?.singleSelectReply?.selectedRowId,
      responseRowId: msg.listResponseMessage?.singleSelectReply?.selectedRowId,
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

  private getAudioMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const audioContent = types.audioMessage;

    return audioContent;
  }

  private getImageMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const imageContent = types.imageMessage;

    return imageContent;
  }

  private getVideoMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const videoContent = types.videoMessage;

    return videoContent;
  }

  private getDocumentMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const documentContent = types.documentMessage;

    return documentContent;
  }

  private getContactMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const contactContent = types.contactMessage;

    return contactContent;
  }

  private getLocationMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const locationContent = types.locationMessage;

    return locationContent;
  }

  private getViewOnceMessageV2Content(msg: any) {
    const types = this.getTypeMessage(msg);

    const viewOnceContent = types.viewOnceMessageV2;

    return viewOnceContent;
  }

  private getListResponseMessageContent(msg: any) {
    const types = this.getTypeMessage(msg);

    const listResponseContent = types.listResponseMessage || types.responseRowId;

    return listResponseContent;
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
            },
          },
        };
      }
      const request = await axios.post(url, reqData);

      if (request?.data?.sessionId) {
        data.sessions.push({
          remoteJid: data.remoteJid,
          sessionId: `${id}-${request.data.sessionId}`,
          status: 'opened',
          createdAt: Date.now(),
          updateAt: Date.now(),
          prefilledVariables: {
            ...data.prefilledVariables,
            remoteJid: data.remoteJid,
            pushName: data.pushName || '',
            instanceName: instance.instanceName,
          },
        });

        const typebotData = {
          enabled: data.enabled,
          url: data.url,
          typebot: data.typebot,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          sessions: data.sessions,
        };

        this.create(instance, typebotData);
      }
      return request.data;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  public async sendWAMessage(
    instance: InstanceDto,
    remoteJid: string,
    messages: any[],
    input: any[],
    clientSideActions: any[],
  ) {
    processMessages(
      this.waMonitor.waInstances[instance.instanceName],
      messages,
      input,
      clientSideActions,
      this.eventEmitter,
      applyFormatting,
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

      if (element.type === 'p') {
        text = text.trim() + '\n';
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

    async function processMessages(instance, messages, input, clientSideActions, eventEmitter, applyFormatting) {
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

          await instance.textMessage({
            number: remoteJid.split('@')[0],
            options: {
              delay: instance.localTypebot.delayMessage || 1000,
              presence: 'composing',
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
              delay: instance.localTypebot.delayMessage || 1000,
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
              delay: instance.localTypebot.delayMessage || 1000,
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
              delay: instance.localTypebot.delayMessage || 1000,
              presence: 'recording',
              encoding: true,
            },
            audioMessage: {
              audio: message.content.url,
            },
          });
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

          await instance.textMessage({
            number: remoteJid.split('@')[0],
            options: {
              delay: instance.localTypebot.delayMessage || 1000,
              presence: 'composing',
            },
            textMessage: {
              text: formattedText,
            },
          });
        }
      } else {
        eventEmitter.emit('typebot:end', {
          instance: instance,
          remoteJid: remoteJid,
        });
      }
    }
  }

  public async sendTypebot(instance: InstanceDto, remoteJid: string, msg: Message) {
    const findTypebot = await this.find(instance);
    const url = findTypebot.url;
    const typebot = findTypebot.typebot;
    // const sessions = (findTypebot.sessions as Session[]) ?? [];
    const sessions = [];
    const expire = findTypebot.expire;
    const keywordFinish = findTypebot.keywordFinish;
    const delayMessage = findTypebot.delayMessage;
    const unknownMessage = findTypebot.unknownMessage;
    const listeningFromMe = findTypebot.listeningFromMe;
    const messageType = this.getTypeMessage(msg.message).messageType;

    const session = sessions.find((session) => session.remoteJid === remoteJid);

    try {
      if (session && expire && expire > 0) {
        const now = Date.now();

        const diff = now - session.updateAt;

        const diffInMinutes = Math.floor(diff / 1000 / 60);

        if (diffInMinutes > expire) {
          const newSessions = await this.clearSessions(instance, remoteJid);

          const data = await this.createNewSession(instance, {
            enabled: findTypebot.enabled,
            url: url,
            typebot: typebot,
            expire: expire,
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            sessions: newSessions,
            remoteJid: remoteJid,
            pushName: msg.pushName,
          });

          await this.sendWAMessage(instance, remoteJid, data.messages, data.input, data.clientSideActions);

          if (data.messages.length === 0) {
            const content = this.getConversationMessage(msg.message);

            if (!content) {
              if (unknownMessage) {
                this.waMonitor.waInstances[instance.instanceName].textMessage({
                  number: remoteJid.split('@')[0],
                  delay: delayMessage || 1000,
                  text: unknownMessage,
                });
              }
              return;
            }

            if (keywordFinish && content.toLowerCase() === keywordFinish.toLowerCase()) {
              const newSessions = await this.clearSessions(instance, remoteJid);

              const typebotData = {
                enabled: findTypebot.enabled,
                url: url,
                typebot: typebot,
                expire: expire,
                keywordFinish: keywordFinish,
                delayMessage: delayMessage,
                unknownMessage: unknownMessage,
                listeningFromMe: listeningFromMe,
                sessions: newSessions,
              };

              this.create(instance, typebotData);

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
          enabled: findTypebot.enabled,
          url: url,
          typebot: typebot,
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          sessions: sessions,
          remoteJid: remoteJid,
          pushName: msg.pushName,
          prefilledVariables: {
            messageType: messageType,
          },
        });

        await this.sendWAMessage(instance, remoteJid, data.messages, data.input, data.clientSideActions);

        if (data.messages.length === 0) {
          const content = this.getConversationMessage(msg.message);

          if (!content) {
            if (unknownMessage) {
              this.waMonitor.waInstances[instance.instanceName].textMessage({
                number: remoteJid.split('@')[0],
                delay: delayMessage || 1000,
                text: unknownMessage,
              });
            }
            return;
          }

          if (keywordFinish && content.toLowerCase() === keywordFinish.toLowerCase()) {
            const newSessions = await this.clearSessions(instance, remoteJid);

            const typebotData = {
              enabled: findTypebot.enabled,
              url: url,
              typebot: typebot,
              expire: expire,
              keywordFinish: keywordFinish,
              delayMessage: delayMessage,
              unknownMessage: unknownMessage,
              listeningFromMe: listeningFromMe,
              sessions: newSessions,
            };

            this.create(instance, typebotData);

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

      sessions.map((session) => {
        if (session.remoteJid === remoteJid) {
          session.updateAt = Date.now();
        }
      });

      const typebotData = {
        enabled: findTypebot.enabled,
        url: url,
        typebot: typebot,
        expire: expire,
        keywordFinish: keywordFinish,
        delayMessage: delayMessage,
        unknownMessage: unknownMessage,
        listeningFromMe: listeningFromMe,
        sessions,
      };

      this.create(instance, typebotData);

      const content = this.getConversationMessage(msg.message);

      if (!content) {
        if (unknownMessage) {
          this.waMonitor.waInstances[instance.instanceName].textMessage({
            number: remoteJid.split('@')[0],
            delay: delayMessage || 1000,
            text: unknownMessage,
          });
        }
        return;
      }

      if (keywordFinish && content.toLowerCase() === keywordFinish.toLowerCase()) {
        const newSessions = await this.clearSessions(instance, remoteJid);

        const typebotData = {
          enabled: findTypebot.enabled,
          url: url,
          typebot: typebot,
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          sessions: newSessions,
        };

        this.create(instance, typebotData);

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
        remoteJid,
        request.data.messages,
        request.data.input,
        request.data.clientSideActions,
      );

      return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
