/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService, HttpServer } from '@config/env.config';
import { EvolutionBot, EvolutionBotSetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';

import { BaseChatbotService } from '../../base-chatbot.service';
import { OpenaiService } from '../../openai/services/openai.service';

export class EvolutionBotService extends BaseChatbotService<EvolutionBot, EvolutionBotSetting> {
  private openaiService: OpenaiService;

  constructor(
    waMonitor: WAMonitoringService,
    prismaRepository: PrismaRepository,
    configService: ConfigService,
    openaiService: OpenaiService,
  ) {
    super(waMonitor, prismaRepository, 'EvolutionBotService', configService);
    this.openaiService = openaiService;
  }

  /**
   * Get the bot type identifier
   */
  protected getBotType(): string {
    return 'evolution';
  }

  /**
   * Send a message to the Evolution Bot API
   */
  protected async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    settings: EvolutionBotSetting,
    bot: EvolutionBot,
    remoteJid: string,
    pushName: string,
    content: string,
    msg?: any,
  ): Promise<void> {
    try {
      const payload: any = {
        inputs: {
          sessionId: session.id,
          remoteJid: remoteJid,
          pushName: pushName,
          fromMe: msg?.key?.fromMe,
          instanceName: instance.instanceName,
          serverUrl: this.configService.get<HttpServer>('SERVER').URL,
          apiKey: instance.token,
        },
        query: content,
        conversation_id: session.sessionId === remoteJid ? undefined : session.sessionId,
        user: remoteJid,
      };

      if (this.isAudioMessage(content) && msg) {
        try {
          this.logger.debug(`[EvolutionBot] Downloading audio for Whisper transcription`);
          const transcription = await this.openaiService.speechToText(msg, instance);
          if (transcription) {
            payload.query = `[audio] ${transcription}`;
          }
        } catch (err) {
          this.logger.error(`[EvolutionBot] Failed to transcribe audio: ${err}`);
        }
      }

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

      const endpoint = bot.apiUrl;

      if (!endpoint) {
        this.logger.error('No Evolution Bot endpoint defined');
        return;
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

      this.logger.debug(`[EvolutionBot] Sending request to endpoint: ${endpoint}`);
      this.logger.debug(`[EvolutionBot] Payload being sent: ${JSON.stringify(payload, null, 2)}`);
      this.logger.debug(`[EvolutionBot] Headers being sent: ${JSON.stringify(headers, null, 2)}`);

      const response = await axios.post(endpoint, payload, {
        headers,
      });

      this.logger.debug(`[EvolutionBot] Received response status: ${response.status}`);
      this.logger.debug(`[EvolutionBot] Received response data: ${JSON.stringify(response.data, null, 2)}`);

      if (instance.integration === Integration.WHATSAPP_BAILEYS) {
        await instance.client.sendPresenceUpdate('paused', remoteJid);
      }

      let message = response?.data?.message;
      const linkPreview = response?.data?.linkPreview; // Extract linkPreview from n8n response

      this.logger.debug(`[EvolutionBot] Raw message from response: ${JSON.stringify(message)}`);
      this.logger.debug(`[EvolutionBot] LinkPreview setting from response: ${linkPreview}`);

      if (message && typeof message === 'string' && message.startsWith("'") && message.endsWith("'")) {
        const innerContent = message.slice(1, -1);
        if (!innerContent.includes("'")) {
          message = innerContent;
          this.logger.debug(`[EvolutionBot] Message cleaned (removed quotes): ${message}`);
        }
      }

      if (message) {
        this.logger.debug(`[EvolutionBot] Sending message to WhatsApp: ${message}`);
        this.logger.debug(`[EvolutionBot] Using linkPreview: ${linkPreview}`);
        // Send message directly with linkPreview option
        await instance.textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            text: message,
            linkPreview: linkPreview, // Use linkPreview from n8n response
          },
          false,
        );
        this.logger.debug(`[EvolutionBot] Message sent successfully to WhatsApp`);
      } else {
        this.logger.warn(`[EvolutionBot] No message content received from bot response`);
      }

      // Send telemetry
      sendTelemetry('/message/sendText');
    } catch (error) {
      this.logger.error(`Error in sendMessageToBot: ${error.message || JSON.stringify(error)}`);
      return;
    }
  }
}
