import { NumberBusiness } from '@api/dto/chat.dto';
import {
  ContactMessage,
  MediaMessage,
  Options,
  SendAudioDto,
  SendButtonsDto,
  SendContactDto,
  SendListDto,
  SendLocationDto,
  SendMediaDto,
  SendReactionDto,
  SendTemplateDto,
  SendTextDto,
} from '@api/dto/sendMessage.dto';
import * as s3Service from '@api/integrations/storage/s3/libs/minio.server';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { chatbotController } from '@api/server.module';
import { CacheService } from '@api/services/cache.service';
import { ChannelStartupService } from '@api/services/channel.service';
import { Events, wa } from '@api/types/wa.types';
import { Chatwoot, ConfigService, Database, Openai, S3, WaBusiness } from '@config/env.config';
import { BadRequestException, InternalServerErrorException } from '@exceptions';
import { status } from '@utils/renderStatus';
import axios from 'axios';
import { arrayUnique, isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import mime from 'mime';
import { join } from 'path';

export class BusinessStartupService extends ChannelStartupService {
  constructor(
    public readonly configService: ConfigService,
    public readonly eventEmitter: EventEmitter2,
    public readonly prismaRepository: PrismaRepository,
    public readonly cache: CacheService,
    public readonly chatwootCache: CacheService,
    public readonly baileysCache: CacheService,
    private readonly providerFiles: ProviderFiles,
  ) {
    super(configService, eventEmitter, prismaRepository, chatwootCache);
  }

  public stateConnection: wa.StateConnection = { state: 'open' };

  public phoneNumber: string;
  public mobile: boolean;

  public get connectionStatus() {
    return this.stateConnection;
  }

  public async closeClient() {
    this.stateConnection = { state: 'close' };
  }

  public get qrCode(): wa.QrCode {
    return {
      pairingCode: this.instance.qrcode?.pairingCode,
      code: this.instance.qrcode?.code,
      base64: this.instance.qrcode?.base64,
      count: this.instance.qrcode?.count,
    };
  }

  public async logoutInstance() {
    await this.closeClient();
  }

  private isMediaMessage(message: any) {
    return message.document ||
      message.image ||
      message.audio ||
      message.video
  }

  private async post(message: any, params: string) {
    try {
      let urlServer = this.configService.get<WaBusiness>('WA_BUSINESS').URL;
      const version = this.configService.get<WaBusiness>('WA_BUSINESS').VERSION;
      urlServer = `${urlServer}/${version}/${this.number}/${params}`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
      const result = await axios.post(urlServer, message, { headers });
      return result.data;
    } catch (e) {
      return e.response?.data?.error;
    }
  }

  public async profilePicture(number: string) {
    const jid = this.createJid(number);

    return {
      wuid: jid,
      profilePictureUrl: null,
    };
  }

  public async getProfileName() {
    return null;
  }

  public async profilePictureUrl() {
    return null;
  }

  public async getProfileStatus() {
    return null;
  }

  public async setWhatsappBusinessProfile(data: NumberBusiness): Promise<any> {
    const content = {
      messaging_product: 'whatsapp',
      about: data.about,
      address: data.address,
      description: data.description,
      vertical: data.vertical,
      email: data.email,
      websites: data.websites,
      profile_picture_handle: data.profilehandle,
    };
    return await this.post(content, 'whatsapp_business_profile');
  }

  public async connectToWhatsapp(data?: any): Promise<any> {
    if (!data) return;

    const content = data.entry[0].changes[0].value;

    try {
      this.loadChatwoot();

      this.eventHandler(content);

      this.phoneNumber = this.createJid(
        content.messages ? content.messages[0].from : content.statuses[0]?.recipient_id,
      );
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString());
    }
  }

  private async downloadMediaMessage(message: any) {
    try {
      const id = message[message.type].id;
      let urlServer = this.configService.get<WaBusiness>('WA_BUSINESS').URL;
      const version = this.configService.get<WaBusiness>('WA_BUSINESS').VERSION;
      urlServer = `${urlServer}/${version}/${id}`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
      let result = await axios.get(urlServer, { headers });
      result = await axios.get(result.data.url, { headers, responseType: 'arraybuffer' });
      return result.data;
    } catch (e) {
      this.logger.error(e);
    }
  }

  private messageMediaJson(received: any) {
    const message = received.messages[0];
    let content: any = message.type + 'Message';
    content = { [content]: message[message.type] };
    message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    return content;
  }

  private messageInteractiveJson(received: any) {
    const message = received.messages[0];
    let content: any = { conversation: message.interactive[message.interactive.type].title };
    message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    return content;
  }

  private messageButtonJson(received: any) {
    const message = received.messages[0];
    let content: any = { conversation: received.messages[0].button?.text };
    message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    return content;
  }

  private messageReactionJson(received: any) {
    const message = received.messages[0];
    let content: any = {
      reactionMessage: {
        key: {
          id: message.reaction.message_id,
        },
        text: message.reaction.emoji,
      },
    };
    message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    return content;
  }

  private messageTextJson(received: any) {
    let content: any;
    const message = received.messages[0];
    if (message.from === received.metadata.phone_number_id) {
      content = {
        extendedTextMessage: { text: message.text.body },
      };
      message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    } else {
      content = { conversation: message.text.body };
      message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    }
    return content;
  }

  private messageContactsJson(received: any) {
    const message = received.messages[0];
    let content: any = {};

    const vcard = (contact: any) => {
      let result =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `N:${contact.name.formatted_name}\n` +
        `FN:${contact.name.formatted_name}\n`;

      if (contact.org) {
        result += `ORG:${contact.org.company};\n`;
      }

      if (contact.emails) {
        result += `EMAIL:${contact.emails[0].email}\n`;
      }

      if (contact.urls) {
        result += `URL:${contact.urls[0].url}\n`;
      }

      if (!contact.phones[0]?.wa_id) {
        contact.phones[0].wa_id = this.createJid(contact.phones[0].phone);
      }

      result +=
        `item1.TEL;waid=${contact.phones[0]?.wa_id}:${contact.phones[0].phone}\n` +
        'item1.X-ABLabel:Celular\n' +
        'END:VCARD';

      return result;
    };

    if (message.contacts.length === 1) {
      content.contactMessage = {
        displayName: message.contacts[0].name.formatted_name,
        vcard: vcard(message.contacts[0]),
      };
    } else {
      content.contactsArrayMessage = {
        displayName: `${message.length} contacts`,
        contacts: message.map((contact) => {
          return {
            displayName: contact.name.formatted_name,
            vcard: vcard(contact),
          };
        }),
      };
    }
    message.context ? (content = { ...content, contextInfo: { stanzaId: message.context.id } }) : content;
    return content;
  }

  private renderMessageType(type: string) {
    let messageType: string;

    switch (type) {
      case 'text':
        messageType = 'conversation';
        break;
      case 'image':
        messageType = 'imageMessage';
        break;
      case 'video':
        messageType = 'videoMessage';
        break;
      case 'audio':
        messageType = 'audioMessage';
        break;
      case 'document':
        messageType = 'documentMessage';
        break;
      case 'template':
        messageType = 'conversation';
        break;
      default:
        messageType = 'conversation';
        break;
    }

    return messageType;
  }

  protected async messageHandle(received: any, database: Database, settings: any) {
    try {
      let messageRaw: any;
      let pushName: any;

      if (received.contacts) pushName = received.contacts[0].profile.name;

      if (received.messages) {
        const key = {
          id: received.messages[0].id,
          remoteJid: this.phoneNumber,
          fromMe: received.messages[0].from === received.metadata.phone_number_id,
        };
        if (this.isMediaMessage(received?.messages[0])) {
          messageRaw = {
            key,
            pushName,
            message: this.messageMediaJson(received),
            contextInfo: this.messageMediaJson(received)?.contextInfo,
            messageType: this.renderMessageType(received.messages[0].type),
            messageTimestamp: parseInt(received.messages[0].timestamp) as number,
            source: 'unknown',
            instanceId: this.instanceId,
          };

          if (this.configService.get<S3>('S3').ENABLE) {
            try {
              const message: any = received;

              const id = message.messages[0][message.messages[0].type].id;
              let urlServer = this.configService.get<WaBusiness>('WA_BUSINESS').URL;
              const version = this.configService.get<WaBusiness>('WA_BUSINESS').VERSION;
              urlServer = `${urlServer}/${version}/${id}`;
              const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
              const result = await axios.get(urlServer, { headers });

              const buffer = await axios.get(result.data.url, { headers, responseType: 'arraybuffer' });

              const mediaType = message.messages[0].document
                ? 'document'
                : message.messages[0].image
                ? 'image'
                : message.messages[0].audio
                ? 'audio'
                : 'video';

              const mimetype = result.data?.mime_type || result.headers['content-type'];

              const contentDisposition = result.headers['content-disposition'];
              let fileName = `${message.messages[0].id}.${mimetype.split('/')[1]}`;
              if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+?)"/);
                if (match) {
                  fileName = match[1];
                }
              }

              const size = result.headers['content-length'] || buffer.data.byteLength;

              const fullName = join(`${this.instance.id}`, key.remoteJid, mediaType, fileName);

              await s3Service.uploadFile(fullName, buffer.data, size, {
                'Content-Type': mimetype,
              });

              const createdMessage = await this.prismaRepository.message.create({
                data: messageRaw,
              });

              await this.prismaRepository.media.create({
                data: {
                  messageId: createdMessage.id,
                  instanceId: this.instanceId,
                  type: mediaType,
                  fileName: fullName,
                  mimetype,
                },
              });

              const mediaUrl = await s3Service.getObjectUrl(fullName);

              messageRaw.message.mediaUrl = mediaUrl;
              messageRaw.message.base64 = buffer.data.toString('base64');
            } catch (error) {
              this.logger.error(['Error on upload file to minio', error?.message, error?.stack]);
            }
          } else {
            const buffer = await this.downloadMediaMessage(received?.messages[0]);

            messageRaw.message.base64 = buffer.toString('base64');
          }
        } else if (received?.messages[0].interactive) {
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageInteractiveJson(received),
            },
            contextInfo: this.messageInteractiveJson(received)?.contextInfo,
            messageType: 'interactiveMessage',
            messageTimestamp: parseInt(received.messages[0].timestamp) as number,
            source: 'unknown',
            instanceId: this.instanceId,
          };
        } else if (received?.messages[0].button) {
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageButtonJson(received),
            },
            contextInfo: this.messageButtonJson(received)?.contextInfo,
            messageType: 'buttonMessage',
            messageTimestamp: parseInt(received.messages[0].timestamp) as number,
            source: 'unknown',
            instanceId: this.instanceId,
          };
        } else if (received?.messages[0].reaction) {
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageReactionJson(received),
            },
            contextInfo: this.messageReactionJson(received)?.contextInfo,
            messageType: 'reactionMessage',
            messageTimestamp: parseInt(received.messages[0].timestamp) as number,
            source: 'unknown',
            instanceId: this.instanceId,
          };
        } else if (received?.messages[0].contacts) {
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageContactsJson(received),
            },
            contextInfo: this.messageContactsJson(received)?.contextInfo,
            messageType: 'contactMessage',
            messageTimestamp: parseInt(received.messages[0].timestamp) as number,
            source: 'unknown',
            instanceId: this.instanceId,
          };
        } else {
          messageRaw = {
            key,
            pushName,
            message: this.messageTextJson(received),
            contextInfo: this.messageTextJson(received)?.contextInfo,
            messageType: this.renderMessageType(received.messages[0].type),
            messageTimestamp: parseInt(received.messages[0].timestamp) as number,
            source: 'unknown',
            instanceId: this.instanceId,
          };
        }

        if (this.localSettings.readMessages) {
          // await this.client.readMessages([received.key]);
        }

        if (this.configService.get<Openai>('OPENAI').ENABLED) {
          const openAiDefaultSettings = await this.prismaRepository.openaiSetting.findFirst({
            where: {
              instanceId: this.instanceId,
            },
            include: {
              OpenaiCreds: true,
            },
          });

          const audioMessage = received?.messages[0]?.audio;

          if (
            openAiDefaultSettings &&
            openAiDefaultSettings.openaiCredsId &&
            openAiDefaultSettings.speechToText &&
            audioMessage
          ) {
            messageRaw.message.speechToText = await this.openaiService.speechToText(
              openAiDefaultSettings.OpenaiCreds,
              {
                message: {
                  mediaUrl: messageRaw.message.mediaUrl,
                  ...messageRaw,
                }
              },
              () => {},
            );
          }
        }

        this.logger.log(messageRaw);

        this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw);

        await chatbotController.emit({
          instance: { instanceName: this.instance.name, instanceId: this.instanceId },
          remoteJid: messageRaw.key.remoteJid,
          msg: messageRaw,
          pushName: messageRaw.pushName,
        });

        if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled) {
          const chatwootSentMessage = await this.chatwootService.eventWhatsapp(
            Events.MESSAGES_UPSERT,
            { instanceName: this.instance.name, instanceId: this.instanceId },
            messageRaw,
          );

          if (chatwootSentMessage?.id) {
            messageRaw.chatwootMessageId = chatwootSentMessage.id;
            messageRaw.chatwootInboxId = chatwootSentMessage.id;
            messageRaw.chatwootConversationId = chatwootSentMessage.id;
          }
        }

        if (!this.isMediaMessage(received?.messages[0])) {
          await this.prismaRepository.message.create({
            data: messageRaw,
          });
        }

        const contact = await this.prismaRepository.contact.findFirst({
          where: { instanceId: this.instanceId, remoteJid: key.remoteJid },
        });

        const contactRaw: any = {
          remoteJid: received.contacts[0].profile.phone,
          pushName,
          // profilePicUrl: '',
          instanceId: this.instanceId,
        };

        if (contactRaw.remoteJid === 'status@broadcast') {
          return;
        }

        if (contact) {
          const contactRaw: any = {
            remoteJid: received.contacts[0].profile.phone,
            pushName,
            // profilePicUrl: '',
            instanceId: this.instanceId,
          };

          this.sendDataWebhook(Events.CONTACTS_UPDATE, contactRaw);

          if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled) {
            await this.chatwootService.eventWhatsapp(
              Events.CONTACTS_UPDATE,
              { instanceName: this.instance.name, instanceId: this.instanceId },
              contactRaw,
            );
          }

          await this.prismaRepository.contact.updateMany({
            where: { remoteJid: contact.remoteJid },
            data: contactRaw,
          });
          return;
        }

        this.sendDataWebhook(Events.CONTACTS_UPSERT, contactRaw);

        this.prismaRepository.contact.create({
          data: contactRaw,
        });
      }
      if (received.statuses) {
        for await (const item of received.statuses) {
          const key = {
            id: item.id,
            remoteJid: this.phoneNumber,
            fromMe: this.phoneNumber === received.metadata.phone_number_id,
          };
          if (settings?.groups_ignore && key.remoteJid.includes('@g.us')) {
            return;
          }
          if (key.remoteJid !== 'status@broadcast' && !key?.remoteJid?.match(/(:\d+)/)) {
            const findMessage = await this.prismaRepository.message.findFirst({
              where: {
                instanceId: this.instanceId,
                key: {
                  path: ['id'],
                  equals: key.id,
                },
              },
            });

            if (!findMessage) {
              return;
            }

            if (item.message === null && item.status === undefined) {
              this.sendDataWebhook(Events.MESSAGES_DELETE, key);

              const message: any = {
                messageId: findMessage.id,
                keyId: key.id,
                remoteJid: key.remoteJid,
                fromMe: key.fromMe,
                participant: key?.remoteJid,
                status: 'DELETED',
                instanceId: this.instanceId,
              };

              await this.prismaRepository.messageUpdate.create({
                data: message,
              });

              if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled) {
                this.chatwootService.eventWhatsapp(
                  Events.MESSAGES_DELETE,
                  { instanceName: this.instance.name, instanceId: this.instanceId },
                  { key: key },
                );
              }

              return;
            }

            const message: any = {
              messageId: findMessage.id,
              keyId: key.id,
              remoteJid: key.remoteJid,
              fromMe: key.fromMe,
              participant: key?.remoteJid,
              status: item.status.toUpperCase(),
              instanceId: this.instanceId,
            };

            this.sendDataWebhook(Events.MESSAGES_UPDATE, message);

            await this.prismaRepository.messageUpdate.create({
              data: message,
            });

            if (findMessage.webhookUrl) {
              await axios.post(findMessage.webhookUrl, message);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  private convertMessageToRaw(message: any, content: any) {
    let convertMessage: any;

    if (message?.conversation) {
      if (content?.context?.message_id) {
        convertMessage = {
          ...message,
          contextInfo: { stanzaId: content.context.message_id },
        };
        return convertMessage;
      }
      convertMessage = message;
      return convertMessage;
    }

    if (message?.mediaType === 'image') {
      if (content?.context?.message_id) {
        convertMessage = {
          imageMessage: message,
          contextInfo: { stanzaId: content.context.message_id },
        };
        return convertMessage;
      }
      return {
        imageMessage: message,
      };
    }

    if (message?.mediaType === 'video') {
      if (content?.context?.message_id) {
        convertMessage = {
          videoMessage: message,
          contextInfo: { stanzaId: content.context.message_id },
        };
        return convertMessage;
      }
      return {
        videoMessage: message,
      };
    }

    if (message?.mediaType === 'audio') {
      if (content?.context?.message_id) {
        convertMessage = {
          audioMessage: message,
          contextInfo: { stanzaId: content.context.message_id },
        };
        return convertMessage;
      }
      return {
        audioMessage: message,
      };
    }

    if (message?.mediaType === 'document') {
      if (content?.context?.message_id) {
        convertMessage = {
          documentMessage: message,
          contextInfo: { stanzaId: content.context.message_id },
        };
        return convertMessage;
      }
      return {
        documentMessage: message,
      };
    }

    return message;
  }

  protected async eventHandler(content: any) {
    const database = this.configService.get<Database>('DATABASE');
    const settings = await this.findSettings();

    this.messageHandle(content, database, settings);
  }

  protected async sendMessageWithTyping(number: string, message: any, options?: Options, isIntegration = false) {
    try {
      let quoted: any;
      let webhookUrl: any;
      const linkPreview = options?.linkPreview != false ? undefined : false;
      if (options?.quoted) {
        const m = options?.quoted;

        const msg = m?.key;

        if (!msg) {
          throw 'Message not found';
        }

        quoted = msg;
      }
      if (options?.webhookUrl) {
        webhookUrl = options.webhookUrl;
      }

      let content: any;
      const messageSent = await (async () => {
        if (message['reactionMessage']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'reaction',
            to: number.replace(/\D/g, ''),
            reaction: {
              message_id: message['reactionMessage']['key']['id'],
              emoji: message['reactionMessage']['text'],
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          return await this.post(content, 'messages');
        }
        if (message['locationMessage']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'location',
            to: number.replace(/\D/g, ''),
            location: {
              longitude: message['locationMessage']['degreesLongitude'],
              latitude: message['locationMessage']['degreesLatitude'],
              name: message['locationMessage']['name'],
              address: message['locationMessage']['address'],
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          return await this.post(content, 'messages');
        }
        if (message['contacts']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'contacts',
            to: number.replace(/\D/g, ''),
            contacts: message['contacts'],
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          message = message['message'];
          return await this.post(content, 'messages');
        }
        if (message['conversation']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'text',
            to: number.replace(/\D/g, ''),
            text: {
              body: message['conversation'],
              preview_url: linkPreview,
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          return await this.post(content, 'messages');
        }
        if (message['media']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: message['mediaType'],
            to: number.replace(/\D/g, ''),
            [message['mediaType']]: {
              [message['type']]: message['id'],
              preview_url: linkPreview,
              caption: message['caption'],
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          return await this.post(content, 'messages');
        }
        if (message['audio']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'audio',
            to: number.replace(/\D/g, ''),
            audio: {
              [message['type']]: message['id'],
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          return await this.post(content, 'messages');
        }
        if (message['buttons']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: number.replace(/\D/g, ''),
            type: 'interactive',
            interactive: {
              type: 'button',
              body: {
                text: message['text'] || 'Select',
              },
              action: {
                buttons: message['buttons'],
              },
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          let formattedText = '';
          for (const item of message['buttons']) {
            formattedText += `▶️ ${item.reply?.title}\n`;
          }
          message = { conversation: `${message['text'] || 'Select'}\n` + formattedText };
          return await this.post(content, 'messages');
        }
        if (message['listMessage']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: number.replace(/\D/g, ''),
            type: 'interactive',
            interactive: {
              type: 'list',
              header: {
                type: 'text',
                text: message['listMessage']['title'],
              },
              body: {
                text: message['listMessage']['description'],
              },
              footer: {
                text: message['listMessage']['footerText'],
              },
              action: {
                button: message['listMessage']['buttonText'],
                sections: message['listMessage']['sections'],
              },
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          let formattedText = '';
          for (const section of message['listMessage']['sections']) {
            formattedText += `${section?.title}\n`;
            for (const row of section.rows) {
              formattedText += `${row?.title}\n`;
            }
          }
          message = { conversation: `${message['listMessage']['title']}\n` + formattedText };
          return await this.post(content, 'messages');
        }
        if (message['template']) {
          content = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: number.replace(/\D/g, ''),
            type: 'template',
            template: {
              name: message['template']['name'],
              language: {
                code: message['template']['language'] || 'en_US',
              },
              components: message['template']['components'],
            },
          };
          quoted ? (content.context = { message_id: quoted.id }) : content;
          message = { conversation: `▶️${message['template']['name']}◀️` };
          return await this.post(content, 'messages');
        }
      })();

      if (messageSent?.error_data) {
        this.logger.error(messageSent);
        return messageSent;
      }

      const messageRaw: any = {
        key: { fromMe: true, id: messageSent?.messages[0]?.id, remoteJid: this.createJid(number) },
        message: this.convertMessageToRaw(message, content),
        messageType: this.renderMessageType(content.type),
        messageTimestamp: (messageSent?.messages[0]?.timestamp as number) || Math.round(new Date().getTime() / 1000),
        instanceId: this.instanceId,
        webhookUrl,
        status: status[1],
        source: 'unknown',
      };

      this.logger.log(messageRaw);

      this.sendDataWebhook(Events.SEND_MESSAGE, messageRaw);

      if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled && !isIntegration) {
        this.chatwootService.eventWhatsapp(
          Events.SEND_MESSAGE,
          { instanceName: this.instance.name, instanceId: this.instanceId },
          messageRaw,
        );
      }

      if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled && isIntegration)
        await chatbotController.emit({
          instance: { instanceName: this.instance.name, instanceId: this.instanceId },
          remoteJid: messageRaw.key.remoteJid,
          msg: messageRaw,
          pushName: messageRaw.pushName,
        });

      await this.prismaRepository.message.create({
        data: messageRaw,
      });

      return messageRaw;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }

  // Send Message Controller
  public async textMessage(data: SendTextDto, isIntegration = false) {
    const res = await this.sendMessageWithTyping(
      data.number,
      {
        conversation: data.text,
      },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
      },
      isIntegration,
    );
    return res;
  }

  private async getIdMedia(mediaMessage: any) {
    const formData = new FormData();

    const fileStream = createReadStream(mediaMessage.media);

    formData.append('file', fileStream, { filename: 'media', contentType: mediaMessage.mimetype });
    formData.append('typeFile', mediaMessage.mimetype);
    formData.append('messaging_product', 'whatsapp');

    // const fileBuffer = await fs.readFile(mediaMessage.media);

    // const fileBlob = new Blob([fileBuffer], { type: mediaMessage.mimetype });
    // formData.append('file', fileBlob);
    // formData.append('typeFile', mediaMessage.mimetype);
    // formData.append('messaging_product', 'whatsapp');

    const headers = { Authorization: `Bearer ${this.token}` };
    const res = await axios.post(
      process.env.API_URL + '/' + process.env.VERSION + '/' + this.number + '/media',
      formData,
      { headers },
    );
    return res.data.id;
  }

  protected async prepareMediaMessage(mediaMessage: MediaMessage) {
    try {
      if (mediaMessage.mediatype === 'document' && !mediaMessage.fileName) {
        const regex = new RegExp(/.*\/(.+?)\./);
        const arrayMatch = regex.exec(mediaMessage.media);
        mediaMessage.fileName = arrayMatch[1];
      }

      if (mediaMessage.mediatype === 'image' && !mediaMessage.fileName) {
        mediaMessage.fileName = 'image.png';
      }

      if (mediaMessage.mediatype === 'video' && !mediaMessage.fileName) {
        mediaMessage.fileName = 'video.mp4';
      }

      let mimetype: string;

      const prepareMedia: any = {
        caption: mediaMessage?.caption,
        fileName: mediaMessage.fileName,
        mediaType: mediaMessage.mediatype,
        media: mediaMessage.media,
        gifPlayback: false,
      };

      if (isURL(mediaMessage.media)) {
        mimetype = mime.getType(mediaMessage.media);
        prepareMedia.id = mediaMessage.media;
        prepareMedia.type = 'link';
      } else {
        mimetype = mime.getType(mediaMessage.fileName);
        const id = await this.getIdMedia(prepareMedia);
        prepareMedia.id = id;
        prepareMedia.type = 'id';
      }

      prepareMedia.mimetype = mimetype;

      return prepareMedia;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString() || error);
    }
  }

  public async mediaMessage(data: SendMediaDto, file?: any, isIntegration = false) {
    const mediaData: SendMediaDto = { ...data };

    if (file) mediaData.media = file.buffer.toString('base64');

    const message = await this.prepareMediaMessage(mediaData);

    const mediaSent = await this.sendMessageWithTyping(
      data.number,
      { ...message },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
      },
      isIntegration,
    );

    return mediaSent;
  }

  public async processAudio(audio: string, number: string) {
    number = number.replace(/\D/g, '');
    const hash = `${number}-${new Date().getTime()}`;

    let mimetype: string;

    const prepareMedia: any = {
      fileName: `${hash}.mp3`,
      mediaType: 'audio',
      media: audio,
    };

    if (isURL(audio)) {
      mimetype = mime.getType(audio);
      prepareMedia.id = audio;
      prepareMedia.type = 'link';
    } else {
      mimetype = mime.getType(prepareMedia.fileName);
      const id = await this.getIdMedia(prepareMedia);
      prepareMedia.id = id;
      prepareMedia.type = 'id';
    }

    prepareMedia.mimetype = mimetype;

    return prepareMedia;
  }

  public async audioWhatsapp(data: SendAudioDto, file?: any, isIntegration = false) {
    const mediaData: SendAudioDto = { ...data };

    if (file?.buffer) {
      mediaData.audio = file.buffer.toString('base64');
    } 
    else if(isURL(mediaData.audio)){
      mediaData.audio = mediaData.audio
    }
    else {
      console.error('El archivo no tiene buffer o file es undefined');
      throw new Error('File or buffer is undefined');
    }

    const message = await this.processAudio(mediaData.audio, data.number);

    const audioSent = await this.sendMessageWithTyping(
      data.number,
      { ...message },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
      },
      isIntegration,
    );

    return audioSent;
  }

  public async buttonMessage(data: SendButtonsDto) {
    const embeddedMedia: any = {};

    const btnItems = {
      text: data.buttons.map((btn) => btn.displayText),
      ids: data.buttons.map((btn) => btn.id),
    };

    if (!arrayUnique(btnItems.text) || !arrayUnique(btnItems.ids)) {
      throw new BadRequestException('Button texts cannot be repeated', 'Button IDs cannot be repeated.');
    }

    return await this.sendMessageWithTyping(
      data.number,
      {
        text: !embeddedMedia?.mediaKey ? data.title : undefined,
        buttons: data.buttons.map((button) => {
          return {
            type: 'reply',
            reply: {
              title: button.displayText,
              id: button.id,
            },
          };
        }),
        [embeddedMedia?.mediaKey]: embeddedMedia?.message,
      },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
      },
    );
  }

  public async locationMessage(data: SendLocationDto) {
    return await this.sendMessageWithTyping(
      data.number,
      {
        locationMessage: {
          degreesLatitude: data.latitude,
          degreesLongitude: data.longitude,
          name: data?.name,
          address: data?.address,
        },
      },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
      },
    );
  }

  public async listMessage(data: SendListDto) {
    const sectionsItems = {
      title: data.sections.map((list) => list.title),
    };

    if (!arrayUnique(sectionsItems.title)) {
      throw new BadRequestException('Section tiles cannot be repeated');
    }

    const sendData: any = {
      listMessage: {
        title: data.title,
        description: data.description,
        footerText: data?.footerText,
        buttonText: data?.buttonText,
        sections: data.sections.map((section) => {
          return {
            title: section.title,
            rows: section.rows.map((row) => {
              return {
                title: row.title,
                description: row.description.substring(0, 72),
                id: row.rowId,
              };
            }),
          };
        }),
      },
    };

    return await this.sendMessageWithTyping(data.number, sendData, {
      delay: data?.delay,
      presence: 'composing',
      quoted: data?.quoted,
      linkPreview: data?.linkPreview,
      mentionsEveryOne: data?.mentionsEveryOne,
      mentioned: data?.mentioned,
    });
  }

  public async templateMessage(data: SendTemplateDto, isIntegration = false) {
    const res = await this.sendMessageWithTyping(
      data.number,
      {
        template: {
          name: data.name,
          language: data.language,
          components: data.components,
        },
      },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
        webhookUrl: data?.webhookUrl,
      },
      isIntegration,
    );
    return res;
  }

  public async contactMessage(data: SendContactDto) {
    const message: any = {};

    const vcard = (contact: ContactMessage) => {
      let result = 'BEGIN:VCARD\n' + 'VERSION:3.0\n' + `N:${contact.fullName}\n` + `FN:${contact.fullName}\n`;

      if (contact.organization) {
        result += `ORG:${contact.organization};\n`;
      }

      if (contact.email) {
        result += `EMAIL:${contact.email}\n`;
      }

      if (contact.url) {
        result += `URL:${contact.url}\n`;
      }

      if (!contact.wuid) {
        contact.wuid = this.createJid(contact.phoneNumber);
      }

      result += `item1.TEL;waid=${contact.wuid}:${contact.phoneNumber}\n` + 'item1.X-ABLabel:Celular\n' + 'END:VCARD';

      return result;
    };

    if (data.contact.length === 1) {
      message.contact = {
        displayName: data.contact[0].fullName,
        vcard: vcard(data.contact[0]),
      };
    } else {
      message.contactsArrayMessage = {
        displayName: `${data.contact.length} contacts`,
        contacts: data.contact.map((contact) => {
          return {
            displayName: contact.fullName,
            vcard: vcard(contact),
          };
        }),
      };
    }
    return await this.sendMessageWithTyping(
      data.number,
      {
        contacts: data.contact.map((contact) => {
          return {
            name: { formatted_name: contact.fullName, first_name: contact.fullName },
            phones: [{ phone: contact.phoneNumber }],
            urls: [{ url: contact.url }],
            emails: [{ email: contact.email }],
            org: { company: contact.organization },
          };
        }),
        message,
      },
      {
        delay: data?.delay,
        presence: 'composing',
        quoted: data?.quoted,
        linkPreview: data?.linkPreview,
        mentionsEveryOne: data?.mentionsEveryOne,
        mentioned: data?.mentioned,
      },
    );
  }

  public async reactionMessage(data: SendReactionDto) {
    return await this.sendMessageWithTyping(data.key.remoteJid, {
      reactionMessage: {
        key: data.key,
        text: data.reaction,
      },
    });
  }

  public async getBase64FromMediaMessage(data: any) {
    try {
      const msg = data.message;
      const messageType = msg.messageType.includes('Message') ? msg.messageType : msg.messageType + 'Message';
      const mediaMessage = msg.message[messageType];

      return {
        mediaType: msg.messageType,
        fileName: mediaMessage?.fileName,
        caption: mediaMessage?.caption,
        size: {
          fileLength: mediaMessage?.fileLength,
          height: mediaMessage?.fileLength,
          width: mediaMessage?.width,
        },
        mimetype: mediaMessage?.mime_type,
        base64: msg.message.base64,
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }

  public async deleteMessage() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }

  // methods not available on WhatsApp Business API
  public async mediaSticker() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async pollMessage() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async statusMessage() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async reloadConnection() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async whatsappNumber() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async markMessageAsRead() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async archiveChat() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async markChatUnread() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async fetchProfile() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async offerCall() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async sendPresence() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async setPresence() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async fetchPrivacySettings() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updatePrivacySettings() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async fetchBusinessProfile() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateProfileName() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateProfileStatus() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateProfilePicture() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async removeProfilePicture() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async blockUser() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateMessage() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async createGroup() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateGroupPicture() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateGroupSubject() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateGroupDescription() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async findGroup() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async fetchAllGroups() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async inviteCode() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async inviteInfo() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async sendInvite() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async acceptInviteCode() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async revokeInviteCode() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async findParticipants() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateGParticipant() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async updateGSetting() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async toggleEphemeral() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async leaveGroup() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async fetchLabels() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async handleLabel() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async receiveMobileCode() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async fakeCall() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
}
