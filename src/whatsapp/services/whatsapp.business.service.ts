import axios from 'axios';
import { arrayUnique, isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { mkdir } from 'fs';
import fs from 'fs/promises';
import { getMIMEType } from 'node-mime-types';
import { join } from 'path';
import { ProxyAgent } from 'proxy-agent';

import {
  ConfigService,
  Database,
  WABussiness,
} from '../../config/env.config';
import { INSTANCE_DIR } from '../../config/path.config';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../../exceptions';
import { RedisCache } from '../../libs/redis.client';

import {
  ContactMessage,
  MediaMessage,
  Options,
  SendButtonDto,
  SendContactDto,
  SendListDto,
  SendLocationDto,
  SendMediaDto,
  SendReactionDto,
  SendTextDto,
  SendTemplateDto,
} from '../dto/sendMessage.dto';
import { SettingsRaw } from '../models';;
import { ContactRaw } from '../models/contact.model';
import { MessageRaw, MessageUpdateRaw } from '../models/message.model';
import { RepositoryBroker } from '../repository/repository.manager';
import { Events, wa } from '../types/wa.types';
import { WAStartupService } from './whatsapp.service';
import {  NumberBusiness } from '../dto/chat.dto';

const retryCache = {};

export class WABussinessService extends WAStartupService {
  constructor(
    protected readonly configService: ConfigService,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly repository: RepositoryBroker,
    protected readonly cache: RedisCache,
  ) {
    super(configService, eventEmitter, repository, cache);
    this.logger.verbose('WABussinessService initialized');
  }

  public stateConnection = { state: 'open' };

  public async closeClient() {
    this.stateConnection = { state: 'close' };
  }

  protected async defineAuthState(): Promise<any> {
    await super.defineAuthState();
    this.logger.verbose('Store file enabled');
    mkdir(join(INSTANCE_DIR, this.instance.name), { recursive: true }, (err) => { if (err) throw err; });
  }

  public async setWhatsappBusinessProfile(data: NumberBusiness): Promise<any> {
      this.logger.verbose('set profile');
      let content = {
        messaging_product: "whatsapp",
        about: data.about,
        address: data.address,
        description: data.description,
        vertical: data.vertical,
        email: data.email,
        websites: data.websites,
        profile_picture_handle: data.profilehandle
      }
      return await this.post(content, 'whatsapp_business_profile');
  }

  protected async getMessage(key: any, full = false) {
    this.logger.verbose('Getting message with key: ' + JSON.stringify(key));
    try {
      const webMessageInfo = (await this.repository.message.find({
        where: { owner: this.instance.name, key: { id: key.id } },
      })) as unknown as any;
      if (full) {
        this.logger.verbose('Returning full message');
        return webMessageInfo[0];
      }
      if (webMessageInfo[0].message?.pollCreationMessage) {
        this.logger.verbose('Returning poll message');
        const messageSecretBase64 = webMessageInfo[0].message?.messageContextInfo?.messageSecret;

        if (typeof messageSecretBase64 === 'string') {
          const messageSecret = Buffer.from(messageSecretBase64, 'base64');

          const msg = {
            messageContextInfo: {
              messageSecret,
            },
            pollCreationMessage: webMessageInfo[0].message?.pollCreationMessage,
          };

          return msg;
        }
      }

      this.logger.verbose('Returning message');
      return webMessageInfo[0].message;
    } catch (error) {
      return { conversation: '' };
    }
  }

  public async connectToWhatsapp(data: any): Promise<any> {
    await super.connectToWhatsapp();
    if (!data) return
    const content = data.entry[0].changes[0].value;
    try {
      let options;

      if (this.localProxy.enabled) {
        this.logger.info('Proxy enabled: ' + this.localProxy.proxy);

        if (this.localProxy.proxy.includes('proxyscrape')) {
          const response = await axios.get(this.localProxy.proxy);
          const text = response.data;
          const proxyUrls = text.split('\r\n');
          const rand = Math.floor(Math.random() * Math.floor(proxyUrls.length));
          const proxyUrl = 'http://' + proxyUrls[rand];
          options = {
            agent: new ProxyAgent(proxyUrl as any),
          };
        } else {
          options = {
            agent: new ProxyAgent(this.localProxy.proxy as any),
          };
        }
      }

      this.endSession = false;

      this.logger.verbose('Creating socket');


      this.logger.verbose('Socket created');

      this.eventHandler(content);

      this.logger.verbose('Socket event handler initialized');

      this.phoneNumber =
        this.createJid(content.messages ? content.messages[0].from : content.statuses[0]?.recipient_id);

      //     return this.client;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString());
    }
  }

  private async downloadMediaMessage(message: any) {
    try {
      const id = message[message.type].id;
      let urlServer = this.configService.get<WABussiness>('WABUSSINESS').URL;
      let version = this.configService.get<WABussiness>('WABUSSINESS').VERSION;
      urlServer = `${urlServer}/${version}/${id}`;
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.instance.token}` };
      let result = await axios.get(urlServer, { headers });
      result = await axios.get(result.data.url, { headers, responseType: 'arraybuffer' });
      return result.data
    } catch (e) {
      this.logger.error(e);
    }
  }

  protected async messageHandle(received: any, database: Database, settings: SettingsRaw) {
    try {
      let messageRaw: MessageRaw;
      let pushName: any;

      if (received.contacts)
        pushName = received.contacts[0].profile.name

      if (received.messages) {
        const key = {
          id: received.messages[0].id,
          remoteJid: this.phoneNumber, fromMe: received.messages[0].from === received.metadata.phone_number_id
        }
        if (received?.messages[0].document || received?.messages[0].image
          || received?.messages[0].audio || received?.messages[0].video
        ) {
          const buffer = await this.downloadMediaMessage(received?.messages[0]);
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageMediaJson(received),
              base64: buffer ? buffer.toString('base64') : undefined,
            },
            messageType: received.messages[0].type,
            messageTimestamp: received.messages[0].timestamp as number,
            owner: this.instance.name,
            // source: getDevice(received.key.id),
          };
        } else if (received?.messages[0].interactive) {
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageInteractiveJson(received),
            },
            messageType: 'text',
            messageTimestamp: received.messages[0].timestamp as number,
            owner: this.instance.name,
            // source: getDevice(received.key.id),
          };

        } else if (received?.messages[0].contacts) {
          messageRaw = {
            key,
            pushName,
            message: {
              ...this.messageContactsJson(received),
            },
            messageType: 'text',
            messageTimestamp: received.messages[0].timestamp as number,
            owner: this.instance.name,
            // source: getDevice(received.key.id),
          };

        } else {
          messageRaw = {
            key,
            pushName,
            message: this.messageTextJson(received),
            messageType: received.messages[0].type,
            messageTimestamp: received.messages[0].timestamp as number,
            owner: this.instance.name,
            //source: getDevice(received.key.id),
          };
        }


        if (this.localSettings.read_messages && received.key.id !== 'status@broadcast') {
          await this.client.readMessages([received.key]);
        }

        if (this.localSettings.read_status && received.key.id === 'status@broadcast') {
          await this.client.readMessages([received.key]);
        }

        this.logger.log(messageRaw);

        this.logger.verbose('Sending data to webhook in event MESSAGES_UPSERT');
        this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw);

        if (this.localChatwoot.enabled) {
          const chatwootSentMessage = await this.chatwootService.eventWhatsapp(
            Events.MESSAGES_UPSERT,
            { instanceName: this.instance.name },
            messageRaw,
          );

          if (chatwootSentMessage?.id) {
            messageRaw.chatwoot = {
              messageId: chatwootSentMessage.id,
              inboxId: chatwootSentMessage.inbox_id,
              conversationId: chatwootSentMessage.conversation_id,
            };
          }
        }

        const typebotSessionRemoteJid = this.localTypebot.sessions?.find(
          (session) => session.remoteJid === key.remoteJid,
        );

        if ((this.localTypebot.enabled) || typebotSessionRemoteJid) {
          if (!(this.localTypebot.listening_from_me === false && key.fromMe === true)) {
            if (messageRaw.messageType !== 'reactionMessage')
              await this.typebotService.sendTypebot(
                { instanceName: this.instance.name },
                messageRaw.key.remoteJid,
                messageRaw,
              );
          }
        }

        if (this.localChamaai.enabled && messageRaw.key.fromMe === false && received?.message.type === 'notify') {
          await this.chamaaiService.sendChamaai(
            { instanceName: this.instance.name },
            messageRaw.key.remoteJid,
            messageRaw,
          );
        }

        this.logger.verbose('Inserting message in database');
        await this.repository.message.insert([messageRaw], this.instance.name, database.SAVE_DATA.NEW_MESSAGE);

        this.logger.verbose('Verifying contact from message');
        const contact = await this.repository.contact.find({
          where: { owner: this.instance.name, id: key.remoteJid },
        });

        const contactRaw: ContactRaw = {
          id: received.contacts[0].profile.phone,
          pushName,
          //profilePictureUrl: (await this.profilePicture(received.key.remoteJid)).profilePictureUrl,
          owner: this.instance.name,
        };

        if (contactRaw.id === 'status@broadcast') {
          this.logger.verbose('Contact is status@broadcast');
          return;
        }

        if (contact?.length) {
          this.logger.verbose('Contact found in database');
          const contactRaw: ContactRaw = {
            id: received.contacts[0].profile.phone,
            pushName,
            //profilePictureUrl: (await this.profilePicture(received.key.remoteJid)).profilePictureUrl,
            owner: this.instance.name,
          };

          this.logger.verbose('Sending data to webhook in event CONTACTS_UPDATE');
          this.sendDataWebhook(Events.CONTACTS_UPDATE, contactRaw);

          if (this.localChatwoot.enabled) {
            await this.chatwootService.eventWhatsapp(
              Events.CONTACTS_UPDATE,
              { instanceName: this.instance.name },
              contactRaw,
            );
          }

          this.logger.verbose('Updating contact in database');
          await this.repository.contact.update([contactRaw], this.instance.name, database.SAVE_DATA.CONTACTS);
          return;
        }

        this.logger.verbose('Contact not found in database');

        this.logger.verbose('Sending data to webhook in event CONTACTS_UPSERT');
        this.sendDataWebhook(Events.CONTACTS_UPSERT, contactRaw);

        this.logger.verbose('Inserting contact in database');
        this.repository.contact.insert([contactRaw], this.instance.name, database.SAVE_DATA.CONTACTS);
      }
      this.logger.verbose('Event received: messages.update');
      if (received.statuses) {
        for await (const item of received.statuses) {
          const key = {
            id: item.id,
            remoteJid: this.phoneNumber, fromMe: this.phoneNumber === received.metadata.phone_number_id
          }
          if (settings?.groups_ignore && key.remoteJid.includes('@g.us')) {
            this.logger.verbose('group ignored');
            return;
          }
          if (key.remoteJid !== 'status@broadcast' && !key?.remoteJid?.match(/(:\d+)/)) {
            this.logger.verbose('Message update is valid');


            if (item.status === 'read' && !key.fromMe) return;

            if (item.message === null && item.status === undefined) {
              this.logger.verbose('Message deleted');

              this.logger.verbose('Sending data to webhook in event MESSAGE_DELETE');
              this.sendDataWebhook(Events.MESSAGES_DELETE, key);

              const message: MessageUpdateRaw = {
                ...key,
                status: 'DELETED',
                datetime: Date.now(),
                owner: this.instance.name,
              };

              this.logger.verbose(message);

              this.logger.verbose('Inserting message in database');
              await this.repository.messageUpdate.insert(
                [message],
                this.instance.name,
                database.SAVE_DATA.MESSAGE_UPDATE,
              );

              if (this.localChatwoot.enabled) {
                this.chatwootService.eventWhatsapp(
                  Events.MESSAGES_DELETE,
                  { instanceName: this.instance.name },
                  { key: key },
                );
              }

              return;
            }

            const message: MessageUpdateRaw = {
              ...key,
              status: item.status.toUpperCase(),
              datetime: Date.now(),
              owner: this.instance.name,
            };

            this.logger.verbose(message);

            this.logger.verbose('Sending data to webhook in event MESSAGES_UPDATE');
            this.sendDataWebhook(Events.MESSAGES_UPDATE, message);

            this.logger.verbose('Inserting message in database');
            this.repository.messageUpdate.insert([message], this.instance.name, database.SAVE_DATA.MESSAGE_UPDATE);
          }
        }
      }
    } catch (error) {
      this.logger.error(error);
    }
  };

  protected async eventHandler(content: any) {
    this.logger.verbose('Initializing event handler');
    const database = this.configService.get<Database>('DATABASE');
    const settings = await this.findSettings();

    this.logger.verbose('Listening event: messages.statuses');
    this.messageHandle(content, database, settings);
  }

  protected createJid(number: string): string {
    this.logger.verbose('Creating jid with number: ' + number);

    if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
      this.logger.verbose('Number already contains @g.us or @s.whatsapp.net or @lid');
      return number;
    }

    if (number.includes('@broadcast')) {
      this.logger.verbose('Number already contains @broadcast');
      return number;
    }

    number = number
      ?.replace(/\s/g, '')
      .replace(/\+/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .split(':')[0]
      .split('@')[0];

    if (number.includes('-') && number.length >= 24) {
      this.logger.verbose('Jid created is group: ' + `${number}@g.us`);
      number = number.replace(/[^\d-]/g, '');
      return `${number}@g.us`;
    }

    number = number.replace(/\D/g, '');

    if (number.length >= 18) {
      this.logger.verbose('Jid created is group: ' + `${number}@g.us`);
      number = number.replace(/[^\d-]/g, '');
      return `${number}@g.us`;
    }

    this.logger.verbose('Jid created is whatsapp: ' + `${number}@s.whatsapp.net`);
    return `${number}@s.whatsapp.net`;
  }

  protected async sendMessageWithTyping(
    number: string,
    message: any,
    options?: Options,
    isChatwoot = false,
  ) {
    this.logger.verbose('Sending message with typing');
    try {
      let quoted: any;
      const linkPreview = options?.linkPreview != false ? undefined : false;
      if (options?.quoted) {

        const m = options?.quoted;

        const msg = m?.key;

        if (!msg) {
          throw 'Message not found';
        }

        quoted = msg;
        this.logger.verbose('Quoted message');
      }

      let content: any;
      const messageSent = await (async () => {
        if (message['reactionMessage']) {
          this.logger.verbose('Sending reaction');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            type: "reaction",
            to: number.replace(/\D/g, ""),
            reaction: {
              message_id: message['reactionMessage']['key']['id'],
              emoji: message['reactionMessage']['text']
            },
            context: { message_id: quoted.id }
          }
          quoted ? content.context = { message_id: quoted.id } : content
          return await this.post(content, 'messages');
        }
        if (message['locationMessage']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            type: "location",
            to: number.replace(/\D/g, ""),
            location: {
              longitude: message['locationMessage']['degreesLongitude'],
              latitude: message['locationMessage']['degreesLatitude'],
              name: message['locationMessage']['name'],
              address: message['locationMessage']['address']
            }
          }
          quoted ? content.context = { message_id: quoted.id } : content
          return await this.post(content, 'messages');
        }
        if (message['contacts']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            type: "contacts",
            to: number.replace(/\D/g, ""),
            contacts: message['contacts']
          }
          quoted ? content.context = { message_id: quoted.id } : content
          message = message['message']
          return await this.post(content, 'messages');
        }
        if (message['conversation']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            type: "text",
            to: number.replace(/\D/g, ""),
            text: {
              body: message['conversation'],
              preview_url: linkPreview,
            }
          }
          quoted ? content.context = { message_id: quoted.id } : content
          return await this.post(content, 'messages');
        }
        if (message['media']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            type: message['mediaType'],
            to: number.replace(/\D/g, ""),
            [message['mediaType']]: {
              [message['type']]: message['id'],
              preview_url: linkPreview,
            }
          }
          quoted ? content.context = { message_id: quoted.id } : content;
          return await this.post(content, 'messages');
        }
        if (message['buttons']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: number.replace(/\D/g, ""),
            type: 'interactive',
            interactive: {
              type: "button",
              body: {
                text: message['text'] || 'Select',
              },
              action: {
                buttons: message['buttons'],
              },
            }
          }
          quoted ? content.context = { message_id: quoted.id } : content;
          let formattedText = '';
          for (const item of message['buttons']) {
            formattedText += `▶️ ${item.reply?.title}\n`;
          }
          message = { conversation: `${message['text'] || 'Select'}\n` + formattedText }
          return await this.post(content, 'messages');
        }
        if (message['sections']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: number.replace(/\D/g, ""),
            type: 'interactive',
            interactive: {
              type: "list",
              header: {
                type: "text",
                text: message['title']
              },
              body: {
                text: message['text'],
              },
              footer: {
                text: message['footerText'],
              },
              action: {
                button: message['buttonText'],
                sections: message['sections'],
              },
            }
          }
          quoted ? content.context = { message_id: quoted.id } : content;
          let formattedText = '';
          for (const section of message['sections']) {
            formattedText += `${section?.title}\n`;
            for (const row of section.rows) {
              formattedText += `${row?.title}\n`;
            }
          }
          message = { conversation: `${message['title']}\n` + formattedText }
          return await this.post(content, 'messages');
        }
        if (message['template']) {
          this.logger.verbose('Sending message');
          content = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: number.replace(/\D/g, ""),
            type: 'template',
            template: {
              name: message['template']['name'],
              language: {
                code: message['template']['language'] || "en_US"
              }
            }
          }
          quoted ? content.context = { message_id: quoted.id } : content;
          message = {conversation: `▶️${message['template']['name']}◀️`}
          return await this.post(content, 'messages');
        }
      }
      )();

      const messageRaw: MessageRaw = {
        key: { fromMe: true, id: messageSent?.messages[0]?.id, remoteJid: this.createJid(number) },
        //pushName: messageSent.pushName,
        message,
        messageType: content.type,
        messageTimestamp: messageSent?.messages[0]?.timestamp as number || Math.round(new Date().getTime()/1000),
        owner: this.instance.name,
        //ource: getDevice(messageSent.key.id),
      };

      this.logger.log(messageRaw);

      this.logger.verbose('Sending data to webhook in event SEND_MESSAGE');
      this.sendDataWebhook(Events.SEND_MESSAGE, messageRaw);

      if (this.localChatwoot.enabled && !isChatwoot) {
        this.chatwootService.eventWhatsapp(Events.SEND_MESSAGE, { instanceName: this.instance.name }, messageRaw);
      }

      this.logger.verbose('Inserting message in database');
      await this.repository.message.insert(
        [messageRaw],
        this.instance.name,
        this.configService.get<Database>('DATABASE').SAVE_DATA.NEW_MESSAGE,
      );


      return messageRaw;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }


  private async post(message: any, params: string) {
    try{
      let urlServer = this.configService.get<WABussiness>('WABUSSINESS').URL;
      let version = this.configService.get<WABussiness>('WABUSSINESS').VERSION;
      urlServer = `${urlServer}/${version}/${this.instance.number}/${params}`;
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.instance.token}` };
      const result = await axios.post(urlServer, message, { headers });
      return result.data
    }catch(e){
      this.logger.error(e);
      return e.response.data;
    }

  }

  // Send Message Controller
  public async textMessage(data: SendTextDto, isChatwoot = false) {
    this.logger.verbose('Sending text message');
    const res = await this.sendMessageWithTyping(
      data.number,
      {
        conversation: data.textMessage.text,
      },
      data?.options,
      isChatwoot,
    );
    return res;
  }


  private async getIdMedia(mediaMessage: any) {
    const formData = new FormData();
    let res: any;
    const arquivoBuffer = await fs.readFile(mediaMessage.media);
    const arquivoBlob = new Blob([arquivoBuffer], { type: mediaMessage.mimetype })
    formData.append('file', arquivoBlob);
    formData.append('typeFile', mediaMessage.mimetype);
    formData.append('messaging_product', 'whatsapp');
    const headers = { 'Authorization': `Bearer ${this.instance.token}` }
    res = await axios.post(process.env.API_URL + '/' + process.env.VERSION + '/' + this.instance.number + '/media',
      formData, { headers });
    return res.id;
  }

  protected async prepareMediaMessage(mediaMessage: MediaMessage) {
    try {
      this.logger.verbose('Preparing media message');

      const mediaType = mediaMessage.mediatype + 'Message';
      this.logger.verbose('Media type: ' + mediaType);

      if (mediaMessage.mediatype === 'document' && !mediaMessage.fileName) {
        this.logger.verbose('If media type is document and file name is not defined then');
        const regex = new RegExp(/.*\/(.+?)\./);
        const arrayMatch = regex.exec(mediaMessage.media);
        mediaMessage.fileName = arrayMatch[1];
        this.logger.verbose('File name: ' + mediaMessage.fileName);
      }

      if (mediaMessage.mediatype === 'image' && !mediaMessage.fileName) {
        mediaMessage.fileName = 'image.png';
      }

      if (mediaMessage.mediatype === 'video' && !mediaMessage.fileName) {
        mediaMessage.fileName = 'video.mp4';
      }

      let mimetype: string;

      let prepareMedia: any;

      prepareMedia =
      {
        caption: mediaMessage?.caption,
        fileName: mediaMessage.fileName,
        mediaType: mediaMessage.mediatype,
        media: mediaMessage.media,
        gifPlayback: false
      };

      if (mediaMessage.mimetype) {
        mimetype = mediaMessage.mimetype;
      } else {
        if (isURL(mediaMessage.media)) {
          prepareMedia.id = mediaMessage.media
          prepareMedia.type = 'link'
        } else {
          mimetype = getMIMEType(mediaMessage.fileName);
          const id = await this.getIdMedia(prepareMedia)
          prepareMedia.id = id;
          prepareMedia.type = 'id'
        }
      }

      prepareMedia.mimetype = mimetype;

      this.logger.verbose('Generating wa message from content');
      return prepareMedia;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString() || error);
    }
  }



  public async mediaMessage(data: SendMediaDto, isChatwoot = false) {
    this.logger.verbose('Sending media message');
    const message = await this.prepareMediaMessage(data.mediaMessage);

    return await this.sendMessageWithTyping(data.number, { ...message }, data?.options, isChatwoot);
  }

  public async buttonMessage(data: SendButtonDto) {
    this.logger.verbose('Sending button message');
    const embeddedMedia: any = {};
    let mediatype = 'TEXT';

    if (data.buttonMessage?.mediaMessage) {
      mediatype = data.buttonMessage.mediaMessage?.mediatype.toUpperCase() ?? 'TEXT';
      embeddedMedia.mediaKey = mediatype.toLowerCase() + 'Message';
      const generate = await this.prepareMediaMessage(data.buttonMessage.mediaMessage);
      embeddedMedia.message = generate.message[embeddedMedia.mediaKey];
      embeddedMedia.contentText = `*${data.buttonMessage.title}*\n\n${data.buttonMessage.description}`;
    }

    const btnItems = {
      text: data.buttonMessage.buttons.map((btn) => btn.buttonText),
      ids: data.buttonMessage.buttons.map((btn) => btn.buttonId),
    };

    if (!arrayUnique(btnItems.text) || !arrayUnique(btnItems.ids)) {
      throw new BadRequestException('Button texts cannot be repeated', 'Button IDs cannot be repeated.');
    }

    return await this.sendMessageWithTyping(
      data.number,
      {
        text: !embeddedMedia?.mediaKey ? data.buttonMessage.title : undefined,
        buttons: data.buttonMessage.buttons.map((button) => {
          return {
            type: 'reply',
            reply: {
              title: button.buttonText,
              id: button.buttonId,
            }
          };
        }),
        [embeddedMedia?.mediaKey]: embeddedMedia?.message,
      },
      data?.options,
    );
  }

  public async locationMessage(data: SendLocationDto) {
    this.logger.verbose('Sending location message');
    return await this.sendMessageWithTyping(
      data.number,
      {
        locationMessage: {
          degreesLatitude: data.locationMessage.latitude,
          degreesLongitude: data.locationMessage.longitude,
          name: data.locationMessage?.name,
          address: data.locationMessage?.address,
        },
      },
      data?.options,
    );
  }

  public async listMessage(data: SendListDto) {
    this.logger.verbose('Sending list message');
    const sectionsItems = {
      title: data.listMessage.sections.map((list) => list.title)
    };

    if (!arrayUnique(sectionsItems.title)) {
      throw new BadRequestException('Section tiles cannot be repeated');
    }

    return await this.sendMessageWithTyping(
      data.number,
      {
        title: data.listMessage.title,
        text: data.listMessage.description,
        footerText: data.listMessage?.footerText,
        buttonText: data.listMessage?.buttonText,
        sections: data.listMessage.sections.map((section) => {
          return {
            title: section.title,
            rows: section.rows.map((row) => {
              return {
                title: row.title,
                description: row.description,
                id: row.rowId,
              };
            }),
          };
        }),
      },
      data?.options,
    );
  }

  public async templateMessage(data: SendTemplateDto, isChatwoot = false) {
    this.logger.verbose('Sending text message');
    const res = await this.sendMessageWithTyping(
      data.number,
      {
        template: {
          name: data.templateMessage.name,
          language: data.templateMessage.language
        }
      },
      data?.options,
      isChatwoot,
    );
    return res;
  }

  public async contactMessage(data: SendContactDto) {
    this.logger.verbose('Sending contact message');
    let message: any = {};

    const vcard = (contact: ContactMessage) => {
      this.logger.verbose('Creating vcard');
      let result = 'BEGIN:VCARD\n' + 'VERSION:3.0\n' + `N:${contact.fullName}\n` + `FN:${contact.fullName}\n`;

      if (contact.organization) {
        this.logger.verbose('Organization defined');
        result += `ORG:${contact.organization};\n`;
      }

      if (contact.email) {
        this.logger.verbose('Email defined');
        result += `EMAIL:${contact.email}\n`;
      }

      if (contact.url) {
        this.logger.verbose('Url defined');
        result += `URL:${contact.url}\n`;
      }

      if (!contact.wuid) {
        this.logger.verbose('Wuid defined');
        contact.wuid = this.createJid(contact.phoneNumber);
      }

      result += `item1.TEL;waid=${contact.wuid}:${contact.phoneNumber}\n` + 'item1.X-ABLabel:Celular\n' + 'END:VCARD';

      this.logger.verbose('Vcard created');
      return result;
    };

    if (data.contactMessage.length === 1) {
      message.contactMessage = {
        displayName: data.contactMessage[0].fullName,
        vcard: vcard(data.contactMessage[0]),
      };
    } else {
      message.contactsArrayMessage = {
        displayName: `${data.contactMessage.length} contacts`,
        contacts: data.contactMessage.map((contact) => {
          return {
            displayName: contact.fullName,
            vcard: vcard(contact),
          };
        }),
      };
    }
    return await this.sendMessageWithTyping(data.number, {
      contacts: data.contactMessage.map((contact) => {
        return {
          name: { formatted_name: contact.fullName, first_name: contact.fullName },
          phones: [{ phone: contact.phoneNumber }],
          urls: [{ url: contact.url }],
          emails: [{ email: contact.email }],
          org: { company: contact.organization },
        };
      }),
      message
    }, data?.options);
  }

  public async reactionMessage(data: SendReactionDto) {
    this.logger.verbose('Sending reaction message');
    return await this.sendMessageWithTyping(data.reactionMessage.key.remoteJid, {
      reactionMessage: {
        key: data.reactionMessage.key,
        text: data.reactionMessage.reaction,
      },
    });
  }

  public async getBase64FromMediaMessage(data: any) {
    try {
      const msg = data.message;
      this.logger.verbose('Getting base64 from media message');
      const messageType = msg.messageType + 'Message';
      let mediaMessage: any;
      mediaMessage = msg.message[messageType]

      this.logger.verbose('Media message downloaded');
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

  private messageTextJson(received: any) {
    let content: any;
    const message = received.messages[0]
    if (message.from === received.metadata.phone_number_id) {
      content = { extendedTextMessage: { text: message.text.body } }
      message.context ?
        content.extendedTextMessage.contextInfo = { stanzaId: message.context.id } : content
    } else {
      content = { conversation: message.text.body };
      message.context ?
        content.extendedTextMessage = { contextInfo: { stanzaId: message.context.id } } : content
    }
    return content;
  }

  private messageMediaJson(received: any) {
    const message = received.messages[0]
    let content: any = message.type + 'Message';
    content = { [content]: message[message.type] }
    message.context ?
      content.extendedTextMessage = { contextInfo: { stanzaId: message.context.id } } : content
    return content;
  }

  private messageInteractiveJson(received: any) {
    const message = received.messages[0]
    let content: any = { conversation: message.interactive[message.interactive.type].title };
    message.context ?
      content.extendedTextMessage = { contextInfo: { stanzaId: message.context.id } } : content
    return content;
  }

  private messageContactsJson(received: any) {
    const message = received.messages[0];
    let content: any = {};

    const vcard = (contact: any) => {
      this.logger.verbose('Creating vcard');
      let result = 'BEGIN:VCARD\n' + 'VERSION:3.0\n' + `N:${contact.name.formatted_name}\n` + `FN:${contact.name.formatted_name}\n`;

      if (contact.org) {
        this.logger.verbose('Organization defined');
        result += `ORG:${contact.org.company};\n`;
      }

      if (contact.emails) {
        this.logger.verbose('Email defined');
        result += `EMAIL:${contact.emails[0].email}\n`;
      }

      if (contact.urls) {
        this.logger.verbose('Url defined');
        result += `URL:${contact.urls[0].url}\n`;
      }

      if (!contact.phones[0]?.wa_id) {
        this.logger.verbose('Wuid defined');
        contact.phones[0].wa_id = this.createJid(contact.phones[0].phone);
      }

      result += `item1.TEL;waid=${contact.phones[0]?.wa_id}:${contact.phones[0].phone}\n` + 'item1.X-ABLabel:Celular\n' + 'END:VCARD';

      this.logger.verbose('Vcard created');
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
    message.context ?
      content.extendedTextMessage = { contextInfo: { stanzaId: message.context.id } } : content
    return content;
  }


}
