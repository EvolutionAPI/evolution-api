// ──────────────────────────────────────────────────────────────
//  GhostSender — Entry point / SDK público
//  Sistema avançado de aquecimento e disparo para WhatsApp
// ──────────────────────────────────────────────────────────────

import { EvolutionClient } from './core/client';
import { InstanceService } from './services/instance.service';
import { MessageService } from './services/message.service';
import { ContactService } from './services/contact.service';
import { BlastService } from './services/blast.service';
import { WarmupService } from './warmup/warmup.service';
import { WarmupScheduler } from './warmup/scheduler';
import { GhostSenderConfig, WarmupConfig } from './core/types';

export * from './core/types';
export * from './warmup/humanizer';
export * from './warmup/conversations';
export { InstanceService } from './services/instance.service';
export { MessageService } from './services/message.service';
export { ContactService } from './services/contact.service';
export { BlastService } from './services/blast.service';
export { WarmupService } from './warmup/warmup.service';
export { WarmupScheduler } from './warmup/scheduler';

// ── SDK Factory ───────────────────────────────────────────────

export interface GhostSenderSDK {
  instances: InstanceService;
  messages: MessageService;
  contacts: ContactService;
  blast: BlastService;
  createWarmup: (config: WarmupConfig) => WarmupService;
  createScheduler: (warmup: WarmupService, options?: import('./warmup/scheduler').SchedulerOptions) => WarmupScheduler;
}

/**
 * Cria a instância principal do GhostSender SDK.
 *
 * @example
 * ```ts
 * const ghost = createGhostSender({
 *   apiUrl: 'http://localhost:8080',
 *   apiKey: 'minha-chave',
 * });
 *
 * // Verificar número
 * const result = await ghost.contacts.verifyOne('instancia1', '5511999999999');
 *
 * // Disparar mensagem
 * await ghost.blast.run({
 *   instance: 'instancia1',
 *   message: 'Olá {{nome}}!',
 *   targets: [{ number: '5511999999999', name: 'João', variables: { nome: 'João' } }],
 * });
 *
 * // Iniciar warmup agendado
 * const warmup = ghost.createWarmup({ instances: ['inst1', 'inst2'] });
 * const scheduler = ghost.createScheduler(warmup, { cronExpression: '0 9 * * *' });
 * scheduler.start();
 * ```
 */
export function createGhostSender(config: GhostSenderConfig): GhostSenderSDK {
  const client = new EvolutionClient(config);
  const instances = new InstanceService(client);
  const messages = new MessageService(client);
  const contacts = new ContactService(client);
  const blast = new BlastService(messages, contacts);

  return {
    instances,
    messages,
    contacts,
    blast,
    createWarmup: (warmupConfig: WarmupConfig) =>
      new WarmupService(messages, instances, warmupConfig),
    createScheduler: (warmup: WarmupService, options?) =>
      new WarmupScheduler(warmup, options),
  };
}
