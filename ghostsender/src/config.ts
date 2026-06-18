// ──────────────────────────────────────────────────────────────
//  GhostSender — Configuração e Logger
// ──────────────────────────────────────────────────────────────

import dotenv from 'dotenv';
import path from 'path';
import winston from 'winston';
import { GhostSenderConfig, WarmupConfig } from './core/types';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`[GhostSender] Variável de ambiente obrigatória não definida: ${key}`);
  }
  return value;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  return raw ? parseInt(raw, 10) : fallback;
}

// ── Config principal ─────────────────────────────────────────

export const ghostConfig: GhostSenderConfig = {
  apiUrl: env('EVOLUTION_API_URL', 'http://localhost:8080'),
  apiKey: env('EVOLUTION_API_KEY', ''),
};

export const warmupConfig: WarmupConfig = {
  instances: env('WARMUP_INSTANCES', '').split(',').filter(Boolean),
  startPhase: (envInt('WARMUP_START_PHASE', 1) as 1 | 2 | 3 | 4 | 5),
  hourStart: env('WARMUP_HOUR_START', '08:00'),
  hourEnd: env('WARMUP_HOUR_END', '22:00'),
  minDelayMs: envInt('WARMUP_MIN_DELAY_MS', 15_000),
  maxDelayMs: envInt('WARMUP_MAX_DELAY_MS', 90_000),
};

export const blastConfig = {
  concurrency: envInt('BLAST_CONCURRENCY', 5),
  delayBetweenMs: envInt('BLAST_DELAY_BETWEEN_MS', 3_000),
};

export const verifyConfig = {
  defaultInstance: env('VERIFY_DEFAULT_INSTANCE', ''),
};

// ── Logger ───────────────────────────────────────────────────

const { combine, timestamp, colorize, printf, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts }) => {
  return `${ts} [${level}] ${message}`;
});

export const logger = winston.createLogger({
  level: env('LOG_LEVEL', 'info'),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
    }),
    new winston.transports.File({
      filename: env('LOG_FILE', 'ghostsender.log'),
      format: combine(timestamp(), json()),
    }),
  ],
});
