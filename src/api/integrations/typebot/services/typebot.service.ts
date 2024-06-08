import { Message, TypebotSession } from '@prisma/client';
import axios from 'axios';
import EventEmitter2 from 'eventemitter2';

import { Auth, ConfigService, Typebot } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { PrismaRepository } from '../../../repository/repository.service';
import { WAMonitoringService } from '../../../services/monitor.service';
import { Events } from '../../../types/wa.types';
import { TypebotDto } from '../dto/typebot.dto';

export class TypebotService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.eventEmitter.on('typebot:end', async (data) => {
      const keep_open = this.configService.get<Typebot>('TYPEBOT').KEEP_OPEN;
      if (keep_open) return;

      await this.prismaRepository.typebotSession.deleteMany({
        where: {
          id: data.sessionId,
        },
      });
    });
  }

  private readonly logger = new Logger(TypebotService.name);

  public create(instance: InstanceDto, data: TypebotDto) {
    this.waMonitor.waInstances[instance.instanceName].setTypebot(data);

    return { typebot: { ...instance, typebot: data } };
  }

  public async find(instance: InstanceDto): Promise<any> {
    try {
      const typebot = await this.waMonitor.waInstances[instance.instanceName].findTypebot();

      if (Object.keys(typebot).length === 0) {
        throw new Error('Typebot not found');
      }

      const sessions = await this.prismaRepository.typebotSession.findMany({
        where: {
          typebotId: typebot.id,
        },
      });

      return {
        typebot,
        sessions,
      };
    } catch (error) {
      return null;
    }
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    const remoteJid = data.remoteJid;
    const status = data.status;

    const findData = await this.find(instance);

    const session = await this.prismaRepository.typebotSession.updateMany({
      where: {
        typebotId: findData?.typebot?.id,
        remoteJid: remoteJid,
      },
      data: {
        status: status,
      },
    });

    const typebotData = {
      remoteJid: remoteJid,
      status: status,
      url: findData?.typebot?.url,
      typebot: findData?.typebot?.typebot,
      session,
    };

    this.waMonitor.waInstances[instance.instanceName].sendDataWebhook(Events.TYPEBOT_CHANGE_STATUS, typebotData);

    return { typebot: { ...instance, typebot: typebotData } };
  }

  public async startTypebot(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const remoteJid = data.remoteJid;
    const url = data.url;
    const typebot = data.typebot;
    const startSession = data.startSession;
    const variables = data.variables;
    const findTypebot = await this.find(instance);
    const expire = findTypebot?.typebot?.expire;
    const keywordFinish = findTypebot?.typebot?.keywordFinish;
    const delayMessage = findTypebot?.typebot?.delayMessage;
    const unknownMessage = findTypebot?.typebot?.unknownMessage;
    const listeningFromMe = findTypebot?.typebot?.listeningFromMe;

    const prefilledVariables = {
      remoteJid: remoteJid,
      instanceName: instance.instanceName,
    };

    if (this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES)
      prefilledVariables['token'] = instance.token;

    if (variables?.length) {
      variables.forEach((variable: { name: string | number; value: string }) => {
        prefilledVariables[variable.name] = variable.value;
      });
    }

    if (startSession) {
      await this.prismaRepository.typebotSession.deleteMany({
        where: {
          typebotId: findTypebot.typebot.id,
          remoteJid: remoteJid,
        },
      });

      const response = await this.createNewSession(instance, {
        enabled: findTypebot?.typebot?.enabled,
        url: url,
        typebot: typebot,
        remoteJid: remoteJid,
        expire: expire,
        keywordFinish: keywordFinish,
        delayMessage: delayMessage,
        unknownMessage: unknownMessage,
        listeningFromMe: listeningFromMe,
        prefilledVariables: prefilledVariables,
        typebotId: findTypebot.typebot.id,
      });

      if (response.sessionId) {
        await this.sendWAMessage(
          instance,
          response.session,
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
    remoteJid: string,
    messages: any[],
    input: any[],
    clientSideActions: any[],
  ) {
    processMessages(
      this.waMonitor.waInstances[instance.instanceName],
      session,
      messages,
      input,
      clientSideActions,
      this.eventEmitter,
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
      instance,
      session,
      messages,
      input,
      clientSideActions,
      eventEmitter,
      applyFormatting,
      prismaRepository,
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

          await instance.textMessage({
            number: remoteJid.split('@')[0],
            delay: instance.localTypebot.delayMessage || 1000,
            text: formattedText,
          });
        }

        if (message.type === 'image') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            delay: instance.localTypebot.delayMessage || 1000,
            mediatype: 'image',
            media: message.content.url,
          });
        }

        if (message.type === 'video') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            delay: instance.localTypebot.delayMessage || 1000,
            mediatype: 'video',
            media: message.content.url,
          });
        }

        if (message.type === 'audio') {
          await instance.audioWhatsapp({
            number: remoteJid.split('@')[0],
            delay: instance.localTypebot.delayMessage || 1000,
            encoding: true,
            audio: message.content.url,
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
            delay: instance.localTypebot.delayMessage || 1000,
            text: formattedText,
          });
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
        eventEmitter.emit('typebot:end', {
          sessionId: session.id,
        });
      }
    }
  }

  public async sendTypebot(instance: InstanceDto, remoteJid: string, msg: Message) {
    const findTypebot = await this.find(instance);
    const url = findTypebot.typebot?.url;
    const typebot = findTypebot.typebot?.typebot;
    const expire = findTypebot.typebot?.expire;
    const keywordFinish = findTypebot.typebot?.keywordFinish;
    const delayMessage = findTypebot.typebot?.delayMessage;
    const unknownMessage = findTypebot.typebot?.unknownMessage;
    const listeningFromMe = findTypebot.typebot?.listeningFromMe;

    let session = await this.prismaRepository.typebotSession.findFirst({
      where: {
        typebotId: findTypebot.typebot.id,
        remoteJid: remoteJid,
      },
    });

    if (session && !session.awaitUser) return;

    try {
      if (session && expire && expire > 0) {
        const now = Date.now();

        const sessionUpdatedAt = new Date(session.updatedAt).getTime();

        const diff = now - sessionUpdatedAt;

        const diffInMinutes = Math.floor(diff / 1000 / 60);

        if (diffInMinutes > expire) {
          await this.prismaRepository.typebotSession.deleteMany({
            where: {
              typebotId: findTypebot.typebot.id,
              remoteJid: remoteJid,
            },
          });

          const data = await this.createNewSession(instance, {
            enabled: findTypebot.typebot.enabled,
            url: url,
            typebot: typebot,
            expire: expire,
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            remoteJid: remoteJid,
            pushName: msg.pushName,
            typebotId: findTypebot.typebot.id,
          });

          if (data.session) {
            session = data.session;
          }

          await this.sendWAMessage(instance, session, remoteJid, data.messages, data.input, data.clientSideActions);

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
              await this.prismaRepository.typebotSession.deleteMany({
                where: {
                  typebotId: findTypebot.typebot.id,
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
          enabled: findTypebot.typebot?.enabled,
          url: url,
          typebot: typebot,
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          remoteJid: remoteJid,
          pushName: msg.pushName,
          typebotId: findTypebot.typebot.id,
        });

        if (data.session) {
          session = data.session;
        }

        await this.sendWAMessage(instance, session, remoteJid, data?.messages, data?.input, data?.clientSideActions);

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
            await this.prismaRepository.typebotSession.deleteMany({
              where: {
                typebotId: findTypebot.typebot.id,
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
        await this.prismaRepository.typebotSession.deleteMany({
          where: {
            typebotId: findTypebot.typebot.id,
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
        remoteJid,
        request?.data?.messages,
        request?.data?.input,
        request?.data?.clientSideActions,
      );

      return;
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
