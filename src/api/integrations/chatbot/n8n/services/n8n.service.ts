import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Auth, ConfigService, HttpServer } from '@config/env.config';
import { IntegrationSession, N8n, N8nSetting } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';

import { BaseChatbotService } from '../../base-chatbot.service';
import { OpenaiService } from '../../openai/services/openai.service';
import { N8nDto } from '../dto/n8n.dto';
export class N8nService extends BaseChatbotService<N8n, N8nSetting> {
  private openaiService: OpenaiService;

  constructor(
    waMonitor: WAMonitoringService,
    prismaRepository: PrismaRepository,
    configService: ConfigService,
    openaiService: OpenaiService,
  ) {
    super(waMonitor, prismaRepository, 'N8nService', configService);
    this.openaiService = openaiService;
  }

  /**
   * Return the bot type for N8n
   */
  protected getBotType(): string {
    return 'n8n';
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

  public async createNewSession(instance: InstanceDto, data: any) {
    return super.createNewSession(instance, data, 'n8n');
  }

  protected async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    settings: N8nSetting,
    n8n: N8n,
    remoteJid: string,
    pushName: string,
    content: string,
    msg?: any,
  ) {
    try {
      const endpoint: string = n8n.webhookUrl;
      const payload: any = {
        chatInput: content,
        sessionId: session.sessionId,
        remoteJid: remoteJid,
        pushName: pushName,
        fromMe: msg?.key?.fromMe,
        instanceName: instance.instanceName,
        serverUrl: this.configService.get<HttpServer>('SERVER').URL,
        apiKey: instance.token,
      };

      // Handle audio messages
      if (this.isAudioMessage(content) && msg) {
        try {
          this.logger.debug(`[N8n] Downloading audio for Whisper transcription`);
          const transcription = await this.openaiService.speechToText(msg);
          if (transcription) {
            payload.chatInput = transcription;
          } else {
            payload.chatInput = '[Audio message could not be transcribed]';
          }
        } catch (err) {
          this.logger.error(`[N8n] Failed to transcribe audio: ${err}`);
          payload.chatInput = '[Audio message could not be transcribed]';
        }
      }

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

  protected async sendMessageWhatsApp(instance: any, remoteJid: string, message: string, settings: N8nSetting) {
    const linkRegex = /(!?)\[(.*?)\]\((.*?)\)/g;
    let textBuffer = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(message)) !== null) {
      const [fullMatch, exclamation, altText, url] = match;
      const mediaType = this.getMediaType(url);
      const beforeText = message.slice(lastIndex, match.index).trim();

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
            const delay = Math.min(Math.max(textBuffer.length * timePerChar, minDelay), maxDelay);

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
                    text: textBuffer,
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
        }

        textBuffer = '';

        if (mediaType === 'image') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            caption: exclamation === '!' ? undefined : altText,
            mediatype: 'image',
            media: url,
          });
        } else if (mediaType === 'video') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            caption: exclamation === '!' ? undefined : altText,
            mediatype: 'video',
            media: url,
          });
        } else if (mediaType === 'audio') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            mediatype: 'audio',
            media: url,
          });
        } else if (mediaType === 'document') {
          await instance.mediaMessage({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            caption: exclamation === '!' ? undefined : altText,
            mediatype: 'document',
            media: url,
            fileName: altText || 'file',
          });
        }
      } else {
        textBuffer += `[${altText}](${url})`;
      }

      lastIndex = match.index + fullMatch.length;
    }

    const remainingText = message.slice(lastIndex).trim();
    if (remainingText) {
      textBuffer += remainingText;
    }

    if (textBuffer.trim()) {
      const splitMessages = settings.splitMessages ?? false;
      const timePerChar = settings.timePerChar ?? 0;
      const minDelay = 1000;
      const maxDelay = 20000;

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
        const delay = Math.min(Math.max(textBuffer.length * timePerChar, minDelay), maxDelay);

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
                text: textBuffer,
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
    }
  }

  protected async initNewSession(
    instance: any,
    remoteJid: string,
    n8n: N8n,
    settings: N8nSetting,
    session: IntegrationSession,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    try {
      await this.sendMessageToBot(instance, session, settings, n8n, remoteJid, pushName || '', content, msg);
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  public async process(
    instance: any,
    remoteJid: string,
    n8n: N8n,
    session: IntegrationSession,
    settings: N8nSetting,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    try {
      // Handle keyword finish
      if (settings?.keywordFinish?.includes(content.toLowerCase())) {
        if (settings?.keepOpen) {
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          await this.prismaRepository.integrationSession.delete({
            where: {
              id: session.id,
            },
          });
        }

        return;
      }

      // If session is new or doesn't exist
      if (!session) {
        const data = {
          remoteJid,
          pushName,
          botId: n8n.id,
        };

        const createSession = await this.createNewSession(
          { instanceName: instance.instanceName, instanceId: instance.instanceId },
          data,
        );

        await this.initNewSession(instance, remoteJid, n8n, settings, createSession.session, content, pushName, msg);

        await sendTelemetry('/n8n/session/start');
        return;
      }

      // If session exists but is paused
      if (session.status === 'paused') {
        return;
      }

      // Regular message for ongoing session
      await this.sendMessageToBot(instance, session, settings, n8n, remoteJid, pushName || '', content, msg);
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
