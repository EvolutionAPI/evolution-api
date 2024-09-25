import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { Auth, ConfigService, HttpServer } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { EvolutionBot, EvolutionBotSetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';

export class EvolutionBotService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) { }

  private readonly logger = new Logger('EvolutionBotService');

  public async createNewSession(instance: InstanceDto, data: any) {
    try {
      const session = await this.prismaRepository.integrationSession.create({
        data: {
          remoteJid: data.remoteJid,
          pushName: data.pushName,
          sessionId: data.remoteJid,
          status: 'opened',
          awaitUser: false,
          botId: data.botId,
          instanceId: instance.instanceId,
          type: 'evolution',
        },
      });

      return { session };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private isImageMessage(content: string) {
    return content.includes('imageMessage');
  }

  private async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    bot: EvolutionBot,
    remoteJid: string,
    pushName: string,
    content: string,
  ) {
    const payload: any = {
      inputs: {
        sessionId: session.id,
        remoteJid: remoteJid,
        pushName: pushName,
        instanceName: instance.instanceName,
        serverUrl: this.configService.get<HttpServer>('SERVER').URL,
        apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
      },
      query: content,
      conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
      user: remoteJid,
    };

    if (this.isImageMessage(content)) {
      const contentSplit = content.split('|');

      payload.files = [
        {
          type: 'image',
          url: contentSplit[1].split('?')[0],
        },
      ];
      payload.query = contentSplit[2] || content;
    }

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    let headers: any = {
      'Content-Type': 'application/json',
    };

    if (bot.apiKey) {
      headers = {
        ...headers,
        Authorization: `Bearer ${bot.apiKey}`,
      };
    }

    const response = await axios.post(bot.apiUrl, payload, {
      headers,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS)
      await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = response?.data?.message;

    return message;
  }

  private async sendMessageWhatsApp(
    instance: any,
    remoteJid: string,
    session: IntegrationSession,
    settings: EvolutionBotSetting,
    message: string,
  ) {
    const linkRegex = /(!?)\[(.*?)\]\((.*?)\)/g;

    let textBuffer = '';
    let lastIndex = 0;

    let match: RegExpExecArray | null;

    const getMediaType = (url: string): string | null => {
      const extension = url.split('.').pop()?.toLowerCase();
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
      const audioExtensions = ['mp3', 'wav', 'aac', 'ogg'];
      const videoExtensions = ['mp4', 'avi', 'mkv', 'mov'];
      const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];

      if (imageExtensions.includes(extension || '')) return 'image';
      if (audioExtensions.includes(extension || '')) return 'audio';
      if (videoExtensions.includes(extension || '')) return 'video';
      if (documentExtensions.includes(extension || '')) return 'document';
      return null;
    };

    while ((match = linkRegex.exec(message)) !== null) {
      const [fullMatch, exclMark, altText, url] = match;
      const mediaType = getMediaType(url);

      const beforeText = message.slice(lastIndex, match.index);
      if (beforeText) {
        textBuffer += beforeText;
      }

      if (mediaType) {
        if (textBuffer.trim()) {
          await instance.textMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              text: textBuffer.trim(),
            },
            false
          );
          textBuffer = '';
        }

        if (mediaType === 'audio') {
          await instance.audioWhatsapp(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              audio: url,
              caption: altText,
            }
          );
        } else {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: mediaType,
              media: url,
              caption: altText,
            },
            false
          );
        }
      } else {
        textBuffer += `[${altText}](${url})`;
      }

      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < message.length) {
      const remainingText = message.slice(lastIndex);
      if (remainingText.trim()) {
        textBuffer += remainingText;
      }
    }

    if (textBuffer.trim()) {
      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: textBuffer.trim(),
        },
        false
      );
    }

    sendTelemetry('/message/sendText');

    await this.prismaRepository.integrationSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: true,
      },
    });
  }


  private async initNewSession(
    instance: any,
    remoteJid: string,
    bot: EvolutionBot,
    settings: EvolutionBotSetting,
    session: IntegrationSession,
    content: string,
    pushName?: string,
  ) {
    const data = await this.createNewSession(instance, {
      remoteJid,
      pushName,
      botId: bot.id,
    });

    if (data.session) {
      session = data.session;
    }

    const message = await this.sendMessageToBot(instance, session, bot, remoteJid, pushName, content);

    if (!message) return;

    await this.sendMessageWhatsApp(instance, remoteJid, session, settings, message);

    return;
  }

  public async processBot(
    instance: any,
    remoteJid: string,
    bot: EvolutionBot,
    session: IntegrationSession,
    settings: EvolutionBotSetting,
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
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.integrationSession.deleteMany({
            where: {
              botId: bot.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initNewSession(instance, remoteJid, bot, settings, session, content, pushName);
        return;
      }
    }

    if (!session) {
      await this.initNewSession(instance, remoteJid, bot, settings, session, content, pushName);
      return;
    }

    await this.prismaRepository.integrationSession.update({
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
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.integrationSession.deleteMany({
          where: {
            botId: bot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    const message = await this.sendMessageToBot(instance, session, bot, remoteJid, pushName, content);

    if (!message) return;

    await this.sendMessageWhatsApp(instance, remoteJid, session, settings, message);

    return;
  }
}
