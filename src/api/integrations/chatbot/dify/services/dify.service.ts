import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { Auth, ConfigService, HttpServer } from '@config/env.config';
import { Dify, DifySetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import { downloadMediaMessage } from 'baileys';

import { BaseChatbotService } from '../../base-chatbot.service';

export class DifyService extends BaseChatbotService<Dify, DifySetting> {
  constructor(waMonitor: WAMonitoringService, configService: ConfigService, prismaRepository: PrismaRepository) {
    super(waMonitor, prismaRepository, 'DifyService', configService);
  }

  /**
   * Return the bot type for Dify
   */
  protected getBotType(): string {
    return 'dify';
  }

  public async createNewSession(instance: InstanceDto, data: any) {
    return super.createNewSession(instance, data, 'dify');
  }

  protected async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    settings: DifySetting,
    dify: Dify,
    remoteJid: string,
    pushName: string,
    content: string,
    msg?: any,
  ) {
    try {
      let endpoint: string = dify.apiUrl;

      if (dify.botType === 'chatBot') {
        endpoint += '/chat-messages';
        const payload: any = {
          inputs: {
            remoteJid: remoteJid,
            pushName: pushName,
            instanceName: instance.instanceName,
            serverUrl: this.configService.get<HttpServer>('SERVER').URL,
            apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
          },
          query: content,
          response_mode: 'blocking',
          conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
          user: remoteJid,
        };

        // Handle image messages
        if (this.isImageMessage(content)) {
          const contentSplit = content.split('|');

          payload.files = [
            {
              type: 'image',
              transfer_method: 'remote_url',
              url: contentSplit[1].split('?')[0],
            },
          ];
          payload.query = contentSplit[2] || content;
        }

        // Handle audio messages
        if (this.isAudioMessage(content) && msg) {
          try {
            this.logger.debug(`[Dify] Downloading audio for Whisper transcription`);
            const mediaBuffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', {});
            const transcribedText = await this.speechToText(mediaBuffer);
            if (transcribedText) {
              payload.query = transcribedText;
            } else {
              payload.query = '[Audio message could not be transcribed]';
            }
          } catch (err) {
            this.logger.error(`[Dify] Failed to transcribe audio: ${err}`);
            payload.query = '[Audio message could not be transcribed]';
          }
        }

        if (instance.integration === Integration.WHATSAPP_BAILEYS) {
          await instance.client.presenceSubscribe(remoteJid);
          await instance.client.sendPresenceUpdate('composing', remoteJid);
        }

        const response = await axios.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${dify.apiKey}`,
          },
        });

        if (instance.integration === Integration.WHATSAPP_BAILEYS)
          await instance.client.sendPresenceUpdate('paused', remoteJid);

        const message = response?.data?.answer;
        const conversationId = response?.data?.conversation_id;

        await this.sendMessageWhatsApp(instance, remoteJid, message, settings);

        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: session.sessionId === remoteJid ? conversationId : session.sessionId,
          },
        });
      }

      if (dify.botType === 'textGenerator') {
        endpoint += '/completion-messages';
        const payload: any = {
          inputs: {
            query: content,
            pushName: pushName,
            remoteJid: remoteJid,
            instanceName: instance.instanceName,
            serverUrl: this.configService.get<HttpServer>('SERVER').URL,
            apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
          },
          response_mode: 'blocking',
          conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
          user: remoteJid,
        };

        // Handle image messages
        if (this.isImageMessage(content)) {
          const contentSplit = content.split('|');

          payload.files = [
            {
              type: 'image',
              transfer_method: 'remote_url',
              url: contentSplit[1].split('?')[0],
            },
          ];
          payload.inputs.query = contentSplit[2] || content;
        }

        // Handle audio messages
        if (this.isAudioMessage(content) && msg) {
          try {
            this.logger.debug(`[Dify] Downloading audio for Whisper transcription`);
            const mediaBuffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', {});
            const transcribedText = await this.speechToText(mediaBuffer);
            if (transcribedText) {
              payload.inputs.query = transcribedText;
            } else {
              payload.inputs.query = '[Audio message could not be transcribed]';
            }
          } catch (err) {
            this.logger.error(`[Dify] Failed to transcribe audio: ${err}`);
            payload.inputs.query = '[Audio message could not be transcribed]';
          }
        }

        if (instance.integration === Integration.WHATSAPP_BAILEYS) {
          await instance.client.presenceSubscribe(remoteJid);
          await instance.client.sendPresenceUpdate('composing', remoteJid);
        }

        const response = await axios.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${dify.apiKey}`,
          },
        });

        if (instance.integration === Integration.WHATSAPP_BAILEYS)
          await instance.client.sendPresenceUpdate('paused', remoteJid);

        const message = response?.data?.answer;
        const conversationId = response?.data?.conversation_id;

        await this.sendMessageWhatsApp(instance, remoteJid, message, settings);

        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: session.sessionId === remoteJid ? conversationId : session.sessionId,
          },
        });
      }

      if (dify.botType === 'agent') {
        endpoint += '/chat-messages';
        const payload: any = {
          inputs: {
            remoteJid: remoteJid,
            pushName: pushName,
            instanceName: instance.instanceName,
            serverUrl: this.configService.get<HttpServer>('SERVER').URL,
            apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
          },
          query: content,
          response_mode: 'streaming',
          conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
          user: remoteJid,
        };

        // Handle image messages
        if (this.isImageMessage(content)) {
          const contentSplit = content.split('|');

          payload.files = [
            {
              type: 'image',
              transfer_method: 'remote_url',
              url: contentSplit[1].split('?')[0],
            },
          ];
          payload.query = contentSplit[2] || content;
        }

        // Handle audio messages
        if (this.isAudioMessage(content) && msg) {
          try {
            this.logger.debug(`[Dify] Downloading audio for Whisper transcription`);
            const mediaBuffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', {});
            const transcribedText = await this.speechToText(mediaBuffer);
            if (transcribedText) {
              payload.query = transcribedText;
            } else {
              payload.query = '[Audio message could not be transcribed]';
            }
          } catch (err) {
            this.logger.error(`[Dify] Failed to transcribe audio: ${err}`);
            payload.query = '[Audio message could not be transcribed]';
          }
        }

        if (instance.integration === Integration.WHATSAPP_BAILEYS) {
          await instance.client.presenceSubscribe(remoteJid);
          await instance.client.sendPresenceUpdate('composing', remoteJid);
        }

        const response = await axios.post(endpoint, payload, {
          headers: {
            Authorization: `Bearer ${dify.apiKey}`,
          },
        });

        let conversationId;
        let answer = '';

        const data = response.data.replaceAll('data: ', '');

        const events = data.split('\n').filter((line) => line.trim() !== '');

        for (const eventString of events) {
          if (eventString.trim().startsWith('{')) {
            const event = JSON.parse(eventString);

            if (event?.event === 'agent_message') {
              console.log('event:', event);
              conversationId = conversationId ?? event?.conversation_id;
              answer += event?.answer;
            }
          }
        }

        if (instance.integration === Integration.WHATSAPP_BAILEYS)
          await instance.client.sendPresenceUpdate('paused', remoteJid);

        await this.sendMessageWhatsApp(instance, remoteJid, answer, settings);

        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
            sessionId: session.sessionId === remoteJid ? conversationId : session.sessionId,
          },
        });
      }
    } catch (error) {
      this.logger.error(error.response?.data || error);
      return;
    }
  }

  protected async sendMessageWhatsApp(instance: any, remoteJid: string, message: string, settings: DifySetting) {
    const linkRegex = /(!?)\[(.*?)\]\((.*?)\)/g;
    let textBuffer = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(message)) !== null) {
      const [fullMatch, exclamation, altText, url] = match;
      const mediaType = this.getMediaType(url);
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
            const delay = Math.min(Math.max(textBuffer.length * timePerChar, minDelay), maxDelay);

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
                    text: textBuffer,
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

    const remainingText = message.slice(lastIndex);
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
        const delay = Math.min(Math.max(textBuffer.length * timePerChar, minDelay), maxDelay);

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
                text: textBuffer,
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
    }
  }

  protected async initNewSession(
    instance: any,
    remoteJid: string,
    dify: Dify,
    settings: DifySetting,
    session: IntegrationSession,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    try {
      await this.sendMessageToBot(instance, session, settings, dify, remoteJid, pushName || '', content, msg);
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  public async process(
    instance: any,
    remoteJid: string,
    dify: Dify,
    session: IntegrationSession,
    settings: DifySetting,
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

        await sendTelemetry('/dify/session/finish');
        return;
      }

      // If session is new or doesn't exist
      if (!session) {
        const data = {
          remoteJid,
          pushName,
          botId: dify.id,
        };

        const createSession = await this.createNewSession(
          { instanceName: instance.instanceName, instanceId: instance.instanceId },
          data,
        );

        await this.initNewSession(instance, remoteJid, dify, settings, createSession.session, content, pushName, msg);

        await sendTelemetry('/dify/session/start');
        return;
      }

      // If session exists but is paused
      if (session.status === 'paused') {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'opened',
            awaitUser: true,
          },
        });

        return;
      }

      // Regular message for ongoing session
      await this.sendMessageToBot(instance, session, settings, dify, remoteJid, pushName || '', content, msg);
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }
}
