import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Auth, ConfigService, HttpServer, Typebot } from '@config/env.config';
import { IntegrationSession, Typebot as TypebotModel } from '@prisma/client';
import axios from 'axios';

import { BaseChatbotService } from '../../base-chatbot.service';
import { OpenaiService } from '../../openai/services/openai.service';

export class TypebotService extends BaseChatbotService<TypebotModel, any> {
  private openaiService: OpenaiService;

  constructor(
    waMonitor: WAMonitoringService,
    configService: ConfigService,
    prismaRepository: PrismaRepository,
    openaiService: OpenaiService,
  ) {
    super(waMonitor, prismaRepository, 'TypebotService', configService);
    this.openaiService = openaiService;
  }

  /**
   * Get the bot type identifier
   */
  protected getBotType(): string {
    return 'typebot';
  }

  /**
   * Send a message to the Typebot API
   */
  protected async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    settings: any,
    bot: TypebotModel,
    remoteJid: string,
    pushName: string,
    content: string,
    msg?: any,
  ): Promise<void> {
    try {
      // Initialize a new session if needed or content is special command
      if (!session || content === 'init') {
        const prefilledVariables = content === 'init' ? msg : null;
        await this.initTypebotSession(instance, session, bot, remoteJid, pushName, prefilledVariables);
        return;
      }

      // Handle keyword matching - if it's a keyword to finish
      if (settings.keywordFinish && content.toLowerCase() === settings.keywordFinish.toLowerCase()) {
        if (settings.keepOpen) {
          await this.prismaRepository.integrationSession.update({
            where: { id: session.id },
            data: { status: 'closed' },
          });
        } else {
          await this.prismaRepository.integrationSession.deleteMany({
            where: { botId: bot.id, remoteJid: remoteJid },
          });
        }
        return;
      }

      // Continue an existing chat
      const version = this.configService?.get<Typebot>('TYPEBOT').API_VERSION;
      let url: string;
      let reqData: any;

      if (version === 'latest') {
        url = `${bot.url}/api/v1/sessions/${session.sessionId.split('-')[1]}/continueChat`;
        reqData = { message: content };
      } else {
        url = `${bot.url}/api/v1/sendMessage`;
        reqData = {
          message: content,
          sessionId: session.sessionId.split('-')[1],
        };
      }

      if (this.isAudioMessage(content) && msg) {
        try {
          this.logger.debug(`[EvolutionBot] Downloading audio for Whisper transcription`);
          const transcription = await this.openaiService.speechToText(msg, instance);
          if (transcription) {
            reqData.message = `[audio] ${transcription}`;
          }
        } catch (err) {
          this.logger.error(`[EvolutionBot] Failed to transcribe audio: ${err}`);
        }
      }

      const response = await axios.post(url, reqData);

      // Process the response and send the messages to WhatsApp
      await this.sendWAMessage(
        instance,
        session,
        settings,
        remoteJid,
        response?.data?.messages,
        response?.data?.input,
        response?.data?.clientSideActions,
      );
    } catch (error) {
      this.logger.error(`Error in sendMessageToBot for Typebot: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Initialize a new Typebot session
   */
  private async initTypebotSession(
    instance: any,
    session: IntegrationSession,
    bot: TypebotModel,
    remoteJid: string,
    pushName: string,
    prefilledVariables?: any,
  ): Promise<void> {
    const id = Math.floor(Math.random() * 10000000000).toString();

    try {
      const version = this.configService?.get<Typebot>('TYPEBOT').API_VERSION;
      let url: string;
      let reqData: {};

      if (version === 'latest') {
        url = `${bot.url}/api/v1/typebots/${bot.typebot}/startChat`;
        reqData = {
          prefilledVariables: {
            ...(prefilledVariables || {}),
            remoteJid: remoteJid,
            pushName: pushName || '',
            instanceName: instance.name,
            serverUrl: this.configService?.get<HttpServer>('SERVER').URL,
            apiKey: this.configService?.get<Auth>('AUTHENTICATION').API_KEY.KEY,
            ownerJid: instance.number,
          },
        };
      } else {
        url = `${bot.url}/api/v1/sendMessage`;
        reqData = {
          startParams: {
            publicId: bot.typebot,
            prefilledVariables: {
              ...(prefilledVariables || {}),
              remoteJid: remoteJid,
              pushName: pushName || '',
              instanceName: instance.name,
              serverUrl: this.configService?.get<HttpServer>('SERVER').URL,
              apiKey: this.configService?.get<Auth>('AUTHENTICATION').API_KEY.KEY,
              ownerJid: instance.number,
            },
          },
        };
      }

      const request = await axios.post(url, reqData);

      // Create or update session with the Typebot session ID
      let updatedSession = session;
      if (request?.data?.sessionId) {
        if (session) {
          updatedSession = await this.prismaRepository.integrationSession.update({
            where: { id: session.id },
            data: {
              sessionId: `${id}-${request.data.sessionId}`,
              status: 'opened',
              awaitUser: false,
            },
          });
        } else {
          updatedSession = await this.prismaRepository.integrationSession.create({
            data: {
              remoteJid: remoteJid,
              pushName: pushName || '',
              sessionId: `${id}-${request.data.sessionId}`,
              status: 'opened',
              parameters: {
                ...(prefilledVariables || {}),
                remoteJid: remoteJid,
                pushName: pushName || '',
                instanceName: instance.name,
                serverUrl: this.configService?.get<HttpServer>('SERVER').URL,
                apiKey: this.configService?.get<Auth>('AUTHENTICATION').API_KEY.KEY,
                ownerJid: instance.number,
              },
              awaitUser: false,
              botId: bot.id,
              instanceId: instance.id,
              type: 'typebot',
            },
          });
        }
      }

      if (request?.data?.messages?.length > 0) {
        // Process the response and send the messages to WhatsApp
        await this.sendWAMessage(
          instance,
          updatedSession,
          {
            expire: bot.expire,
            keywordFinish: bot.keywordFinish,
            delayMessage: bot.delayMessage,
            unknownMessage: bot.unknownMessage,
            listeningFromMe: bot.listeningFromMe,
            stopBotFromMe: bot.stopBotFromMe,
            keepOpen: bot.keepOpen,
          },
          remoteJid,
          request.data.messages,
          request.data.input,
          request.data.clientSideActions,
        );
      }
    } catch (error) {
      this.logger.error(`Error initializing Typebot session: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Send WhatsApp message with Typebot responses
   * This handles the specific formatting and structure of Typebot responses
   */
  public async sendWAMessage(
    instance: any,
    session: IntegrationSession,
    settings: {
      expire: number;
      keywordFinish: string;
      delayMessage: number;
      unknownMessage: string;
      listeningFromMe: boolean;
      stopBotFromMe: boolean;
      keepOpen: boolean;
    },
    remoteJid: string,
    messages: any,
    input: any,
    clientSideActions: any,
  ) {
    if (!messages || messages.length === 0) {
      return;
    }

    try {
      await this.processTypebotMessages(instance, session, settings, remoteJid, messages, input, clientSideActions);
    } catch (err) {
      this.logger.error(`Error processing Typebot messages: ${err}`);
    }
  }

  /**
   * Process Typebot-specific message formats and send to WhatsApp
   */
  private async processTypebotMessages(
    instance: any,
    session: IntegrationSession,
    settings: {
      expire: number;
      keywordFinish: string;
      delayMessage: number;
      unknownMessage: string;
      listeningFromMe: boolean;
      stopBotFromMe: boolean;
      keepOpen: boolean;
    },
    remoteJid: string,
    messages: any,
    input: any,
    clientSideActions: any,
  ) {
    // Helper to find an item in an array and calculate wait time based on delay settings
    const findItemAndGetSecondsToWait = (array, targetId) => {
      const index = array.findIndex((item) => item.id === targetId);
      if (index === -1) return 0;
      return index * (settings.delayMessage || 0);
    };

    // Helper to apply formatting to message content
    const applyFormatting = (element) => {
      if (!element) return '';

      let formattedText = '';

      if (typeof element === 'string') {
        formattedText = element;
      } else if (element.text) {
        formattedText = element.text;
      } else if (element.type === 'text' && element.content) {
        formattedText = element.content.text || '';
      } else if (element.content && element.content.richText) {
        // Handle Typebot's rich text format
        formattedText = element.content.richText.reduce((acc, item) => {
          let text = item.text || '';

          // Apply bold formatting
          if (item.bold) text = `*${text}*`;

          // Apply italic formatting
          if (item.italic) text = `_${text}_`;

          // Apply strikethrough formatting (if supported)
          if (item.strikethrough) text = `~${text}~`;

          // Apply URL if present (convert to Markdown style link)
          if (item.url) text = `[${text}](${item.url})`;

          return acc + text;
        }, '');
      }

      return formattedText;
    };

    // Process each message
    for (const message of messages) {
      // Handle text type messages
      if (message.type === 'text') {
        const wait = findItemAndGetSecondsToWait(messages, message.id);
        const content = applyFormatting(message);

        // Skip empty messages
        if (!content) continue;

        // Check for WhatsApp list format
        const listMatch = content.match(/\[list:(.+?)\]\[(.*?)\]/s);
        if (listMatch) {
          const { sections, buttonText } = this.parseListFormat(content);

          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000));

          // Send as WhatsApp list
          // Using instance directly since waMonitor might not have sendListMessage
          await instance.sendListMessage({
            number: remoteJid.split('@')[0],
            sections,
            buttonText,
          });
          continue;
        }

        // Check for WhatsApp button format
        const buttonMatch = content.match(/\[button:(.+?)\]/);
        if (buttonMatch) {
          const { text, buttons } = this.parseButtonFormat(content);

          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000));

          // Send as WhatsApp buttons
          await instance.sendButtonMessage({
            number: remoteJid.split('@')[0],
            text,
            buttons,
          });
          continue;
        }

        // Process for standard text messages
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        await this.sendMessageWhatsApp(instance, remoteJid, content, settings);
      }

      // Handle image type messages
      else if (message.type === 'image') {
        const url = message.content?.url || message.content?.imageUrl || '';
        if (!url) continue;

        const caption = message.content?.caption || '';
        const wait = findItemAndGetSecondsToWait(messages, message.id);

        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000));

        // Send image to WhatsApp
        await instance.sendMediaMessage({
          number: remoteJid.split('@')[0],
          type: 'image',
          media: url,
          caption,
        });
      }

      // Handle other media types (video, audio, etc.)
      else if (['video', 'audio', 'file'].includes(message.type)) {
        const mediaType = message.type;
        const url = message.content?.url || '';
        if (!url) continue;

        const caption = message.content?.caption || '';
        const wait = findItemAndGetSecondsToWait(messages, message.id);

        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait * 1000));

        // Send media to WhatsApp
        await instance.sendMediaMessage({
          number: remoteJid.split('@')[0],
          type: mediaType,
          media: url,
          caption,
        });
      }
    }

    // Check if we need to update the session status based on input/client actions
    if (input && input.type === 'choice input') {
      await this.prismaRepository.integrationSession.update({
        where: { id: session.id },
        data: { awaitUser: true },
      });
    } else if (!input && !clientSideActions) {
      // If no input or actions, close the session or keep it open based on settings
      if (settings.keepOpen) {
        await this.prismaRepository.integrationSession.update({
          where: { id: session.id },
          data: { status: 'closed' },
        });
      } else {
        await this.prismaRepository.integrationSession.deleteMany({
          where: { id: session.id },
        });
      }
    }
  }

  /**
   * Parse WhatsApp list format from Typebot text
   */
  private parseListFormat(text: string): { sections: any[]; buttonText: string } {
    try {
      const regex = /\[list:(.+?)\]\[(.*?)\]/s;
      const match = regex.exec(text);

      if (!match) return { sections: [], buttonText: 'Menu' };

      const listContent = match[1];
      const buttonText = match[2] || 'Menu';

      // Parse list sections from content
      const sectionStrings = listContent.split(/(?=\{section:)/s);
      const sections = [];

      for (const sectionString of sectionStrings) {
        if (!sectionString.trim()) continue;

        const sectionMatch = sectionString.match(/\{section:(.+?)\}\[(.*?)\]/s);
        if (!sectionMatch) continue;

        const title = sectionMatch[1];
        const rowsContent = sectionMatch[2];

        const rows = rowsContent
          .split(/(?=\[row:)/s)
          .map((rowString) => {
            const rowMatch = rowString.match(/\[row:(.+?)\]\[(.+?)\]/);
            if (!rowMatch) return null;

            return {
              title: rowMatch[1],
              id: rowMatch[2],
              description: '',
            };
          })
          .filter(Boolean);

        if (rows.length > 0) {
          sections.push({
            title,
            rows,
          });
        }
      }

      return { sections, buttonText };
    } catch (error) {
      this.logger.error(`Error parsing list format: ${error}`);
      return { sections: [], buttonText: 'Menu' };
    }
  }

  /**
   * Parse WhatsApp button format from Typebot text
   */
  private parseButtonFormat(text: string): { text: string; buttons: any[] } {
    try {
      const regex = /\[button:(.+?)\]/g;
      let match;
      const buttons = [];
      let cleanedText = text;

      // Extract all button definitions and build buttons array
      while ((match = regex.exec(text)) !== null) {
        const buttonParts = match[1].split('|');
        if (buttonParts.length >= 1) {
          const buttonText = buttonParts[0].trim();
          const buttonId = buttonParts.length > 1 ? buttonParts[1].trim() : buttonText;

          buttons.push({
            buttonId,
            buttonText: { displayText: buttonText },
            type: 1,
          });

          // Remove button definition from clean text
          cleanedText = cleanedText.replace(match[0], '');
        }
      }

      cleanedText = cleanedText.trim();

      return {
        text: cleanedText,
        buttons,
      };
    } catch (error) {
      this.logger.error(`Error parsing button format: ${error}`);
      return { text, buttons: [] };
    }
  }
  /**
   * Simplified method that matches the base class pattern
   * This should be the preferred way for the controller to call
   */
  public async processTypebot(
    instance: any,
    remoteJid: string,
    bot: TypebotModel,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ): Promise<void> {
    return this.process(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }
}
