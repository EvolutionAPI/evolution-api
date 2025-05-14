import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { IntegrationSession, N8n, N8nSetting } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';

import { N8nDto } from '../dto/n8n.dto';

export class N8nService {
  private readonly logger = new Logger('N8nService');
  private readonly waMonitor: WAMonitoringService;

  constructor(
    waMonitor: WAMonitoringService,
    private readonly prismaRepository: PrismaRepository,
  ) {
    this.waMonitor = waMonitor;
  }

  /**
   * Create a new N8n bot for the given instance.
   */
  public async createBot(instanceId: string, data: N8nDto) {
    try {
      return await this.prismaRepository.n8n.create({
        data: {
          enabled: data.enabled ?? true,
          description: data.description,
          webhookUrl: data.webhookUrl,
          basicAuthUser: data.basicAuthUser,
          basicAuthPass: data.basicAuthPass,
          instanceId,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Find all N8n bots for the given instance.
   */
  public async findBots(instanceId: string) {
    try {
      return await this.prismaRepository.n8n.findMany({ where: { instanceId } });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Fetch a specific N8n bot by ID and instance.
   */
  public async fetchBot(instanceId: string, n8nId: string) {
    try {
      const bot = await this.prismaRepository.n8n.findFirst({ where: { id: n8nId } });
      if (!bot || bot.instanceId !== instanceId) throw new Error('N8n bot not found');
      return bot;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Update a specific N8n bot.
   */
  public async updateBot(instanceId: string, n8nId: string, data: N8nDto) {
    try {
      await this.fetchBot(instanceId, n8nId);
      return await this.prismaRepository.n8n.update({
        where: { id: n8nId },
        data: {
          enabled: data.enabled,
          description: data.description,
          webhookUrl: data.webhookUrl,
          basicAuthUser: data.basicAuthUser,
          basicAuthPass: data.basicAuthPass,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Delete a specific N8n bot.
   */
  public async deleteBot(instanceId: string, n8nId: string) {
    try {
      await this.fetchBot(instanceId, n8nId);
      return await this.prismaRepository.n8n.delete({ where: { id: n8nId } });
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Send a message to the N8n bot webhook.
   */
  public async sendMessage(n8nId: string, chatInput: string, sessionId: string): Promise<string> {
    try {
      const bot = await this.prismaRepository.n8n.findFirst({ where: { id: n8nId, enabled: true } });
      if (!bot) throw new Error('N8n bot not found or not enabled');
      const headers: Record<string, string> = {};
      if (bot.basicAuthUser && bot.basicAuthPass) {
        const auth = Buffer.from(`${bot.basicAuthUser}:${bot.basicAuthPass}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }
      const response = await axios.post(bot.webhookUrl, { chatInput, sessionId }, { headers });
      return response.data.output;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error sending message to n8n bot');
    }
  }

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
          type: 'n8n',
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

  private isJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    settings: N8nSetting,
    n8n: N8n,
    remoteJid: string,
    pushName: string,
    content: string,
  ) {
    try {
      const endpoint: string = n8n.webhookUrl;
      const payload: any = {
        chatInput: content,
        sessionId: session.sessionId,
      };
      const headers: Record<string, string> = {};
      if (n8n.basicAuthUser && n8n.basicAuthPass) {
        const auth = Buffer.from(`${n8n.basicAuthUser}:${n8n.basicAuthPass}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }
      const response = await axios.post(endpoint, payload, { headers });
      const message = response?.data?.output || response?.data?.answer;
      await this.sendMessageWhatsApp(instance, remoteJid, message, settings);
      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
        },
      });
    } catch (error) {
      this.logger.error(error.response?.data || error);
      return;
    }
  }

  private async sendMessageWhatsApp(instance: any, remoteJid: string, message: string, settings: N8nSetting) {
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
      const [altText, url] = match;
      const mediaType = getMediaType(url);
      const beforeText = message.slice(lastIndex, match.index);
      if (beforeText) {
        textBuffer += beforeText;
      }
      if (mediaType) {
        const splitMessages = settings.splitMessages ?? false;
        const timePerChar = settings.timePerChar ?? 0;
        const minDelay = 1000;
        const maxDelay = 20000;
        if (textBuffer.trim()) {
          if (splitMessages) {
            const multipleMessages = textBuffer.trim().split('\n\n');
            for (let index = 0; index < multipleMessages.length; index++) {
              const message = multipleMessages[index];
              const delay = Math.min(Math.max(message.length * timePerChar, minDelay), maxDelay);
              if (instance.integration === 'WHATSAPP_BAILEYS') {
                await instance.client.presenceSubscribe(remoteJid);
                await instance.client.sendPresenceUpdate('composing', remoteJid);
              }
              await new Promise<void>((resolve) => {
                setTimeout(async () => {
                  await instance.textMessage(
                    {
                      number: remoteJid.split('@')[0],
                      delay: settings?.delayMessage || 1000,
                      text: message,
                    },
                    false,
                  );
                  resolve();
                }, delay);
              });
              if (instance.integration === 'WHATSAPP_BAILEYS') {
                await instance.client.sendPresenceUpdate('paused', remoteJid);
              }
            }
          } else {
            await instance.textMessage(
              {
                number: remoteJid.split('@')[0],
                delay: settings?.delayMessage || 1000,
                text: textBuffer.trim(),
              },
              false,
            );
          }
          textBuffer = '';
        }
        if (mediaType === 'audio') {
          await instance.audioWhatsapp({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            audio: url,
            caption: altText,
          });
        } else {
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: mediaType,
              media: url,
              caption: altText,
            },
            null,
            false,
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
    const splitMessages = settings.splitMessages ?? false;
    const timePerChar = settings.timePerChar ?? 0;
    const minDelay = 1000;
    const maxDelay = 20000;
    if (textBuffer.trim()) {
      if (splitMessages) {
        const multipleMessages = textBuffer.trim().split('\n\n');
        for (let index = 0; index < multipleMessages.length; index++) {
          const message = multipleMessages[index];
          const delay = Math.min(Math.max(message.length * timePerChar, minDelay), maxDelay);
          if (instance.integration === 'WHATSAPP_BAILEYS') {
            await instance.client.presenceSubscribe(remoteJid);
            await instance.client.sendPresenceUpdate('composing', remoteJid);
          }
          await new Promise<void>((resolve) => {
            setTimeout(async () => {
              await instance.textMessage(
                {
                  number: remoteJid.split('@')[0],
                  delay: settings?.delayMessage || 1000,
                  text: message,
                },
                false,
              );
              resolve();
            }, delay);
          });
          if (instance.integration === 'WHATSAPP_BAILEYS') {
            await instance.client.sendPresenceUpdate('paused', remoteJid);
          }
        }
      } else {
        await instance.textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            text: textBuffer.trim(),
          },
          false,
        );
      }
    }
    sendTelemetry('/message/sendText');
  }

  private async initNewSession(
    instance: any,
    remoteJid: string,
    n8n: N8n,
    settings: N8nSetting,
    session: IntegrationSession,
    content: string,
    pushName?: string,
  ) {
    const data = await this.createNewSession(instance, {
      remoteJid,
      pushName,
      botId: n8n.id,
    });
    if (data.session) {
      session = data.session;
    }
    await this.sendMessageToBot(instance, session, settings, n8n, remoteJid, pushName, content);
    return;
  }

  public async processN8n(
    instance: any,
    remoteJid: string,
    n8n: N8n,
    session: IntegrationSession,
    settings: N8nSetting,
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
            where: { id: session.id },
            data: { status: 'closed' },
          });
        } else {
          await this.prismaRepository.integrationSession.deleteMany({
            where: { botId: n8n.id, remoteJid: remoteJid },
          });
        }
        await this.initNewSession(instance, remoteJid, n8n, settings, session, content, pushName);
        return;
      }
    }
    if (!session) {
      await this.initNewSession(instance, remoteJid, n8n, settings, session, content, pushName);
      return;
    }
    await this.prismaRepository.integrationSession.update({
      where: { id: session.id },
      data: { status: 'opened', awaitUser: false },
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
          where: { id: session.id },
          data: { status: 'closed' },
        });
      } else {
        await this.prismaRepository.integrationSession.deleteMany({
          where: { botId: n8n.id, remoteJid: remoteJid },
        });
      }
      return;
    }
    await this.sendMessageToBot(instance, session, settings, n8n, remoteJid, pushName, content);
    return;
  }
}
