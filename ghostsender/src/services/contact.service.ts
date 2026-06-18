// ──────────────────────────────────────────────────────────────
//  GhostSender — Verificação e Consulta de Contatos
// ──────────────────────────────────────────────────────────────

import { EvolutionClient } from '../core/client';
import { WhatsAppNumberCheckResult, ContactProfile } from '../core/types';
import { logger } from '../config';

export class ContactService {
  constructor(private readonly client: EvolutionClient) {}

  /**
   * Verifica se um ou mais números possuem WhatsApp.
   * Retorna detalhes de cada número (existe, jid, nome).
   */
  async verifyNumbers(
    instanceName: string,
    numbers: string[],
  ): Promise<WhatsAppNumberCheckResult[]> {
    logger.info(`[Contact] Verificando ${numbers.length} número(s) via "${instanceName}"...`);

    const cleanNumbers = numbers.map(cleanNumber);

    const result = await this.client.post<{ exists: boolean; jid: string; number: string; name?: string }[]>(
      `/chat/whatsappNumbers/${instanceName}`,
      { numbers: cleanNumbers },
    );

    return result.map((r) => ({
      number: r.number,
      exists: r.exists,
      jid: r.jid,
      name: r.name,
    }));
  }

  /**
   * Verifica um único número.
   * Retorna `null` se o número não possui WhatsApp.
   */
  async verifyOne(
    instanceName: string,
    number: string,
  ): Promise<WhatsAppNumberCheckResult | null> {
    const results = await this.verifyNumbers(instanceName, [number]);
    const r = results[0];
    return r?.exists ? r : null;
  }

  /**
   * Filtra uma lista de números, retornando apenas os que têm WhatsApp.
   * Processa em lotes para evitar timeouts.
   */
  async filterValid(
    instanceName: string,
    numbers: string[],
    batchSize = 50,
  ): Promise<WhatsAppNumberCheckResult[]> {
    const valid: WhatsAppNumberCheckResult[] = [];
    const batches = chunk(numbers, batchSize);

    for (let i = 0; i < batches.length; i++) {
      logger.info(`[Contact] Verificando lote ${i + 1}/${batches.length}...`);
      const results = await this.verifyNumbers(instanceName, batches[i]);
      valid.push(...results.filter((r) => r.exists));
      if (i < batches.length - 1) await delay(1_000);
    }

    logger.info(`[Contact] ${valid.length}/${numbers.length} números válidos encontrados.`);
    return valid;
  }

  /** Busca o perfil completo de um número */
  async fetchProfile(instanceName: string, number: string): Promise<ContactProfile | null> {
    try {
      const result = await this.client.post<ContactProfile>(`/chat/fetchProfile/${instanceName}`, {
        number: cleanNumber(number),
      });
      return result;
    } catch {
      return null;
    }
  }

  /** Busca perfil de negócio (Business) */
  async fetchBusinessProfile(instanceName: string, number: string): Promise<ContactProfile | null> {
    try {
      const result = await this.client.post<ContactProfile>(
        `/chat/fetchBusinessProfile/${instanceName}`,
        { number: cleanNumber(number) },
      );
      return result;
    } catch {
      return null;
    }
  }

  /** Lista contatos salvos em uma instância */
  async listContacts(
    instanceName: string,
    filter?: { where?: Record<string, unknown> },
  ): Promise<ContactProfile[]> {
    return this.client.post<ContactProfile[]>(`/chat/findContacts/${instanceName}`, filter ?? {});
  }

  /** Encontra mensagens de um contato */
  async findMessages(
    instanceName: string,
    number: string,
    limit = 20,
  ): Promise<Record<string, unknown>[]> {
    return this.client.post<Record<string, unknown>[]>(`/chat/findMessages/${instanceName}`, {
      where: { key: { remoteJid: toJid(number) } },
      limit,
    });
  }

  /** Marca mensagens como lidas */
  async markAsRead(
    instanceName: string,
    keys: Array<{ id: string; remoteJid: string; fromMe: boolean }>,
  ): Promise<void> {
    await this.client.post(`/chat/markMessageAsRead/${instanceName}`, { readMessages: keys });
  }
}

// ── Utils ────────────────────────────────────────────────────

function cleanNumber(number: string): string {
  return number.replace(/\D/g, '');
}

function toJid(number: string): string {
  const clean = cleanNumber(number);
  return clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
