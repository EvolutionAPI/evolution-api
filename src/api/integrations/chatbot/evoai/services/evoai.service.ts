/* eslint-disable @typescript-eslint/no-unused-vars */
import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService, Language } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { Evoai, EvoaiSetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import { downloadMediaMessage } from 'baileys';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

export class EvoaiService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly prismaRepository: PrismaRepository,
    private readonly configService: ConfigService,
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

  private isAudioMessage(content: string) {
    return content.includes('audioMessage');
  }

  private async speechToText(audioBuffer: Buffer): Promise<string | null> {
    try {
      const apiKey = this.configService.get<any>('OPENAI')?.API_KEY;
      if (!apiKey) {
        this.logger.error('[EvoAI] No OpenAI API key set for Whisper transcription');
        return null;
      }
      const lang = this.configService.get<Language>('LANGUAGE').includes('pt')
        ? 'pt'
        : this.configService.get<Language>('LANGUAGE');
      const formData = new FormData();
      formData.append('file', audioBuffer, 'audio.ogg');
      formData.append('model', 'whisper-1');
      formData.append('language', lang);
      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return response?.data?.text || null;
    } catch (err) {
      this.logger.error(`[EvoAI] Whisper transcription failed: ${err}`);
      return null;
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
    msg?: any,
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

      // If content indicates an image/file, fetch and encode as base64, then send as a file part
      if ((this.isImageMessage(content) || this.isAudioMessage(content)) && msg) {
        const isImage = this.isImageMessage(content);
        const isAudio = this.isAudioMessage(content);
        this.logger.debug(`[EvoAI] Media message detected: ${content}`);

        let transcribedText = null;
        if (isAudio) {
          try {
            this.logger.debug(`[EvoAI] Downloading audio for Whisper transcription`);
            const mediaBuffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', {});
            transcribedText = await this.speechToText(mediaBuffer);
            if (transcribedText) {
              parts[0].text = transcribedText;
            } else {
              parts[0].text = '[Audio message could not be transcribed]';
            }
          } catch (err) {
            this.logger.error(`[EvoAI] Failed to transcribe audio: ${err}`);
            parts[0].text = '[Audio message could not be transcribed]';
          }
        } else if (isImage) {
          const contentSplit = content.split('|');
          parts[0].text = contentSplit[2] || content;
          let fileContent = null,
            fileName = null,
            mimeType = null;
          try {
            this.logger.debug(
              `[EvoAI] Fetching image using downloadMediaMessage with msg.key: ${JSON.stringify(msg.key)}`,
            );
            const mediaBuffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', {});
            fileContent = Buffer.from(mediaBuffer).toString('base64');
            fileName = contentSplit[2] || `${msg.key.id}.jpg`;
            mimeType = 'image/jpeg';
            parts.push({
              type: 'file',
              file: {
                name: fileName,
                bytes: fileContent,
                mimeType: mimeType,
              },
            });
          } catch (fileErr) {
            this.logger.error(`[EvoAI] Failed to fetch or encode image for EvoAI: ${fileErr}`);
          }
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
      // Redact base64 file bytes from payload log
      const redactedPayload = JSON.parse(JSON.stringify(payload));
      if (redactedPayload?.params?.message?.parts) {
        redactedPayload.params.message.parts = redactedPayload.params.message.parts.map((part) => {
          if (part.type === 'file' && part.file && part.file.bytes) {
            return { ...part, file: { ...part.file, bytes: '[base64 omitted]' } };
          }
          return part;
        });
      }
      this.logger.debug(`[EvoAI] Payload: ${JSON.stringify(redactedPayload)}`);

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

      this.logger.debug(`[EvoAI] Response: ${JSON.stringify(response.data.status)}`);

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
    msg?: any,
  ) {
    const data = await this.createNewSession(instance, {
      remoteJid,
      pushName,
      botId: evoai.id,
    });

    if (data.session) {
      session = data.session;
    }

    await this.sendMessageToBot(instance, session, settings, evoai, remoteJid, pushName, content, msg);

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
    msg?: any,
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

        await this.initNewSession(instance, remoteJid, evoai, settings, session, content, pushName, msg);
        return;
      }
    }

    if (!session) {
      await this.initNewSession(instance, remoteJid, evoai, settings, session, content, pushName, msg);
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

    await this.sendMessageToBot(instance, session, settings, evoai, remoteJid, pushName, content, msg);

    return;
  }
}
