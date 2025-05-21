import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService } from '@config/env.config';
import { Evoai, EvoaiSetting, IntegrationSession } from '@prisma/client';
import axios from 'axios';
import { downloadMediaMessage } from 'baileys';
import { v4 as uuidv4 } from 'uuid';

import { BaseChatbotService } from '../../base-chatbot.service';

export class EvoaiService extends BaseChatbotService<Evoai, EvoaiSetting> {
  constructor(waMonitor: WAMonitoringService, prismaRepository: PrismaRepository, configService: ConfigService) {
    super(waMonitor, prismaRepository, 'EvoaiService', configService);
  }

  /**
   * Return the bot type for EvoAI
   */
  protected getBotType(): string {
    return 'evoai';
  }

  public async createNewSession(instance: InstanceDto, data: any) {
    return super.createNewSession(instance, data, 'evoai');
  }

  /**
   * Override the process method to directly handle audio messages
   */
  public async process(
    instance: any,
    remoteJid: string,
    bot: Evoai,
    session: IntegrationSession,
    settings: EvoaiSetting,
    content: string,
    pushName?: string,
    msg?: any,
  ): Promise<void> {
    try {
      this.logger.debug(`[EvoAI] Processing message with custom process method`);

      // Check if this is an audio message that we should try to transcribe
      if (msg?.messageType === 'audioMessage' && msg?.message?.audioMessage) {
        this.logger.debug(`[EvoAI] Detected audio message, attempting transcription`);

        try {
          // Download the audio using the whole msg object
          const mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
          this.logger.debug(`[EvoAI] Downloaded audio: ${mediaBuffer?.length || 0} bytes`);

          // Transcribe with OpenAI's Whisper
          const transcribedText = await this.speechToText(mediaBuffer);
          this.logger.debug(`[EvoAI] Transcription result: ${transcribedText || 'FAILED'}`);

          if (transcribedText) {
            // Use the transcribed text instead of the original content
            this.logger.debug(`[EvoAI] Using transcribed text: ${transcribedText}`);

            // Call the parent process method with the transcribed text
            return super.process(instance, remoteJid, bot, session, settings, transcribedText, pushName, msg);
          }
        } catch (err) {
          this.logger.error(`[EvoAI] Audio transcription error: ${err}`);
        }
      }

      // For non-audio messages or if transcription failed, proceed normally
      return super.process(instance, remoteJid, bot, session, settings, content, pushName, msg);
    } catch (error) {
      this.logger.error(`[EvoAI] Error in process: ${error}`);
      return;
    }
  }

  protected async sendMessageToBot(
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
      this.logger.debug(`[EvoAI] Sending message to bot with content: ${content}`);

      const endpoint: string = evoai.agentUrl;
      const callId = `call-${uuidv4()}`;
      const taskId = `task-${uuidv4()}`;

      // Prepare message parts
      const parts = [
        {
          type: 'text',
          text: content,
        },
      ];

      // Handle image message if present
      if (this.isImageMessage(content) && msg) {
        const contentSplit = content.split('|');
        parts[0].text = contentSplit[2] || content;

        try {
          // Download the image
          const mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
          const fileContent = Buffer.from(mediaBuffer).toString('base64');
          const fileName = contentSplit[2] || `${msg.key?.id || 'image'}.jpg`;

          parts.push({
            type: 'file',
            file: {
              name: fileName,
              bytes: fileContent,
              mimeType: 'image/jpeg',
            },
          } as any);
        } catch (fileErr) {
          this.logger.error(`[EvoAI] Failed to process image: ${fileErr}`);
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
}
