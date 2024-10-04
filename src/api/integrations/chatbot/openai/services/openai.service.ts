/* eslint-disable @typescript-eslint/no-unused-vars */
import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService, Language } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { IntegrationSession, OpenaiBot, OpenaiCreds, OpenaiSetting } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import { downloadMediaMessage } from 'baileys';
import FormData from 'form-data';
import OpenAI from 'openai';
import P from 'pino';

export class OpenaiService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private client: OpenAI;

  private readonly logger = new Logger('OpenaiService');

  private async sendMessageToBot(instance: any, openaiBot: OpenaiBot, remoteJid: string, content: string) {
    const systemMessages: any = openaiBot.systemMessages;

    const messagesSystem: any[] = systemMessages.map((message) => {
      return {
        role: 'system',
        content: message,
      };
    });

    const assistantMessages: any = openaiBot.assistantMessages;

    const messagesAssistant: any[] = assistantMessages.map((message) => {
      return {
        role: 'assistant',
        content: message,
      };
    });

    const userMessages: any = openaiBot.userMessages;

    const messagesUser: any[] = userMessages.map((message) => {
      return {
        role: 'user',
        content: message,
      };
    });

    const messageData: any = {
      role: 'user',
      content: [{ type: 'text', text: content }],
    };

    if (this.isImageMessage(content)) {
      const contentSplit = content.split('|');

      const url = contentSplit[1].split('?')[0];

      messageData.content = [
        { type: 'text', text: contentSplit[2] || content },
        {
          type: 'image_url',
          image_url: {
            url: url,
          },
        },
      ];
    }

    const messages: any[] = [...messagesSystem, ...messagesAssistant, ...messagesUser, messageData];

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    const completions = await this.client.chat.completions.create({
      model: openaiBot.model,
      messages: messages,
      max_tokens: openaiBot.maxTokens,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS)
      await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = completions.choices[0].message.content;

    return message;
  }

  private async sendMessageToAssistant(
    instance: any,
    openaiBot: OpenaiBot,
    remoteJid: string,
    pushName: string,
    fromMe: boolean,
    content: string,
    threadId: string,
  ) {
    const messageData: any = {
      role: fromMe ? 'assistant' : 'user',
      content: [{ type: 'text', text: content }],
    };

    if (this.isImageMessage(content)) {
      const contentSplit = content.split('|');

      const url = contentSplit[1].split('?')[0];

      messageData.content = [
        { type: 'text', text: contentSplit[2] || content },
        {
          type: 'image_url',
          image_url: {
            url: url,
          },
        },
      ];
    }

    await this.client.beta.threads.messages.create(threadId, messageData);

    if (fromMe) {
      sendTelemetry('/message/sendText');
      return;
    }

    const runAssistant = await this.client.beta.threads.runs.create(threadId, {
      assistant_id: openaiBot.assistantId,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    const response = await this.getAIResponse(threadId, runAssistant.id, openaiBot.functionUrl, remoteJid, pushName);

    if (instance.integration === Integration.WHATSAPP_BAILEYS)
      await instance.client.sendPresenceUpdate('paused', remoteJid);

    const message = response?.data[0].content[0].text.value;

    return message;
  }

  private async sendMessageWhatsapp(
    instance: any,
    session: IntegrationSession,
    remoteJid: string,
    settings: OpenaiSetting,
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
            false,
          );
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

    if (textBuffer.trim()) {
      await instance.textMessage(
        {
          number: remoteJid.split('@')[0],
          delay: settings?.delayMessage || 1000,
          text: textBuffer.trim(),
        },
        false,
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

  public async createAssistantNewSession(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    try {
      this.client = new OpenAI({
        apiKey: creds.apiKey,
      });

      const threadId = (await this.client.beta.threads.create({})).id;

      let session = null;
      if (threadId) {
        session = await this.prismaRepository.integrationSession.create({
          data: {
            remoteJid: data.remoteJid,
            pushName: data.pushName,
            sessionId: threadId,
            status: 'opened',
            awaitUser: false,
            botId: data.botId,
            instanceId: instance.instanceId,
            type: 'openai',
          },
        });
      }
      return { session };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private async initAssistantNewSession(
    instance: any,
    remoteJid: string,
    pushName: string,
    fromMe: boolean,
    openaiBot: OpenaiBot,
    settings: OpenaiSetting,
    session: IntegrationSession,
    content: string,
  ) {
    const data = await this.createAssistantNewSession(instance, {
      remoteJid,
      pushName,
      openaiCredsId: openaiBot.openaiCredsId,
      botId: openaiBot.id,
    });

    if (data.session) {
      session = data.session;
    }

    const message = await this.sendMessageToAssistant(
      instance,
      openaiBot,
      remoteJid,
      pushName,
      fromMe,
      content,
      session.sessionId,
    );

    await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);

    return;
  }

  private isJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async getAIResponse(
    threadId: string,
    runId: string,
    functionUrl: string,
    remoteJid: string,
    pushName: string,
  ) {
    const getRun = await this.client.beta.threads.runs.retrieve(threadId, runId);
    let toolCalls;
    switch (getRun.status) {
      case 'requires_action':
        toolCalls = getRun?.required_action?.submit_tool_outputs?.tool_calls;

        if (toolCalls) {
          for (const toolCall of toolCalls) {
            const id = toolCall.id;
            const functionName = toolCall?.function?.name;
            const functionArgument = this.isJSON(toolCall?.function?.arguments)
              ? JSON.parse(toolCall?.function?.arguments)
              : toolCall?.function?.arguments;

            let output = null;

            try {
              const { data } = await axios.post(functionUrl, {
                name: functionName,
                arguments: { ...functionArgument, remoteJid, pushName },
              });

              output = JSON.stringify(data)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
            } catch (error) {
              output = JSON.stringify(error)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
            }

            await this.client.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: [
                {
                  tool_call_id: id,
                  output,
                },
              ],
            });
          }
        }

        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'queued':
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'in_progress':
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'completed':
        return await this.client.beta.threads.messages.list(threadId, {
          run_id: runId,
          limit: 1,
        });
    }
  }

  private isImageMessage(content: string) {
    return content.includes('imageMessage');
  }

  public async processOpenaiAssistant(
    instance: any,
    remoteJid: string,
    pushName: string,
    fromMe: boolean,
    openaiBot: OpenaiBot,
    session: IntegrationSession,
    settings: OpenaiSetting,
    content: string,
  ) {
    if (session && session.status === 'closed') {
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
              botId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initAssistantNewSession(
          instance,
          remoteJid,
          pushName,
          fromMe,
          openaiBot,
          settings,
          session,
          content,
        );
        return;
      }
    }

    if (!session) {
      await this.initAssistantNewSession(instance, remoteJid, pushName, fromMe, openaiBot, settings, session, content);
      return;
    }

    if (session.status !== 'paused')
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
            botId: openaiBot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const threadId = session.sessionId;

    const message = await this.sendMessageToAssistant(
      instance,
      openaiBot,
      remoteJid,
      pushName,
      fromMe,
      content,
      threadId,
    );

    await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);

    return;
  }

  public async createChatCompletionNewSession(instance: InstanceDto, data: any) {
    if (data.remoteJid === 'status@broadcast') return;

    const id = Math.floor(Math.random() * 10000000000).toString();

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    try {
      const session = await this.prismaRepository.integrationSession.create({
        data: {
          remoteJid: data.remoteJid,
          pushName: data.pushName,
          sessionId: id,
          status: 'opened',
          awaitUser: false,
          botId: data.botId,
          instanceId: instance.instanceId,
          type: 'openai',
        },
      });

      return { session, creds };
    } catch (error) {
      this.logger.error(error);
      return;
    }
  }

  private async initChatCompletionNewSession(
    instance: any,
    remoteJid: string,
    pushName: string,
    openaiBot: OpenaiBot,
    settings: OpenaiSetting,
    session: IntegrationSession,
    content: string,
  ) {
    const data = await this.createChatCompletionNewSession(instance, {
      remoteJid,
      pushName,
      openaiCredsId: openaiBot.openaiCredsId,
      botId: openaiBot.id,
    });

    session = data.session;

    const creds = data.creds;

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const message = await this.sendMessageToBot(instance, openaiBot, remoteJid, content);

    await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);

    return;
  }

  public async processOpenaiChatCompletion(
    instance: any,
    remoteJid: string,
    pushName: string,
    openaiBot: OpenaiBot,
    session: IntegrationSession,
    settings: OpenaiSetting,
    content: string,
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
              botId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        await this.initChatCompletionNewSession(instance, remoteJid, pushName, openaiBot, settings, session, content);
        return;
      }
    }

    if (!session) {
      await this.initChatCompletionNewSession(instance, remoteJid, pushName, openaiBot, settings, session, content);
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
            botId: openaiBot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) throw new Error('Openai Creds not found');

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const message = await this.sendMessageToBot(instance, openaiBot, remoteJid, content);

    await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);

    return;
  }

  public async speechToText(creds: OpenaiCreds, msg: any, updateMediaMessage: any) {
    let audio;

    if (msg?.message?.mediaUrl) {
      audio = await axios.get(msg.message.mediaUrl, { responseType: 'arraybuffer' }).then((response) => {
        return Buffer.from(response.data, 'binary');
      });
    } else {
      audio = await downloadMediaMessage(
        { key: msg.key, message: msg?.message },
        'buffer',
        {},
        {
          logger: P({ level: 'error' }) as any,
          reuploadRequest: updateMediaMessage,
        },
      );
    }

    const lang = this.configService.get<Language>('LANGUAGE').includes('pt')
      ? 'pt'
      : this.configService.get<Language>('LANGUAGE');

    const formData = new FormData();

    formData.append('file', audio, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${creds.apiKey}`,
      },
    });

    return response?.data?.text;
  }
}
