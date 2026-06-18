// ──────────────────────────────────────────────────────────────
//  GhostSender — Gerenciamento de Instâncias
// ──────────────────────────────────────────────────────────────

import { EvolutionClient } from '../core/client';
import { Instance, CreateInstanceDto, ConnectionStatus } from '../core/types';
import { logger } from '../config';

export class InstanceService {
  constructor(private readonly client: EvolutionClient) {}

  /** Cria uma nova instância WhatsApp */
  async create(dto: CreateInstanceDto): Promise<Instance> {
    logger.info(`[Instance] Criando instância "${dto.instanceName}"...`);
    const result = await this.client.post<{ instance: Instance }>('/instance/create', {
      ...dto,
      qrcode: dto.qrcode ?? true,
      integration: dto.integration ?? 'WHATSAPP-BAILEYS',
    });
    logger.info(`[Instance] Instância "${dto.instanceName}" criada.`);
    return result.instance;
  }

  /** Lista todas as instâncias */
  async list(): Promise<Instance[]> {
    const result = await this.client.get<Instance[]>('/instance/fetchInstances');
    return result ?? [];
  }

  /** Retorna o estado de conexão de uma instância */
  async connectionState(instanceName: string): Promise<ConnectionStatus> {
    const result = await this.client.get<{ instance: { state: ConnectionStatus } }>(
      `/instance/connectionState/${instanceName}`,
    );
    return result.instance.state;
  }

  /** Conecta (ou exibe QR code) de uma instância */
  async connect(instanceName: string): Promise<{ qrcode?: { base64: string }; pairingCode?: string }> {
    logger.info(`[Instance] Conectando "${instanceName}"...`);
    return this.client.get(`/instance/connect/${instanceName}`);
  }

  /** Desconecta (logout) uma instância sem deletá-la */
  async logout(instanceName: string): Promise<void> {
    logger.warn(`[Instance] Logout de "${instanceName}"...`);
    await this.client.delete(`/instance/logout/${instanceName}`);
  }

  /** Remove permanentemente uma instância */
  async delete(instanceName: string): Promise<void> {
    logger.warn(`[Instance] Deletando instância "${instanceName}"...`);
    await this.client.delete(`/instance/delete/${instanceName}`);
  }

  /** Reinicia uma instância */
  async restart(instanceName: string): Promise<void> {
    logger.info(`[Instance] Reiniciando "${instanceName}"...`);
    await this.client.post(`/instance/restart/${instanceName}`);
  }

  /** Aguarda até que a instância esteja conectada (open) */
  async waitUntilConnected(
    instanceName: string,
    timeoutMs = 120_000,
    pollIntervalMs = 3_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    logger.info(`[Instance] Aguardando conexão de "${instanceName}"...`);

    while (Date.now() < deadline) {
      const state = await this.connectionState(instanceName);
      if (state === 'open') {
        logger.info(`[Instance] "${instanceName}" conectada.`);
        return;
      }
      await delay(pollIntervalMs);
    }

    throw new Error(`[Instance] Timeout: "${instanceName}" não conectou em ${timeoutMs / 1000}s`);
  }

  /** Verifica se uma instância está conectada */
  async isConnected(instanceName: string): Promise<boolean> {
    try {
      const state = await this.connectionState(instanceName);
      return state === 'open';
    } catch {
      return false;
    }
  }

  /** Configura webhook em uma instância */
  async setWebhook(
    instanceName: string,
    webhookUrl: string,
    events: string[] = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
  ): Promise<void> {
    logger.info(`[Instance] Configurando webhook em "${instanceName}": ${webhookUrl}`);
    await this.client.post(`/webhook/set/${instanceName}`, {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
