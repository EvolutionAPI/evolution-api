// ──────────────────────────────────────────────────────────────
//  GhostSender — Humanizador de Comportamento
//  Simula padrões reais de digitação, leitura e resposta humana
// ──────────────────────────────────────────────────────────────

/**
 * Gera um delay aleatório entre min e max (ms).
 * Usa distribuição gaussiana para simular comportamento humano.
 */
export function humanDelay(minMs: number, maxMs: number): number {
  const mid = (minMs + maxMs) / 2;
  const std = (maxMs - minMs) / 6;
  // Box-Muller para distribuição gaussiana
  const u1 = Math.random();
  const u2 = Math.random();
  const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = mid + gauss * std;
  return Math.max(minMs, Math.min(maxMs, Math.round(value)));
}

/** Aguarda um delay humano aleatório */
export function waitHuman(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, humanDelay(minMs, maxMs)));
}

/**
 * Estima quanto tempo uma pessoa levaria para ler uma mensagem (ms).
 * ~200 palavras por minuto (adulto médio brasileiro).
 */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerMs = 200 / 60_000;
  const base = words / wordsPerMs;
  // Adiciona jitter de ±30%
  const jitter = base * (0.7 + Math.random() * 0.6);
  return Math.max(1_500, Math.min(20_000, Math.round(jitter)));
}

/**
 * Estima quanto tempo para digitar uma mensagem (ms).
 * Inclui erros de digitação simulados.
 * ~40 palavras por minuto para mensagens de WhatsApp.
 */
export function typingTime(text: string): number {
  const chars = text.length;
  const charsPerMs = 40 * 5 / 60_000; // ~40 wpm × 5 chars/word
  const base = chars / charsPerMs;
  // Adiciona pausas para "pensar" a cada frase
  const sentences = text.split(/[.!?]+/).length;
  const thinkPauses = sentences * humanDelay(500, 2_000);
  const jitter = base * (0.8 + Math.random() * 0.4);
  return Math.max(1_000, Math.min(30_000, Math.round(jitter + thinkPauses)));
}

/**
 * Retorna true com probabilidade `chance` (0-1).
 * Ex: sometimes(0.3) → true 30% das vezes.
 */
export function sometimes(chance: number): boolean {
  return Math.random() < chance;
}

/**
 * Escolhe um item aleatório de um array com pesos opcionais.
 */
export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function pickWeighted<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let rnd = Math.random() * total;
  for (const item of items) {
    rnd -= item.weight;
    if (rnd <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

/**
 * Verifica se o horário atual está dentro da janela permitida.
 * hourStart e hourEnd no formato "HH:MM".
 */
export function isWithinHours(hourStart: string, hourEnd: string): boolean {
  const now = new Date();
  const [startH, startM] = hourStart.split(':').map(Number);
  const [endH, endM] = hourEnd.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Aguarda até que o horário atual entre na janela permitida.
 */
export async function waitUntilAllowedHours(
  hourStart: string,
  hourEnd: string,
): Promise<void> {
  while (!isWithinHours(hourStart, hourEnd)) {
    await new Promise((resolve) => setTimeout(resolve, 60_000)); // verifica a cada minuto
  }
}

/**
 * Número de mensagens para o dia baseado na fase do warmup.
 * Otimizado para aquecimento em 10–14 dias.
 * Fase 1: 20-40 | Fase 2: 60-120 | Fase 3: 150-250 | Fase 4: 280-450 | Fase 5: 500-800
 */
export function dailyMessageCount(phase: number): number {
  const ranges: Record<number, [number, number]> = {
    1: [20, 40],
    2: [60, 120],
    3: [150, 250],
    4: [280, 450],
    5: [500, 800],
  };
  const [min, max] = ranges[phase] ?? [20, 40];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calcula a fase do warmup baseada no dia de operação.
 * Avança de fase a cada 2 dias (antes eram 7) — aquecimento em ~10 dias.
 */
export function phaseFromDay(dayNumber: number, startPhase: number = 1): number {
  return Math.min(5, startPhase + Math.floor((dayNumber - 1) / 2));
}

/** Formata milissegundos em string legível */
export function formatMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}
