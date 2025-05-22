/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { Auth, ConfigService, HttpServer } from '@config/env.config';
import { EvolutionBot, EvolutionBotSetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';

import { BaseChatbotService } from '../../base-chatbot.service';
import { OpenaiService } from '../../openai/services/openai.service';

export class EvolutionBotService extends BaseChatbotService<EvolutionBot, EvolutionBotSetting> {
  private openaiService: OpenaiService;

  constructor(
    waMonitor: WAMonitoringService,
    configService: ConfigService,
    prismaRepository: PrismaRepository,
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
          const transcription = await this.openaiService.speechToText(msg);
          if (transcription) {
            payload.query = transcription;
          } else {
            payload.query = '[Audio message could not be transcribed]';
          }
        } catch (err) {
          this.logger.error(`[EvolutionBot] Failed to transcribe audio: ${err}`);
          payload.query = '[Audio message could not be transcribed]';
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

      if (instance.integration === Integration.WHATSAPP_BAILEYS) {
        await instance.client.sendPresenceUpdate('paused', remoteJid);
      }

      let message = response?.data?.message;

      if (message && typeof message === 'string' && message.startsWith("'") && message.endsWith("'")) {
        const innerContent = message.slice(1, -1);
        if (!innerContent.includes("'")) {
          message = innerContent;
        }
      }

      if (message) {
        // Use the base class method to send the message to WhatsApp
        await this.sendMessageWhatsApp(instance, remoteJid, message, settings);
      }

      // Send telemetry
      sendTelemetry('/message/sendText');
    } catch (error) {
      this.logger.error(`Error in sendMessageToBot: ${error.message || JSON.stringify(error)}`);
      return;
    }
  }
}
