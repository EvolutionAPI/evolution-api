// ──────────────────────────────────────────────────────────────
//  GhostSender — Envio de Mensagens
// ──────────────────────────────────────────────────────────────

import { EvolutionClient } from '../core/client';
import {
  SendTextDto,
  SendMediaDto,
  SendReactionDto,
  SendAudioDto,
  SendLocationDto,
  SendContactDto,
  SendPollDto,
  SendListDto,
  SendButtonsDto,
  MessageSentResult,
} from '../core/types';
import { logger } from '../config';

export class MessageService {
  constructor(private readonly client: EvolutionClient) {}

  /** Envia mensagem de texto */
  async sendText(instanceName: string, dto: SendTextDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Texto → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendText/${instanceName}`, dto);
  }

  /** Envia mídia (imagem, vídeo, documento) por URL ou base64 */
  async sendMedia(instanceName: string, dto: SendMediaDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Mídia (${dto.mediatype}) → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendMedia/${instanceName}`, dto);
  }

  /** Envia áudio (nota de voz) — aparece como PTT no WhatsApp */
  async sendAudio(instanceName: string, dto: SendAudioDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Áudio PTT → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendWhatsAppAudio/${instanceName}`, {
      ...dto,
      encoding: dto.encoding ?? true,
    });
  }

  /** Envia reação (emoji) a uma mensagem */
  async sendReaction(instanceName: string, dto: SendReactionDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Reação "${dto.reaction}" via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendReaction/${instanceName}`, dto);
  }

  /** Envia localização */
  async sendLocation(instanceName: string, dto: SendLocationDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Localização → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendLocation/${instanceName}`, dto);
  }

  /** Envia card de contato */
  async sendContact(instanceName: string, dto: SendContactDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Contato → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendContact/${instanceName}`, dto);
  }

  /** Envia enquete */
  async sendPoll(instanceName: string, dto: SendPollDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Enquete → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendPoll/${instanceName}`, dto);
  }

  /** Envia lista interativa */
  async sendList(instanceName: string, dto: SendListDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Lista → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendList/${instanceName}`, dto);
  }

  /** Envia botões interativos */
  async sendButtons(instanceName: string, dto: SendButtonsDto): Promise<MessageSentResult> {
    logger.debug(`[MSG] Botões → ${dto.number} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendButtons/${instanceName}`, dto);
  }

  /**
   * Envia texto com template de variáveis.
   * Substitui {{nome}}, {{empresa}}, etc. pelo valor do mapa.
   */
  async sendTemplate(
    instanceName: string,
    number: string,
    template: string,
    variables: Record<string, string>,
    options?: Partial<Omit<SendTextDto, 'number' | 'text'>>,
  ): Promise<MessageSentResult> {
    const text = interpolate(template, variables);
    return this.sendText(instanceName, { number, text, ...options });
  }

  /** Encaminha uma mensagem existente */
  async forwardMessage(
    instanceName: string,
    toNumber: string,
    messageKey: { remoteJid: string; fromMe: boolean; id: string },
  ): Promise<MessageSentResult> {
    logger.debug(`[MSG] Forward → ${toNumber} via ${instanceName}`);
    return this.client.post<MessageSentResult>(`/message/sendText/${instanceName}`, {
      number: toNumber,
      text: '',
      quoted: { key: messageKey },
    });
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
