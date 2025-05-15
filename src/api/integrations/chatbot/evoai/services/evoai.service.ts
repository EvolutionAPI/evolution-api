/* eslint-disable @typescript-eslint/no-unused-vars */
import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { Logger } from '@config/logger.config';
import { Evoai, EvoaiSetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import path from 'path';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

export class EvoaiService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private readonly logger = new Logger('EvoaiService');

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
          type: 'evoai',
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
    settings: EvoaiSetting,
    evoai: Evoai,
    remoteJid: string,
    pushName: string,
    content: string,
  ) {
    try {
      const endpoint: string = evoai.agentUrl;
      const callId = `call-${uuidv4()}`;
      const taskId = `task-${uuidv4()}`;

      // Prepare message parts
      const parts: any[] = [
        {
          type: 'text',
          text: content,
        },
      ];

      // If content indicates an image/file, add as a file part
      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');
        const fileUrl = contentSplit[1].split('?')[0];
        const textPart = contentSplit[2] || content;
        parts[0].text = textPart;

        // Try to fetch the file and encode as base64
        try {
          const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
          const fileContent = Buffer.from(fileResponse.data).toString('base64');
          const fileName = path.basename(fileUrl);
          parts.push({
            type: 'file',
            file: {
              name: fileName,
              bytes: fileContent,
            },
          });
        } catch (fileErr) {
          this.logger.error(`Failed to fetch or encode file for EvoAI: ${fileErr}`);
        }
      }

      const payload = {
        jsonrpc: '2.0',
        method: 'tasks/send',
        params: {
          message: {
            role: 'user',
            parts,
          },
          sessionId: session.sessionId,
          id: taskId,
        },
        id: callId,
      };

      this.logger.debug(`[EvoAI] Sending request to: ${endpoint}`);
      this.logger.debug(`[EvoAI] Payload: ${JSON.stringify(payload)}`);

      if (instance.integration === Integration.WHATSAPP_BAILEYS) {
        await instance.client.presenceSubscribe(remoteJid);
        await instance.client.sendPresenceUpdate('composing', remoteJid);
      }

      const response = await axios.post(endpoint, payload, {
        headers: {
          'x-api-key': evoai.apiKey,
          'Content-Type': 'application/json',
        },
      });

      this.logger.debug(`[EvoAI] Response: ${JSON.stringify(response.data)}`);

      if (instance.integration === Integration.WHATSAPP_BAILEYS)
        await instance.client.sendPresenceUpdate('paused', remoteJid);

      let message = undefined;
      const result = response?.data?.result;
      if (result?.status?.message?.parts && Array.isArray(result.status.message.parts)) {
        const textPart = result.status.message.parts.find((p) => p.type === 'text' && p.text);
        if (textPart) message = textPart.text;
      }
      this.logger.debug(`[EvoAI] Extracted message to send: ${message}`);
      const conversationId = session.sessionId;

      if (message) {
        await this.sendMessageWhatsApp(instance, remoteJid, message, settings);
      }

      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: true,
          sessionId: conversationId,
        },
      });
    } catch (error) {
      this.logger.error(
        `[EvoAI] Error sending message: ${error?.response?.data ? JSON.stringify(error.response.data) : error}`,
      );
      return;
    }
  }

  private async sendMessageWhatsApp(instance: any, remoteJid: string, message: string, settings: EvoaiSetting) {
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

              if (instance.integration === Integration.WHATSAPP_BAILEYS) {
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

              if (instance.integration === Integration.WHATSAPP_BAILEYS) {
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

          if (instance.integration === Integration.WHATSAPP_BAILEYS) {
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

          if (instance.integration === Integration.WHATSAPP_BAILEYS) {
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
    evoai: Evoai,
    settings: EvoaiSetting,
    session: IntegrationSession,
    content: string,
    pushName?: string,
  ) {
    const data = await this.createNewSession(instance, {
      remoteJid,
      pushName,
      botId: evoai.id,
    });

    if (data.session) {
      session = data.session;
    }

    await this.sendMessageToBot(instance, session, settings, evoai, remoteJid, pushName, content);

    return;
  }

  public async processEvoai(
    instance: any,
    remoteJid: string,
    evoai: Evoai,
    session: IntegrationSession,
    settings: EvoaiSetting,
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
              botId: evoai.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initNewSession(instance, remoteJid, evoai, settings, session, content, pushName);
        return;
      }
    }

    if (!session) {
      await this.initNewSession(instance, remoteJid, evoai, settings, session, content, pushName);
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
            botId: evoai.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    await this.sendMessageToBot(instance, session, settings, evoai, remoteJid, pushName, content);

    return;
  }
}
