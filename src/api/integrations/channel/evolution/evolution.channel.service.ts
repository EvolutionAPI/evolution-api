import {
  MediaMessage,
  Options,
  SendAudioDto,
  SendMediaDto,
  SendTextDto,
} from '@api/dto/sendMessage.dto';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { chatbotController } from '@api/server.module';
import { CacheService } from '@api/services/cache.service';
import { ChannelStartupService } from '@api/services/channel.service';
import { Events, wa } from '@api/types/wa.types';
import { Chatwoot, ConfigService, Openai } from '@config/env.config';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@exceptions';
import { status } from '@utils/renderStatus';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import mime from 'mime';
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
    this.logger.log('[connectionStatus] Retornando estado da conexão');
    return this.stateConnection;
  }

  public async closeClient() {
    this.logger.log('[closeClient] Encerrando cliente...');
    try {
      this.stateConnection = { state: 'close' };
      this.logger.debug('[closeClient] stateConnection atualizado para "close"');
    } catch (error) {
      this.logger.error(
        `[closeClient] Erro ao tentar fechar o cliente: ${error?.toString()}`,
      );
      throw new InternalServerErrorException(error?.toString());
    }
  }

  public get qrCode(): wa.QrCode {
    this.logger.log('[qrCode] Obtendo informações do QR Code...');
    return {
      pairingCode: this.instance.qrcode?.pairingCode,
      code: this.instance.qrcode?.code,
      base64: this.instance.qrcode?.base64,
      count: this.instance.qrcode?.count,
    };
  }

  public async logoutInstance() {
    this.logger.log('[logoutInstance] Realizando logout da instância...');
    await this.closeClient();
  }

  public async profilePicture(number: string) {
    this.logger.log(
      `[profilePicture] Obtendo foto de perfil para o número: ${number}`,
    );
    const jid = this.createJid(number);

    return {
      wuid: jid,
      profilePictureUrl: null,
    };
  }

  public async getProfileName() {
    this.logger.log('[getProfileName] Método não implementado...');
    return null;
  }

  public async profilePictureUrl() {
    this.logger.log('[profilePictureUrl] Método não implementado...');
    return null;
  }

  public async getProfileStatus() {
    this.logger.log('[getProfileStatus] Método não implementado...');
    return null;
  }

  public async connectToWhatsapp(data?: any): Promise<any> {
    this.logger.log('[connectToWhatsapp] Iniciando conexão com o Whatsapp...');
    if (!data) {
      this.logger.warn('[connectToWhatsapp] Nenhum dado recebido. Encerrando...');
      return;
    }

    try {
      this.logger.debug('[connectToWhatsapp] Carregando Chatwoot...');
      this.loadChatwoot();

      this.logger.debug('[connectToWhatsapp] Chamando eventHandler...');
      this.eventHandler(data);
    } catch (error) {
      this.logger.error(
        `[connectToWhatsapp] Erro ao conectar ao Whatsapp: ${error?.toString()}`,
      );
      throw new InternalServerErrorException(error?.toString());
    }
  }

  protected async eventHandler(received: any) {
    this.logger.log('[eventHandler] Iniciando tratamento de evento...');
    try {
      let messageRaw: any;

      if (received.message) {
        this.logger.debug(
          `[eventHandler] Mensagem recebida: ${JSON.stringify(received)}`,
        );
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

        this.logger.debug(
          `[eventHandler] Montando objeto messageRaw: ${JSON.stringify(
            messageRaw,
          )}`,
        );

        // Verifica OpenAI
        if (this.configService.get<Openai>('OPENAI').ENABLED) {
          this.logger.debug(
            '[eventHandler] Verificando configurações do OpenAI...',
          );
          const openAiDefaultSettings =
            await this.prismaRepository.openaiSetting.findFirst({
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
            this.logger.debug(
              '[eventHandler] Realizando speech-to-text no áudio...',
            );
            messageRaw.message.speechToText = await this.openaiService.speechToText(
              openAiDefaultSettings.OpenaiCreds,
              received,
              this.client.updateMediaMessage,
            );
          }
        }

        this.logger.log(`[eventHandler] messageRaw final: ${JSON.stringify(messageRaw)}`);

        this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw);

        this.logger.debug('[eventHandler] Emitindo chatbotController...');
        await chatbotController.emit({
          instance: {
            instanceName: this.instance.name,
            instanceId: this.instanceId,
          },
          remoteJid: messageRaw.key.remoteJid,
          msg: messageRaw,
          pushName: messageRaw.pushName,
        });

        if (
          this.configService.get<Chatwoot>('CHATWOOT').ENABLED &&
          this.localChatwoot?.enabled
        ) {
          this.logger.debug('[eventHandler] Enviando evento para Chatwoot...');
          const chatwootSentMessage = await this.chatwootService.eventWhatsapp(
            Events.MESSAGES_UPSERT,
            {
              instanceName: this.instance.name,
              instanceId: this.instanceId,
            },
            messageRaw,
          );

          if (chatwootSentMessage?.id) {
            this.logger.debug(
              `[eventHandler] chatwootSentMessage criado com ID: ${chatwootSentMessage.id}`,
            );
            messageRaw.chatwootMessageId = chatwootSentMessage.id;
            messageRaw.chatwootInboxId = chatwootSentMessage.id;
            messageRaw.chatwootConversationId = chatwootSentMessage.id;
          }
        }

        this.logger.debug('[eventHandler] Salvando mensagem no Prisma...');
        await this.prismaRepository.message.create({
          data: messageRaw,
        });

        this.logger.debug('[eventHandler] Atualizando contato...');
        await this.updateContact({
          remoteJid: messageRaw.key.remoteJid,
          pushName: messageRaw.key.fromMe
            ? ''
            : messageRaw.key.fromMe == null
            ? ''
            : received.pushName,
          profilePicUrl: received.profilePicUrl,
        });
      }
    } catch (error) {
      this.logger.error(`[eventHandler] Erro: ${error}`);
    }
  }

  private async updateContact(data: {
    remoteJid: string;
    pushName?: string;
    profilePicUrl?: string;
  }) {
    this.logger.log(
      `[updateContact] Atualizando ou criando contato para: ${data.remoteJid}`,
    );
    try {
      const contact = await this.prismaRepository.contact.findFirst({
        where: { instanceId: this.instanceId, remoteJid: data.remoteJid },
      });

      if (contact) {
        this.logger.debug(
          `[updateContact] Contato já existe. Atualizando...: ${contact.remoteJid}`,
        );
        const contactRaw: any = {
          remoteJid: data.remoteJid,
          pushName: data?.pushName,
          instanceId: this.instanceId,
          profilePicUrl: data?.profilePicUrl,
        };

        this.sendDataWebhook(Events.CONTACTS_UPDATE, contactRaw);

        if (
          this.configService.get<Chatwoot>('CHATWOOT').ENABLED &&
          this.localChatwoot?.enabled
        ) {
          this.logger.debug('[updateContact] Atualizando contato no Chatwoot...');
          await this.chatwootService.eventWhatsapp(
            Events.CONTACTS_UPDATE,
            { instanceName: this.instance.name, instanceId: this.instanceId },
            contactRaw,
          );
        }

        this.logger.debug('[updateContact] Atualizando contato no Prisma...');
        await this.prismaRepository.contact.updateMany({
          where: { remoteJid: contact.remoteJid, instanceId: this.instanceId },
          data: contactRaw,
        });
        return;
      }

      this.logger.debug('[updateContact] Contato não encontrado. Criando novo...');
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
        this.logger.debug(
          `[updateContact] Chat já existe para este contato. Atualizando...: ${chat.remoteJid}`,
        );
        const chatRaw: any = {
          remoteJid: data.remoteJid,
          instanceId: this.instanceId,
        };

        this.sendDataWebhook(Events.CHATS_UPDATE, chatRaw);

        await this.prismaRepository.chat.updateMany({
          where: { remoteJid: chat.remoteJid },
          data: chatRaw,
        });
      } else {
        this.logger.debug(
          '[updateContact] Nenhum chat encontrado para este contato. Criando novo...',
        );
        const chatRaw: any = {
          remoteJid: data.remoteJid,
          instanceId: this.instanceId,
        };

        this.sendDataWebhook(Events.CHATS_UPSERT, chatRaw);

        await this.prismaRepository.chat.create({
          data: chatRaw,
        });
      }
    } catch (error) {
      this.logger.error(`[updateContact] Erro ao atualizar/criar contato: ${error}`);
    }
  }

  protected async sendMessageWithTyping(
    number: string,
    message: any,
    options?: Options,
    isIntegration = false,
  ) {
    this.logger.log(`[sendMessageWithTyping] Enviando mensagem para: ${number}`);
    this.logger.debug(
      `[sendMessageWithTyping] Mensagem: ${JSON.stringify(message)}, Options: ${JSON.stringify(
        options,
      )}, isIntegration: ${isIntegration}`,
    );
    try {
      let quoted: any;
      let webhookUrl: any;

      if (options?.quoted) {
        this.logger.debug('[sendMessageWithTyping] Opção quoted detectada...');
        const m = options?.quoted;
        const msg = m?.key;

        if (!msg) {
          this.logger.error('[sendMessageWithTyping] Mensagem de citação não encontrada!');
          throw 'Message not found';
        }

        quoted = msg;
      }

      if (options?.delay) {
        this.logger.debug(`[sendMessageWithTyping] Aguardando delay de ${options.delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }

      if (options?.webhookUrl) {
        this.logger.debug(
          `[sendMessageWithTyping] Usando webhookUrl customizado: ${options.webhookUrl}`,
        );
        webhookUrl = options.webhookUrl;
      }

      const messageId = v4();
      this.logger.debug(
        `[sendMessageWithTyping] Gerando UUID para mensagem: ${messageId}`,
      );

      // debug message
      this.logger.debug(
        `[sendMessageWithTyping] Mensagem a ser enviada: ${JSON.stringify(message)}`,
      );
      let messageRaw: any = {
        key: { fromMe: true, id: messageId, remoteJid: number, channel: message.channel, inbox_id: message.inbox_id },
        messageTimestamp: Math.round(new Date().getTime() / 1000),
        webhookUrl,
        source: 'unknown',
        instanceId: this.instanceId,
        status: status[1],
      };
      // debug messageRaw
      this.logger.debug(`[sendMessageWithTyping] messageRaw a ser enviada: ${JSON.stringify(messageRaw)}`);

      // Verifica o tipo de mídia para compor a mensagem
      if (message?.mediaType === 'image') {
        this.logger.debug('[sendMessageWithTyping] Montando mensagem de imagem...');
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'imageMessage',
        };
      } else if (message?.mediaType === 'video') {
        this.logger.debug('[sendMessageWithTyping] Montando mensagem de vídeo...');
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'videoMessage',
        };
      } else if (message?.mediaType === 'audio') {
        this.logger.debug('[sendMessageWithTyping] Montando mensagem de áudio...');
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'audioMessage',
        };
      } else if (message?.mediaType === 'document') {
        this.logger.debug('[sendMessageWithTyping] Montando mensagem de documento...');
        messageRaw = {
          ...messageRaw,
          message: {
            mediaUrl: message.media,
            quoted,
          },
          messageType: 'documentMessage',
        };
      } else {
        this.logger.debug('[sendMessageWithTyping] Montando mensagem de texto...');
        messageRaw = {
          ...messageRaw,
          message: {
            ...message,
            quoted,
          },
          messageType: 'conversation',
        };
      }

      this.logger.log(
        `[sendMessageWithTyping] messageRaw final: ${JSON.stringify(messageRaw)}`,
      );

      this.sendDataWebhook(Events.SEND_MESSAGE, messageRaw);
      
      // debug a proxima funcao
      this.logger.debug(`[sendMessageWithTyping] CHATWOOT: ${this.configService.get<Chatwoot>('CHATWOOT').ENABLED}, LOCAL: ${this.localChatwoot?.enabled}, INTEGRATION: ${isIntegration}`);

      if (
        this.configService.get<Chatwoot>('CHATWOOT').ENABLED &&
        this.localChatwoot?.enabled &&
        !isIntegration
      ) {
        this.logger.debug('[sendMessageWithTyping] Enviando evento SEND_MESSAGE ao Chatwoot...');
        this.chatwootService.eventWhatsapp(
          Events.SEND_MESSAGE,
          { instanceName: this.instance.name, instanceId: this.instanceId },
          messageRaw,
        );
      }

      if (
        this.configService.get<Chatwoot>('CHATWOOT').ENABLED &&
        this.localChatwoot?.enabled &&
        isIntegration
      ) {
        this.logger.debug(
          '[sendMessageWithTyping] Emitindo mensagem para chatbotController em modo de integração...',
        );
        await chatbotController.emit({
          instance: { instanceName: this.instance.name, instanceId: this.instanceId },
          remoteJid: messageRaw.key.remoteJid,
          msg: messageRaw,
          pushName: messageRaw.pushName,
        });
      }

      this.logger.debug('[sendMessageWithTyping] Salvando mensagem no Prisma...');
      await this.prismaRepository.message.create({
        data: messageRaw,
      });

      return messageRaw;
    } catch (error) {
      this.logger.error(
        `[sendMessageWithTyping] Erro ao enviar mensagem para ${number}: ${error}`,
      );
      throw new BadRequestException(error.toString());
    }
  }

  public async textMessage(data2: SendTextDto, isIntegration = false) {
    this.logger.log('[textMessage] Enviando mensagem de texto...');
    this.logger.debug(`[textMessage] Dados recebidos: ${JSON.stringify(data2)}`);

    const res = await this.sendMessageWithTyping(
      data2.number, 
      {
        conversation: data2.text,
        channel: data2.channel,     // passa channel aqui
        inbox_id: data2.inbox_id,   // e inbox_id aqui
      },
      {
        delay: data2?.delay,
        presence: 'composing',
        quoted: data2?.quoted,
        linkPreview: data2?.linkPreview,
        mentionsEveryOne: data2?.mentionsEveryOne,
        mentioned: data2?.mentioned,
      },
      isIntegration,
    );
    return res;
  }

  protected async prepareMediaMessage(mediaMessage: MediaMessage) {
    this.logger.log('[prepareMediaMessage] Preparando mensagem de mídia...');
    this.logger.debug(
      `[prepareMediaMessage] Dados recebidos: ${JSON.stringify(mediaMessage)}`,
    );
    try {
      if (mediaMessage.mediatype === 'document' && !mediaMessage.fileName) {
        this.logger.debug(
          '[prepareMediaMessage] Definindo filename para documento...',
        );
        const regex = new RegExp(/.*\/(.+?)\./);
        const arrayMatch = regex.exec(mediaMessage.media);
        mediaMessage.fileName = arrayMatch[1];
      }

      if (mediaMessage.mediatype === 'image' && !mediaMessage.fileName) {
        this.logger.debug(
          '[prepareMediaMessage] Definindo filename padrão para imagem...',
        );
        mediaMessage.fileName = 'image.png';
      }

      if (mediaMessage.mediatype === 'video' && !mediaMessage.fileName) {
        this.logger.debug(
          '[prepareMediaMessage] Definindo filename padrão para vídeo...',
        );
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

      this.logger.debug('[prepareMediaMessage] Verificando mimetype...');
      if (isURL(mediaMessage.media)) {
        mimetype = mime.getType(mediaMessage.media);
      } else {
        mimetype = mime.getType(mediaMessage.fileName);
      }

      prepareMedia.mimetype = mimetype;

      this.logger.debug(
        `[prepareMediaMessage] Retornando objeto de mídia preparado: ${JSON.stringify(
          prepareMedia,
        )}`,
      );
      return prepareMedia;
    } catch (error) {
      this.logger.error(
        `[prepareMediaMessage] Erro ao preparar mensagem de mídia: ${error}`,
      );
      throw new InternalServerErrorException(error?.toString() || error);
    }
  }

  public async mediaMessage(data: SendMediaDto, file?: any, isIntegration = false) {
    this.logger.log('[mediaMessage] Enviando mensagem de mídia...');
    this.logger.debug(`[mediaMessage] Dados recebidos: ${JSON.stringify(data)}`);
    try {
      const mediaData: SendMediaDto = { ...data };

      if (file) {
        this.logger.debug(
          '[mediaMessage] Convertendo arquivo em base64 para envio...',
        );
        mediaData.media = file.buffer.toString('base64');
      }

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
    } catch (error) {
      this.logger.error(
        `[mediaMessage] Erro ao enviar mensagem de mídia: ${error}`,
      );
      throw new InternalServerErrorException(error?.toString());
    }
  }

  public async processAudio(audio: string, number: string) {
    this.logger.log('[processAudio] Processando áudio...');
    this.logger.debug(`[processAudio] Áudio: ${audio}, Número: ${number}`);
    try {
      number = number.replace(/\D/g, '');
      this.logger.debug(`[processAudio] Número formatado: ${number}`);

      const hash = `${number}-${new Date().getTime()}`;
      let mimetype: string;

      const prepareMedia: any = {
        fileName: `${hash}.mp4`,
        mediaType: 'audio',
        media: audio,
      };

      if (isURL(audio)) {
        mimetype = mime.getType(audio);
      } else {
        mimetype = mime.getType(prepareMedia.fileName);
      }

      prepareMedia.mimetype = mimetype;
      this.logger.debug(
        `[processAudio] Retornando objeto de mídia de áudio: ${JSON.stringify(
          prepareMedia,
        )}`,
      );

      return prepareMedia;
    } catch (error) {
      this.logger.error(
        `[processAudio] Erro ao processar áudio: ${error.toString()}`,
      );
      throw new InternalServerErrorException(error?.toString());
    }
  }

  public async audioWhatsapp(data: SendAudioDto, file?: any, isIntegration = false) {
    this.logger.log('[audioWhatsapp] Enviando áudio via Whatsapp...');
    this.logger.debug(`[audioWhatsapp] Dados recebidos: ${JSON.stringify(data)}`);
    try {
      const mediaData: SendAudioDto = { ...data };

      if (file?.buffer) {
        this.logger.debug('[audioWhatsapp] Convertendo buffer em base64...');
        mediaData.audio = file.buffer.toString('base64');
      } else {
        this.logger.error(
          '[audioWhatsapp] O arquivo ou buffer não está definido corretamente.',
        );
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
    } catch (error) {
      this.logger.error(`[audioWhatsapp] Erro ao enviar áudio: ${error}`);
      throw new InternalServerErrorException(error?.toString());
    }
  }

  public async buttonMessage() {
    this.logger.warn('[buttonMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async locationMessage() {
    this.logger.warn('[locationMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async listMessage() {
    this.logger.warn('[listMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async templateMessage() {
    this.logger.warn('[templateMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async contactMessage() {
    this.logger.warn('[contactMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async reactionMessage() {
    this.logger.warn('[reactionMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async getBase64FromMediaMessage() {
    this.logger.warn('[getBase64FromMediaMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async deleteMessage() {
    this.logger.warn('[deleteMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async mediaSticker() {
    this.logger.warn('[mediaSticker] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async pollMessage() {
    this.logger.warn('[pollMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async statusMessage() {
    this.logger.warn('[statusMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async reloadConnection() {
    this.logger.warn('[reloadConnection] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async whatsappNumber() {
    this.logger.warn('[whatsappNumber] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async markMessageAsRead() {
    this.logger.warn('[markMessageAsRead] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async archiveChat() {
    this.logger.warn('[archiveChat] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async markChatUnread() {
    this.logger.warn('[markChatUnread] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchProfile() {
    this.logger.warn('[fetchProfile] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async offerCall() {
    this.logger.warn('[offerCall] Método não disponível no WhatsApp Business API');
    throw new BadRequestException('Method not available on WhatsApp Business API');
  }
  public async sendPresence() {
    this.logger.warn('[sendPresence] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async setPresence() {
    this.logger.warn('[setPresence] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchPrivacySettings() {
    this.logger.warn('[fetchPrivacySettings] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updatePrivacySettings() {
    this.logger.warn('[updatePrivacySettings] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchBusinessProfile() {
    this.logger.warn('[fetchBusinessProfile] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateProfileName() {
    this.logger.warn('[updateProfileName] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateProfileStatus() {
    this.logger.warn('[updateProfileStatus] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateProfilePicture() {
    this.logger.warn('[updateProfilePicture] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async removeProfilePicture() {
    this.logger.warn('[removeProfilePicture] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async blockUser() {
    this.logger.warn('[blockUser] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateMessage() {
    this.logger.warn('[updateMessage] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async createGroup() {
    this.logger.warn('[createGroup] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGroupPicture() {
    this.logger.warn('[updateGroupPicture] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGroupSubject() {
    this.logger.warn('[updateGroupSubject] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGroupDescription() {
    this.logger.warn('[updateGroupDescription] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async findGroup() {
    this.logger.warn('[findGroup] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchAllGroups() {
    this.logger.warn('[fetchAllGroups] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async inviteCode() {
    this.logger.warn('[inviteCode] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async inviteInfo() {
    this.logger.warn('[inviteInfo] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async sendInvite() {
    this.logger.warn('[sendInvite] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async acceptInviteCode() {
    this.logger.warn('[acceptInviteCode] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async revokeInviteCode() {
    this.logger.warn('[revokeInviteCode] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async findParticipants() {
    this.logger.warn('[findParticipants] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGParticipant() {
    this.logger.warn('[updateGParticipant] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async updateGSetting() {
    this.logger.warn('[updateGSetting] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async toggleEphemeral() {
    this.logger.warn('[toggleEphemeral] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async leaveGroup() {
    this.logger.warn('[leaveGroup] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fetchLabels() {
    this.logger.warn('[fetchLabels] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async handleLabel() {
    this.logger.warn('[handleLabel] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async receiveMobileCode() {
    this.logger.warn('[receiveMobileCode] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
  public async fakeCall() {
    this.logger.warn('[fakeCall] Método não disponível no Evolution Channel');
    throw new BadRequestException('Method not available on Evolution Channel');
  }
}