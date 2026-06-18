// ──────────────────────────────────────────────────────────────
//  GhostSender — Disparo em Massa (Blast)
// ──────────────────────────────────────────────────────────────

import pLimit from 'p-limit';
import { MessageService } from './message.service';
import { ContactService } from './contact.service';
import { BlastConfig, BlastReport, BlastResult, BlastTarget } from '../core/types';
import { logger } from '../config';

export class BlastService {
  constructor(
    private readonly messages: MessageService,
    private readonly contacts: ContactService,
  ) {}

  /**
   * Disparo em massa com suporte a:
   *  - Templates com variáveis por contato
   *  - Verificação prévia de números
   *  - Controle de concorrência
   *  - Delay entre envios
   *  - Relatório detalhado
   */
  async run(config: BlastConfig): Promise<BlastReport> {
    const {
      instance,
      message,
      targets,
      concurrency = 5,
      delayBetweenMs = 3_000,
      verifyNumbers = true,
    } = config;

    const report: BlastReport = {
      total: targets.length,
      sent: 0,
      failed: 0,
      invalid: 0,
      results: [],
      startedAt: new Date(),
    };

    logger.info(`[Blast] Iniciando disparo para ${targets.length} contato(s) via "${instance}"...`);

    let validTargets = targets;

    if (verifyNumbers) {
      logger.info('[Blast] Verificando números antes do disparo...');
      const numbers = targets.map((t) => t.number);
      const checkResults = await this.contacts.filterValid(instance, numbers);
      const validSet = new Set(checkResults.map((r) => r.number.replace(/\D/g, '')));

      const invalidTargets = targets.filter((t) => !validSet.has(t.number.replace(/\D/g, '')));
      for (const t of invalidTargets) {
        report.results.push({ number: t.number, name: t.name, status: 'invalid' });
        report.invalid++;
      }

      validTargets = targets.filter((t) => validSet.has(t.number.replace(/\D/g, '')));
      logger.info(`[Blast] ${validTargets.length} números válidos para envio.`);
    }

    const limit = pLimit(concurrency);
    const tasks = validTargets.map((target, index) =>
      limit(async (): Promise<void> => {
        if (index > 0) await delay(randomDelay(delayBetweenMs, delayBetweenMs * 1.5));

        const result = await this.sendToTarget(instance, target, message);
        report.results.push(result);

        if (result.status === 'sent') {
          report.sent++;
          logger.info(`[Blast] ✓ ${result.number}${result.name ? ` (${result.name})` : ''}`);
        } else {
          report.failed++;
          logger.warn(`[Blast] ✗ ${result.number} — ${result.error}`);
        }
      }),
    );

    await Promise.all(tasks);

    report.finishedAt = new Date();
    report.durationMs = report.finishedAt.getTime() - report.startedAt.getTime();

    logger.info(
      `[Blast] Concluído: ${report.sent} enviados / ${report.failed} falhas / ${report.invalid} inválidos` +
        ` | Duração: ${(report.durationMs / 1000).toFixed(1)}s`,
    );

    return report;
  }

  /** Disparo com mídia (imagem/vídeo/documento) para todos os alvos */
  async runWithMedia(config: BlastConfig & { mediaUrl: string; mediaType: 'image' | 'video' | 'document'; caption?: string }): Promise<BlastReport> {
    const { instance, targets, concurrency = 5, delayBetweenMs = 3_000, mediaUrl, mediaType, caption, verifyNumbers = true } = config;

    const report: BlastReport = {
      total: targets.length,
      sent: 0,
      failed: 0,
      invalid: 0,
      results: [],
      startedAt: new Date(),
    };

    logger.info(`[Blast] Disparo com mídia (${mediaType}) para ${targets.length} contato(s)...`);

    let validTargets = targets;

    if (verifyNumbers) {
      const numbers = targets.map((t) => t.number);
      const checkResults = await this.contacts.filterValid(instance, numbers);
      const validSet = new Set(checkResults.map((r) => r.number.replace(/\D/g, '')));
      validTargets = targets.filter((t) => validSet.has(t.number.replace(/\D/g, '')));
    }

    const limit = pLimit(concurrency);
    const tasks = validTargets.map((target, index) =>
      limit(async (): Promise<void> => {
        if (index > 0) await delay(randomDelay(delayBetweenMs, delayBetweenMs * 1.5));
        try {
          const result = await this.messages.sendMedia(instance, {
            number: target.number,
            mediatype: mediaType,
            media: mediaUrl,
            caption: caption ?? '',
          });
          report.results.push({ number: target.number, name: target.name, status: 'sent', messageId: result.key.id, sentAt: new Date() });
          report.sent++;
          logger.info(`[Blast] ✓ Mídia → ${target.number}`);
        } catch (err: unknown) {
          report.results.push({ number: target.number, name: target.name, status: 'failed', error: errorMessage(err) });
          report.failed++;
          logger.warn(`[Blast] ✗ ${target.number} — ${errorMessage(err)}`);
        }
      }),
    );

    await Promise.all(tasks);

    report.finishedAt = new Date();
    report.durationMs = report.finishedAt.getTime() - report.startedAt.getTime();

    logger.info(`[Blast] Concluído com mídia: ${report.sent} ✓ / ${report.failed} ✗`);
    return report;
  }

  /** Gera relatório em texto formatado */
  formatReport(report: BlastReport): string {
    const duration = report.durationMs ? (report.durationMs / 1000).toFixed(1) : '?';
    const lines: string[] = [
      '═══════════════════════════════════════',
      '  GhostSender — Relatório de Disparo',
      '═══════════════════════════════════════',
      `  Total    : ${report.total}`,
      `  Enviados : ${report.sent}`,
      `  Falhas   : ${report.failed}`,
      `  Inválidos: ${report.invalid}`,
      `  Duração  : ${duration}s`,
      `  Início   : ${report.startedAt.toLocaleString('pt-BR')}`,
      '',
      '  Detalhes:',
    ];

    for (const r of report.results) {
      const icon = r.status === 'sent' ? '✓' : r.status === 'invalid' ? '◌' : '✗';
      const label = r.name ? `${r.number} (${r.name})` : r.number;
      lines.push(`  ${icon} ${label}${r.error ? ` → ${r.error}` : ''}`);
    }

    lines.push('═══════════════════════════════════════');
    return lines.join('\n');
  }

  // ── Privado ────────────────────────────────────────────────

  private async sendToTarget(
    instance: string,
    target: BlastTarget,
    message: string | ((t: BlastTarget) => string),
  ): Promise<BlastResult> {
    const text = typeof message === 'function' ? message(target) : message;
    try {
      const result = await this.messages.sendText(instance, {
        number: target.number,
        text,
      });
      return {
        number: target.number,
        name: target.name,
        status: 'sent',
        messageId: result.key.id,
        sentAt: new Date(),
      };
    } catch (err: unknown) {
      return {
        number: target.number,
        name: target.name,
        status: 'failed',
        error: errorMessage(err),
      };
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
