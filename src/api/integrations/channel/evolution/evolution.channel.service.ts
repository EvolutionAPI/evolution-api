import { Options, SendAudioDto, SendMediaDto, SendTextDto } from '@api/dto/sendMessage.dto';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { chatbotController } from '@api/server.module';
import { CacheService } from '@api/services/cache.service';
import { ChannelStartupService } from '@api/services/channel.service';
import { Events, wa } from '@api/types/wa.types';
import { Chatwoot, ConfigService, Openai } from '@config/env.config';
import { BadRequestException, InternalServerErrorException } from '@exceptions';
import EventEmitter2 from 'eventemitter2';

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
          id: received.key.id,
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

        const contact = await this.prismaRepository.contact.findFirst({
          where: { instanceId: this.instanceId, remoteJid: key.remoteJid },
        });

        const contactRaw: any = {
          remoteJid: messageRaw.key.remoteJid,
          pushName: received.pushName,
          instanceId: this.instanceId,
        };

        if (contactRaw.remoteJid === 'status@broadcast') {
          return;
        }

        if (contact) {
          const contactRaw: any = {
            remoteJid: messageRaw.key.remoteJid,
            pushName: received.pushName,
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
    } catch (error) {
      this.logger.error(error);
    }
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

      if (options?.webhookUrl) {
        webhookUrl = options.webhookUrl;
      }

      const messageRaw: any = {
        key: { fromMe: true, id: 'ID', remoteJid: this.createJid(number) },
        message: {
          ...message,
          quoted,
        },
        messageType: 'conversation',
        messageTimestamp: Math.round(new Date().getTime() / 1000),
        webhookUrl,
        source: 'unknown',
        instanceId: this.instanceId,
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

  public async mediaMessage(data: SendMediaDto, isIntegration = false) {
    const message = data;

    return await this.sendMessageWithTyping(
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
  }

  public async audioWhatsapp(data: SendAudioDto, isIntegration = false) {
    const message = data;

    return await this.sendMessageWithTyping(
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
