// ──────────────────────────────────────────────────────────────
//  GhostSender — Serviço de Warmup (Aquecimento de Chips)
//  Simula conversas ultra-realistas entre instâncias WhatsApp
// ──────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { MessageService } from '../services/message.service';
import { InstanceService } from '../services/instance.service';
import { WarmupConfig, WarmupStats, WarmupPhase, WarmupSession } from '../core/types';
import {
  waitHuman,
  readingTime,
  typingTime,
  sometimes,
  pickRandom,
  phaseFromDay,
  isWithinHours,
  waitUntilAllowedHours,
  formatMs,
} from './humanizer';
import {
  pickConversation,
  humanizeText,
  REACTION_EMOJIS,
  FAREWELL_PHRASES,
  ConversationScript,
} from './conversations';
import { logger } from '../config';

const STATS_FILE = path.resolve('./ghostsender-warmup-stats.json');

export interface WarmupLogEvent {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface WarmupProgressEvent {
  sent: number;
  total: number;
  phase: WarmupPhase;
  pct: number;
}

export class WarmupService extends EventEmitter {
  private stats: WarmupStats;
  private running = false;
  private abortRequested = false;

  constructor(
    private readonly messages: MessageService,
    private readonly instances: InstanceService,
    private readonly config: WarmupConfig,
  ) {
    super();
    this.stats = this.loadStats();
  }

  // ── Público ───────────────────────────────────────────────

  /** Inicia uma sessão de aquecimento (executa até a cota diária ser atingida) */
  async runDailySession(): Promise<WarmupSession> {
    if (this.running) throw new Error('Já existe uma sessão em execução.');
    this.running = true;
    this.abortRequested = false;

    const day = this.stats.totalDays + 1;
    const phase = phaseFromDay(day, this.config.startPhase ?? 1) as WarmupPhase;
    const targetMessages = this.dailyTarget(phase);
    const pairs = this.buildInstancePairs();

    this.emit('warmup:start', { day, phase, targetMessages });
    this.log('info', `Dia ${day} | Fase ${phase}/5 | Meta: ${targetMessages} mensagens`);
    this.log('info', `Instâncias: ${this.config.instances.join(' ↔ ')}`);

    const session: WarmupSession = {
      date: new Date().toISOString(),
      phase,
      messagesSent: 0,
      pairs: pairs.map((p) => ({ sender: p[0], receiver: p[1] })),
    };

    await this.verifyInstances();

    let sent = 0;
    while (sent < targetMessages && !this.abortRequested) {
      const hourStart = this.config.hourStart ?? '08:00';
      const hourEnd = this.config.hourEnd ?? '22:00';

      if (!isWithinHours(hourStart, hourEnd)) {
        this.log('info', `Fora do horário (${hourStart}–${hourEnd}). Aguardando...`);
        await waitUntilAllowedHours(hourStart, hourEnd);
      }

      const pair = pickRandom(pairs);
      const script = pickConversation();

      const exchanged = await this.executeConversation(pair[0], pair[1], script, phase);
      sent += exchanged;
      session.messagesSent += exchanged;

      const pct = Math.round((sent / targetMessages) * 100);
      this.emit('warmup:progress', { sent, total: targetMessages, phase, pct } satisfies WarmupProgressEvent);
      this.log('info', `Progresso: ${sent}/${targetMessages} (${pct}%)`);

      if (sent < targetMessages && !this.abortRequested) {
        const pause = this.conversationPause(phase);
        this.log('debug', `Próxima conversa em ${formatMs(pause)}...`);
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
    }

    this.stats.totalDays++;
    this.stats.totalMessages += session.messagesSent;
    this.stats.currentPhase = phase;
    this.stats.sessions.push(session);
    this.saveStats();

    this.running = false;
    this.emit('warmup:end', session);
    this.log('info', `Sessão concluída! ${session.messagesSent} mensagens | Fase ${phase}`);
    return session;
  }

  /** Para a sessão em andamento graciosamente */
  abort(): void {
    if (this.running) {
      this.abortRequested = true;
      this.log('warn', 'Solicitação de parada recebida...');
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): WarmupStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { totalDays: 0, totalMessages: 0, currentPhase: 1, sessions: [] };
    this.saveStats();
    this.log('info', 'Estatísticas resetadas.');
  }

  // ── Privado ───────────────────────────────────────────────

  private async executeConversation(
    senderInstance: string,
    receiverInstance: string,
    script: ConversationScript,
    phase: WarmupPhase,
  ): Promise<number> {
    let sent = 0;

    const receiverJid = await this.getInstanceJid(receiverInstance);
    const senderJid = await this.getInstanceJid(senderInstance);

    if (!receiverJid || !senderJid) {
      this.log('warn', `JID não encontrado: ${senderInstance} ou ${receiverInstance}`);
      return 0;
    }

    const receiverNumber = jidToNumber(receiverJid);
    const senderNumber = jidToNumber(senderJid);

    this.log('debug', `Conversa [${script.category}]: ${senderInstance} → ${receiverInstance}`);

    // Delays agressivos baseados na fase
    const [minDelay, maxDelay] = this.messageDelay(phase);

    for (const turn of script.turns) {
      if (this.abortRequested) break;

      const isA = turn.role === 'A';
      const fromInstance = isA ? senderInstance : receiverInstance;
      const toNumber = isA ? receiverNumber : senderNumber;
      const text = sometimes(0.7) ? humanizeText(turn.text) : turn.text;

      if (sent > 0) {
        const readMs = Math.min(readingTime(turn.text), 4_000);
        await new Promise((resolve) => setTimeout(resolve, readMs));
      }

      const typeMs = Math.min(typingTime(text), 3_000);

      try {
        await this.messages.sendText(fromInstance, {
          number: toNumber,
          text,
          delay: typeMs,
        });

        sent++;
        this.emit('warmup:message', { from: fromInstance, to: toNumber, text });

        if (sometimes(0.12) && sent > 0) {
          await waitHuman(1_500, 4_000);
          await this.tryReaction(receiverInstance, fromInstance);
        }

        if (sometimes(0.08)) {
          await waitHuman(2_000, 6_000);
          const emoji = pickRandom(['😊', '😄', '👍', '❤️', '🙏', '🔥']);
          await this.messages.sendText(fromInstance, { number: toNumber, text: emoji });
          sent++;
        }

        await waitHuman(minDelay, maxDelay);

      } catch (err) {
        this.log('warn', `Erro ao enviar: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (sometimes(0.25)) {
      await waitHuman(3_000, 10_000);
      const farewell = pickRandom(FAREWELL_PHRASES);
      const lastIsA = script.turns[script.turns.length - 1].role === 'A';
      const fi = lastIsA ? receiverInstance : senderInstance;
      const fn = lastIsA ? senderNumber : receiverNumber;
      try {
        await this.messages.sendText(fi, { number: fn, text: farewell });
        sent++;
      } catch { /* melhor esforço */ }
    }

    return sent;
  }

  private async tryReaction(reactingInstance: string, targetInstance: string): Promise<void> {
    try {
      const jid = await this.getInstanceJid(targetInstance);
      if (!jid) return;
      await this.messages.sendReaction(reactingInstance, {
        key: { remoteJid: jid, fromMe: false, id: 'latest' },
        reaction: pickRandom(REACTION_EMOJIS),
      });
    } catch { /* reações são melhor-esforço */ }
  }

  private async verifyInstances(): Promise<void> {
    for (const name of this.config.instances) {
      const ok = await this.instances.isConnected(name);
      this.log(ok ? 'info' : 'warn', `${ok ? '✓' : '✗'} ${name} — ${ok ? 'conectada' : 'DESCONECTADA'}`);
    }
  }

  private buildInstancePairs(): Array<[string, string]> {
    const inst = this.config.instances;
    if (inst.length < 2) throw new Error('Mínimo de 2 instâncias para warmup.');
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < inst.length; i++)
      for (let j = i + 1; j < inst.length; j++) {
        pairs.push([inst[i], inst[j]]);
        pairs.push([inst[j], inst[i]]);
      }
    return pairs;
  }

  private dailyTarget(phase: WarmupPhase): number {
    const targets: Record<WarmupPhase, [number, number]> = {
      1: [20, 40],
      2: [60, 120],
      3: [150, 250],
      4: [280, 450],
      5: [500, 800],
    };
    const [min, max] = targets[phase];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Delay agressivo entre mensagens por fase (ms) */
  private messageDelay(phase: WarmupPhase): [number, number] {
    const delays: Record<WarmupPhase, [number, number]> = {
      1: [8_000, 20_000],
      2: [5_000, 12_000],
      3: [3_000, 8_000],
      4: [1_500, 5_000],
      5: [800, 3_000],
    };
    return delays[phase];
  }

  private conversationPause(phase: WarmupPhase): number {
    const pauses: Record<WarmupPhase, [number, number]> = {
      1: [20_000, 60_000],
      2: [12_000, 40_000],
      3: [8_000, 25_000],
      4: [4_000, 15_000],
      5: [2_000, 8_000],
    };
    const [min, max] = pauses[phase];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private jidCache = new Map<string, string>();

  private async getInstanceJid(name: string): Promise<string | null> {
    if (this.jidCache.has(name)) return this.jidCache.get(name)!;
    try {
      const list = await this.instances.list();
      const jid = list.find((i) => i.instanceName === name)?.ownerJid ?? null;
      if (jid) this.jidCache.set(name, jid);
      return jid;
    } catch { return null; }
  }

  private log(level: WarmupLogEvent['level'], message: string): void {
    logger[level](`[Warmup] ${message}`);
    const event: WarmupLogEvent = { level, message, timestamp: new Date().toISOString() };
    this.emit('warmup:log', event);
  }

  private loadStats(): WarmupStats {
    if (fs.existsSync(STATS_FILE)) {
      try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch { /* corrompido */ }
    }
    return { totalDays: 0, totalMessages: 0, currentPhase: 1, sessions: [] };
  }

  private saveStats(): void {
    fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2), 'utf-8');
  }
}

function jidToNumber(jid: string): string {
  return jid.split('@')[0];
}
