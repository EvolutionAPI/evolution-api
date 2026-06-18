// ──────────────────────────────────────────────────────────────
//  GhostSender — Agendador de Warmup (Cron)
//  Executa sessões de aquecimento automaticamente todo dia
// ──────────────────────────────────────────────────────────────

import { CronJob } from 'cron';
import { WarmupService } from './warmup.service';
import { logger } from '../config';

export interface SchedulerOptions {
  /** Expressão cron para quando iniciar (ex: '0 9 * * *' = 09:00 todo dia) */
  cronExpression?: string;
  /** Timezone (ex: 'America/Sao_Paulo') */
  timezone?: string;
  /** Executa imediatamente ao iniciar, além do cron */
  runImmediately?: boolean;
}

const DEFAULT_CRON = '0 9 * * *'; // 09:00 todo dia
const DEFAULT_TZ = 'America/Sao_Paulo';

export class WarmupScheduler {
  private job: CronJob | null = null;

  constructor(
    private readonly warmup: WarmupService,
    private readonly options: SchedulerOptions = {},
  ) {}

  start(): void {
    const cron = this.options.cronExpression ?? DEFAULT_CRON;
    const tz = this.options.timezone ?? DEFAULT_TZ;

    logger.info(`[Scheduler] Agendando warmup: "${cron}" (${tz})`);

    this.job = new CronJob(
      cron,
      async () => {
        logger.info('[Scheduler] Iniciando sessão de warmup agendada...');
        try {
          const session = await this.warmup.runDailySession();
          logger.info(`[Scheduler] Sessão concluída: ${session.messagesSent} msgs | Fase ${session.phase}`);
        } catch (err) {
          logger.error(`[Scheduler] Erro na sessão de warmup: ${err instanceof Error ? err.message : err}`);
        }
      },
      null,
      true,
      tz,
    );

    logger.info('[Scheduler] Warmup agendado. Aguardando próxima execução...');

    if (this.options.runImmediately) {
      logger.info('[Scheduler] Executando imediatamente por configuração...');
      this.runNow();
    }
  }

  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('[Scheduler] Agendamento encerrado.');
    }
  }

  async runNow(): Promise<void> {
    logger.info('[Scheduler] Executando warmup agora (manual)...');
    try {
      const session = await this.warmup.runDailySession();
      logger.info(`[Scheduler] Concluído: ${session.messagesSent} msgs | Dia ${session.phase}`);
    } catch (err) {
      logger.error(`[Scheduler] Erro: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  nextExecution(): Date | null {
    return this.job?.nextDate().toJSDate() ?? null;
  }

  isRunning(): boolean {
    return this.job !== null && this.job.running;
  }
}
