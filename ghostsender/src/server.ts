// ──────────────────────────────────────────────────────────────
//  GhostSender — API Server (Express + Socket.io)
// ──────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { createGhostSender } from './index';
import { WarmupService } from './warmup/warmup.service';
import { WarmupScheduler } from './warmup/scheduler';
import { ghostConfig, warmupConfig, blastConfig } from './config';
import { BlastTarget } from './core/types';
import { logger } from './config';

const app = express();
const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Serve UI estática em produção
const UI_DIST = path.resolve(__dirname, '../../ui/dist');
app.use(express.static(UI_DIST));

// ── SDK ───────────────────────────────────────────────────────
const ghost = createGhostSender(ghostConfig);
let activeWarmup: WarmupService | null = null;
let activeScheduler: WarmupScheduler | null = null;
let blastRunning = false;

// ── Socket.io ────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`[WS] Cliente conectado: ${socket.id}`);
  socket.emit('connected', { version: '1.0.0' });

  if (activeWarmup) {
    socket.emit('warmup:running', { running: activeWarmup.isRunning() });
  }

  socket.on('disconnect', () => {
    logger.debug(`[WS] Cliente desconectado: ${socket.id}`);
  });
});

function attachWarmupEvents(warmup: WarmupService): void {
  warmup.on('warmup:log', (e) => io.emit('warmup:log', e));
  warmup.on('warmup:progress', (e) => io.emit('warmup:progress', e));
  warmup.on('warmup:start', (e) => io.emit('warmup:start', e));
  warmup.on('warmup:end', (e) => io.emit('warmup:end', e));
  warmup.on('warmup:message', (e) => io.emit('warmup:message', e));
}

// ── Helpers ───────────────────────────────────────────────────
function parseNumbersFromText(text: string): BlastTarget[] {
  return text
    .split(/[\n,;]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',');
      const number = parts[0].replace(/\D/g, '');
      return { number, name: parts[1]?.trim() };
    })
    .filter((t) => t.number.length >= 10);
}

function ok(res: express.Response, data: unknown, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function fail(res: express.Response, message: string, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

// ═════════════════════════════════════════════════════════════
//  ROUTES — Instances
// ═════════════════════════════════════════════════════════════

app.get('/api/instances', async (_req, res) => {
  try {
    const list = await ghost.instances.list();
    return ok(res, list);
  } catch (e: unknown) {
    return fail(res, String(e), 500);
  }
});

app.get('/api/instances/:name/status', async (req, res) => {
  try {
    const state = await ghost.instances.connectionState(req.params.name);
    return ok(res, { state });
  } catch (e: unknown) {
    return fail(res, String(e), 500);
  }
});

app.post('/api/instances', async (req, res) => {
  try {
    const inst = await ghost.instances.create(req.body);
    return ok(res, inst, 201);
  } catch (e: unknown) {
    return fail(res, String(e));
  }
});

app.post('/api/instances/:name/connect', async (req, res) => {
  try {
    const result = await ghost.instances.connect(req.params.name);
    return ok(res, result);
  } catch (e: unknown) {
    return fail(res, String(e));
  }
});

app.post('/api/instances/:name/restart', async (req, res) => {
  try {
    await ghost.instances.restart(req.params.name);
    return ok(res, { restarted: true });
  } catch (e: unknown) {
    return fail(res, String(e));
  }
});

app.post('/api/instances/:name/logout', async (req, res) => {
  try {
    await ghost.instances.logout(req.params.name);
    return ok(res, { logged_out: true });
  } catch (e: unknown) {
    return fail(res, String(e));
  }
});

app.delete('/api/instances/:name', async (req, res) => {
  try {
    await ghost.instances.delete(req.params.name);
    return ok(res, { deleted: true });
  } catch (e: unknown) {
    return fail(res, String(e));
  }
});

// ═════════════════════════════════════════════════════════════
//  ROUTES — Warmup
// ═════════════════════════════════════════════════════════════

app.get('/api/warmup/stats', (_req, res) => {
  if (!activeWarmup) {
    activeWarmup = ghost.createWarmup(warmupConfig);
    attachWarmupEvents(activeWarmup);
  }
  return ok(res, activeWarmup.getStats());
});

app.post('/api/warmup/start', async (req, res) => {
  if (activeWarmup?.isRunning()) return fail(res, 'Warmup já em execução.');

  const { instances, startPhase, hourStart, hourEnd, minDelayMs, maxDelayMs } = req.body as {
    instances?: string[];
    startPhase?: number;
    hourStart?: string;
    hourEnd?: string;
    minDelayMs?: number;
    maxDelayMs?: number;
  };

  const cfg = {
    ...warmupConfig,
    ...(instances && { instances }),
    ...(startPhase && { startPhase: startPhase as 1 }),
    ...(hourStart && { hourStart }),
    ...(hourEnd && { hourEnd }),
    ...(minDelayMs && { minDelayMs }),
    ...(maxDelayMs && { maxDelayMs }),
  };

  if ((cfg.instances?.length ?? 0) < 2) return fail(res, 'Mínimo de 2 instâncias necessárias.');

  activeWarmup = ghost.createWarmup(cfg);
  attachWarmupEvents(activeWarmup);

  // Executa em background
  activeWarmup.runDailySession().catch((e) => {
    io.emit('warmup:error', { error: String(e) });
    logger.error(`[Warmup] ${e}`);
  });

  return ok(res, { started: true });
});

app.post('/api/warmup/stop', (_req, res) => {
  if (!activeWarmup?.isRunning()) return fail(res, 'Nenhum warmup em execução.');
  activeWarmup.abort();
  return ok(res, { stopped: true });
});

app.post('/api/warmup/reset', (_req, res) => {
  if (!activeWarmup) {
    activeWarmup = ghost.createWarmup(warmupConfig);
    attachWarmupEvents(activeWarmup);
  }
  activeWarmup.resetStats();
  return ok(res, { reset: true });
});

app.post('/api/warmup/schedule', (req, res) => {
  const { cronExpression, instances } = req.body as { cronExpression?: string; instances?: string[] };

  const cfg = { ...warmupConfig, ...(instances && { instances }) };
  const warmup = ghost.createWarmup(cfg);
  attachWarmupEvents(warmup);

  if (activeScheduler) activeScheduler.stop();
  activeScheduler = ghost.createScheduler(warmup, {
    cronExpression: cronExpression ?? '0 9 * * *',
    timezone: 'America/Sao_Paulo',
  });
  activeScheduler.start();

  return ok(res, { scheduled: true, next: activeScheduler.nextExecution() });
});

app.post('/api/warmup/schedule/stop', (_req, res) => {
  if (!activeScheduler) return fail(res, 'Nenhum agendamento ativo.');
  activeScheduler.stop();
  activeScheduler = null;
  return ok(res, { stopped: true });
});

// ═════════════════════════════════════════════════════════════
//  ROUTES — Blast
// ═════════════════════════════════════════════════════════════

app.post('/api/blast/send', async (req, res) => {
  if (blastRunning) return fail(res, 'Disparo já em andamento.');

  const { instance, message, numbers, concurrency, delayBetweenMs, verifyNumbers } = req.body as {
    instance: string;
    message: string;
    numbers: string;
    concurrency?: number;
    delayBetweenMs?: number;
    verifyNumbers?: boolean;
  };

  if (!instance || !message || !numbers) return fail(res, 'instance, message e numbers são obrigatórios.');

  const targets = parseNumbersFromText(numbers);
  if (!targets.length) return fail(res, 'Nenhum número válido encontrado.');

  blastRunning = true;
  ok(res, { started: true, total: targets.length });

  ghost.blast
    .run({
      instance,
      message,
      targets,
      concurrency: concurrency ?? blastConfig.concurrency,
      delayBetweenMs: delayBetweenMs ?? blastConfig.delayBetweenMs,
      verifyNumbers: verifyNumbers ?? true,
    })
    .then((report) => {
      io.emit('blast:complete', report);
      blastRunning = false;
    })
    .catch((e) => {
      io.emit('blast:error', { error: String(e) });
      blastRunning = false;
    });
});

app.post('/api/blast/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, 'Arquivo não enviado.');
  const text = req.file.buffer.toString('utf-8');
  const targets = parseNumbersFromText(text);
  return ok(res, { count: targets.length, preview: targets.slice(0, 5) });
});

// ═════════════════════════════════════════════════════════════
//  ROUTES — Verify
// ═════════════════════════════════════════════════════════════

app.post('/api/verify/check', async (req, res) => {
  const { instance, numbers } = req.body as { instance: string; numbers: string[] | string };
  if (!instance) return fail(res, 'instance é obrigatório.');

  const list = Array.isArray(numbers)
    ? numbers
    : typeof numbers === 'string'
    ? numbers.split(/[\n,;]/).map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 10)
    : [];

  try {
    const results = await ghost.contacts.filterValid(instance, list);
    return ok(res, results);
  } catch (e: unknown) {
    return fail(res, String(e), 500);
  }
});

app.post('/api/verify/profile', async (req, res) => {
  const { instance, number } = req.body as { instance: string; number: string };
  try {
    const profile = await ghost.contacts.fetchProfile(instance, number);
    return ok(res, profile);
  } catch (e: unknown) {
    return fail(res, String(e), 500);
  }
});

// ═════════════════════════════════════════════════════════════
//  ROUTES — Message
// ═════════════════════════════════════════════════════════════

app.post('/api/message/send', async (req, res) => {
  const { instance, number, text } = req.body as { instance: string; number: string; text: string };
  try {
    const result = await ghost.messages.sendText(instance, { number, text });
    return ok(res, result);
  } catch (e: unknown) {
    return fail(res, String(e));
  }
});

// ── Health + SPA fallback ─────────────────────────────────────

app.get('/api/health', (_req, res) => ok(res, { status: 'ok', version: '1.0.0' }));

app.get('*', (_req, res) => {
  const indexPath = path.join(UI_DIST, 'index.html');
  if (require('fs').existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ message: 'GhostSender API — UI não compilada. Execute: cd ui && npm run build' });
});

// ── Start ─────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3333', 10);
httpServer.listen(PORT, () => {
  logger.info(`GhostSender rodando em http://localhost:${PORT}`);
});

export { app, io };
