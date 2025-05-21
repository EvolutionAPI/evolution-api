/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { Auth, ConfigService, HttpServer } from '@config/env.config';
import { Flowise, FlowiseSetting, IntegrationSession } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';

import { BaseChatbotService } from '../../base-chatbot.service';

export class FlowiseService extends BaseChatbotService<Flowise, FlowiseSetting> {
  constructor(waMonitor: WAMonitoringService, configService: ConfigService, prismaRepository: PrismaRepository) {
    super(waMonitor, prismaRepository, 'FlowiseService', configService);
  }

  /**
   * Get the bot type identifier
   */
  protected getBotType(): string {
    return 'flowise';
  }

  /**
   * Send a message to the Flowise API
   */
  protected async sendMessageToBot(
    instance: any,
    session: IntegrationSession,
    settings: FlowiseSetting,
    bot: Flowise,
    remoteJid: string,
    pushName: string,
    content: string,
    msg?: any,
  ): Promise<void> {
    try {
      const payload: any = {
        question: content,
        overrideConfig: {
          sessionId: remoteJid,
          vars: {
            remoteJid: remoteJid,
            pushName: pushName,
            instanceName: instance.instanceName,
            serverUrl: this.configService.get<HttpServer>('SERVER').URL,
            apiKey: this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY,
          },
        },
      };

      if (this.isImageMessage(content)) {
        const contentSplit = content.split('|');

        payload.uploads = [
          {
            data: contentSplit[1].split('?')[0],
            type: 'url',
            name: 'Flowise.png',
            mime: 'image/png',
          },
        ];
        payload.question = contentSplit[2] || content;
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

      const endpoint = bot.apiUrl;

      if (!endpoint) {
        this.logger.error('No Flowise endpoint defined');
        return;
      }

      const response = await axios.post(endpoint, payload, {
        headers,
      });

      if (instance.integration === Integration.WHATSAPP_BAILEYS) {
        await instance.client.sendPresenceUpdate('paused', remoteJid);
      }

      const message = response?.data?.text;

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
