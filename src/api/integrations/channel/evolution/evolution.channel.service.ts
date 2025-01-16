import { MediaMessage, Options, SendAudioDto, SendMediaDto, SendTextDto } from '@api/dto/sendMessage.dto';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { chatbotController } from '@api/server.module';
import { CacheService } from '@api/services/cache.service';
import { ChannelStartupService } from '@api/services/channel.service';
import { Events, wa } from '@api/types/wa.types';
import { Chatwoot, ConfigService, Openai } from '@config/env.config';
import { BadRequestException, InternalServerErrorException } from '@exceptions';
import { status } from '@utils/renderStatus';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import mimeTypes from 'mime-types';
import { v4 } from 'uuid';

export class EvolutionStartupService extends ChannelStartupService {
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

    this.client = null;
  }

  public client: any;

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

  public async connectToWhatsapp(data?: any): Promise<any> {
    if (!data) return;

    try {
      this.loadChatwoot();

      this.eventHandler(data);
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString());
    }
  }

  protected async eventHandler(received: any) {
    try {
      let messageRaw: any;

      if (received.message) {
        const key = {
          id: received.key.id || v4(),
          remoteJid: received.key.remoteJid,
          fromMe: received.key.fromMe,
        };
        messageRaw = {
          key,
          pushName: received.pushName,
          message: received.message,
          messageType: received.messageType,
          messageTimestamp: Math.round(new Date().getTime() / 1000),
          source: 'unknown',
          instanceId: this.instanceId,
        };

        if (this.configService.get<Openai>('OPENAI').ENABLED) {
          const openAiDefaultSettings = await this.prismaRepository.openaiSetting.findFirst({
            where: {
              instanceId: this.instanceId,
            },
            include: {
              OpenaiCreds: true,
            },
          });

          if (
            openAiDefaultSettings &&
            openAiDefaultSettings.openaiCredsId &&
            openAiDefaultSettings.speechToText &&
            received?.message?.audioMessage
          ) {
            messageRaw.message.speechToText = await this.openaiService.speechToText(
              openAiDefaultSettings.OpenaiCreds,
              received,
              this.client.updateMediaMessage,
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

        await this.prismaRepository.message.create({
          data: messageRaw,
        });

        await this.updateContact({
          remoteJid: messageRaw.key.remoteJid,
          pushName: messageRaw.key.fromMe ? '' : messageRaw.key.fromMe == null ? '' : received.pushName,
          profilePicUrl: received.profilePicUrl,
        });
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  private async updateContact(data: { remoteJid: string; pushName?: string; profilePicUrl?: string }) {
    const contact = await this.prismaRepository.contact.findFirst({
      where: { instanceId: this.instanceId, remoteJid: data.remoteJid },
    });

    if (contact) {
      const contactRaw: any = {
        remoteJid: data.remoteJid,
        pushName: data?.pushName,
        instanceId: this.instanceId,
        profilePicUrl: data?.profilePicUrl,
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
        where: { remoteJid: contact.remoteJid, instanceId: this.instanceId },
        data: contactRaw,
      });
      return;
    }

    const contactRaw: any = {
      remoteJid: data.remoteJid,
      pushName: data?.pushName,
      instanceId: this.instanceId,
      profilePicUrl: data?.profilePicUrl,
    };

    this.sendDataWebhook(Events.CONTACTS_UPSERT, contactRaw);

    await this.prismaRepository.contact.create({
      data: contactRaw,
    });

    const chat = await this.prismaRepository.chat.findFirst({
      where: { instanceId: this.instanceId, remoteJid: data.remoteJid },
    });

    if (chat) {
      const chatRaw: any = {
        remoteJid: data.remoteJid,
        instanceId: this.instanceId,
      };

      this.sendDataWebhook(Events.CHATS_UPDATE, chatRaw);

      await this.prismaRepository.chat.updateMany({
        where: { remoteJid: chat.remoteJid },
        data: chatRaw,
      });
    }

    const chatRaw: any = {
      remoteJid: data.remoteJid,
      instanceId: this.instanceId,
    };

    this.sendDataWebhook(Events.CHATS_UPSERT, chatRaw);

    await this.prismaRepository.chat.create({
      data: chatRaw,
    });
  }

  protected async sendMessageWithTyping(number: string, message: any, options?: Options, isIntegration = false) {
    try {
      let quoted: any;
      let webhookUrl: any;

      if (options?.quoted) {
        const m = options?.quoted;

        const msg = m?.key;

        if (!msg) {
          throw 'Message not found';
        }

        quoted = msg;
      }

      if (options.delay) {
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }

      if (options?.webhookUrl) {
        webhookUrl = options.webhookUrl;
      }

      const messageId = v4();

      let messageRaw: any = {
        key: { fromMe: true, id: messageId, remoteJid: number },
        messageTimestamp: Math.round(new Date().getTime() / 1000),
        webhookUrl,
        source: 'unknown',
        instanceId: this.instanceId,
        status: status[1],
      };

      if (message?.mediaType === 'image') {
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'imageMessage',
        };
      } else if (message?.mediaType === 'video') {
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'videoMessage',
        };
      } else if (message?.mediaType === 'audio') {
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'audioMessage',
        };
      } else if (message?.mediaType === 'document') {
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'documentMessage',
        };
      } else {
        messageRaw = {
          ...messageRaw,
          message: {
            ...message,
            quoted,
          },
          messageType: 'conversation',
        };
      }

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

      let mimetype: string | false;

      const prepareMedia: any = {
        caption: mediaMessage?.caption,
        fileName: mediaMessage.fileName,
        mediaType: mediaMessage.mediatype,
        media: mediaMessage.media,
        gifPlayback: false,
      };

      if (isURL(mediaMessage.media)) {
        mimetype = mimeTypes.lookup(mediaMessage.media);
      } else {
        mimetype = mimeTypes.lookup(mediaMessage.fileName);
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

    let mimetype: string | false;

    const prepareMedia: any = {
      fileName: `${hash}.mp4`,
      mediaType: 'audio',
      media: audio,
    };

    if (isURL(audio)) {
      mimetype = mimeTypes.lookup(audio);
    } else {
      mimetype = mimeTypes.lookup(prepareMedia.fileName);
    }

    prepareMedia.mimetype = mimetype;

    return prepareMedia;
  }

  public async audioWhatsapp(data: SendAudioDto, file?: any, isIntegration = false) {
    const mediaData: SendAudioDto = { ...data };

    if (file?.buffer) {
      mediaData.audio = file.buffer.toString('base64');
    } else {
      console.error('El archivo o buffer no est� definido correctamente.');
      throw new Error('File or buffer is undefined.');
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

  public async buttonMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async locationMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async listMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async templateMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async contactMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async reactionMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async getBase64FromMediaMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async deleteMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async mediaSticker() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async pollMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async statusMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async reloadConnection() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async whatsappNumber() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async markMessageAsRead() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async archiveChat() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async markChatUnread() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchProfile() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async offerCall() {
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async sendPresence() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async setPresence() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchPrivacySettings() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updatePrivacySettings() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchBusinessProfile() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateProfileName() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateProfileStatus() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateProfilePicture() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async removeProfilePicture() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async blockUser() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateMessage() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async createGroup() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGroupPicture() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGroupSubject() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGroupDescription() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async findGroup() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchAllGroups() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async inviteCode() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async inviteInfo() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async sendInvite() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async acceptInviteCode() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async revokeInviteCode() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async findParticipants() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGParticipant() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGSetting() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async toggleEphemeral() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async leaveGroup() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchLabels() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async handleLabel() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async receiveMobileCode() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fakeCall() {
    throw new BadRequestException('Method not available on Evolution Channel');
  }
}
