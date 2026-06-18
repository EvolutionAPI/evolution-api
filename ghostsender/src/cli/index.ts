#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────
//  GhostSender CLI
//  Linha de comando para aquecimento, disparo e verificação
// ──────────────────────────────────────────────────────────────

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import readline from 'readline';
import { createGhostSender } from '../index';
import { ghostConfig, warmupConfig, blastConfig, verifyConfig } from '../config';
import { WarmupScheduler } from '../warmup/scheduler';
import { BlastTarget } from '../core/types';

const ghost = createGhostSender(ghostConfig);

const program = new Command();

// ── Banner ────────────────────────────────────────────────────

function printBanner() {
  console.log(chalk.cyan(`
 ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
██║  ███╗███████║██║   ██║███████╗   ██║
██║   ██║██╔══██║██║   ██║╚════██║   ██║
╚██████╔╝██║  ██║╚██████╔╝███████║   ██║
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝

███████╗███████╗███╗   ██╗██████╗ ███████╗██████╗
██╔════╝██╔════╝████╗  ██║██╔══██╗██╔════╝██╔══██╗
███████╗█████╗  ██╔██╗ ██║██║  ██║█████╗  ██████╔╝
╚════██║██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██╔══██╗
███████║███████╗██║ ╚████║██████╔╝███████╗██║  ██║
╚══════╝╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝
`));
  console.log(chalk.gray('  Sistema avançado de aquecimento e disparo para WhatsApp\n'));
}

// ── Programa principal ────────────────────────────────────────

program
  .name('ghostsender')
  .description('GhostSender — WhatsApp warmup e disparo via Evolution API')
  .version('1.0.0');

// ────────────────────────────────────────────────────────────
//  WARMUP
// ────────────────────────────────────────────────────────────

const warmupCmd = program.command('warmup').description('Gerenciamento de aquecimento de números');

warmupCmd
  .command('run')
  .description('Executa uma sessão de warmup agora')
  .option('-i, --instances <list>', 'Instâncias separadas por vírgula (sobrescreve .env)')
  .action(async (opts) => {
    printBanner();
    const instances = opts.instances
      ? opts.instances.split(',')
      : warmupConfig.instances;

    if (instances.length < 2) {
      console.error(chalk.red('✗ Você precisa de pelo menos 2 instâncias para o warmup.'));
      console.error(chalk.gray('  Configure WARMUP_INSTANCES no .env ou use -i inst1,inst2'));
      process.exit(1);
    }

    console.log(chalk.yellow(`\nInstâncias: ${instances.join(' ↔ ')}`));
    console.log(chalk.yellow(`Fase inicial: ${warmupConfig.startPhase ?? 1}\n`));

    const spinner = ora('Iniciando sessão de warmup...').start();

    try {
      const warmup = ghost.createWarmup({ ...warmupConfig, instances });
      spinner.text = 'Warmup em andamento...';
      const session = await warmup.runDailySession();
      spinner.succeed(
        chalk.green(`Sessão concluída! ${session.messagesSent} mensagens | Fase ${session.phase}`),
      );
    } catch (err) {
      spinner.fail(chalk.red(`Erro: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

warmupCmd
  .command('schedule')
  .description('Agenda warmup diário automático via cron')
  .option('-c, --cron <expr>', 'Expressão cron (padrão: 09:00 todo dia)', '0 9 * * *')
  .option('-i, --instances <list>', 'Instâncias separadas por vírgula')
  .option('--run-now', 'Executa imediatamente além do agendamento')
  .action(async (opts) => {
    printBanner();
    const instances = opts.instances ? opts.instances.split(',') : warmupConfig.instances;

    if (instances.length < 2) {
      console.error(chalk.red('✗ Configure ao menos 2 instâncias.'));
      process.exit(1);
    }

    const warmup = ghost.createWarmup({ ...warmupConfig, instances });
    const scheduler = ghost.createScheduler(warmup, {
      cronExpression: opts.cron,
      timezone: 'America/Sao_Paulo',
      runImmediately: opts.runNow,
    });

    scheduler.start();

    const next = scheduler.nextExecution();
    console.log(chalk.green(`\n✓ Warmup agendado! "${opts.cron}"`));
    if (next) console.log(chalk.gray(`  Próxima execução: ${next.toLocaleString('pt-BR')}`));
    console.log(chalk.gray('  Pressione Ctrl+C para encerrar.\n'));

    process.on('SIGINT', () => {
      scheduler.stop();
      console.log(chalk.yellow('\nAgendamento encerrado.'));
      process.exit(0);
    });

    // Mantém o processo vivo
    setInterval(() => {}, 60_000);
  });

warmupCmd
  .command('stats')
  .description('Exibe estatísticas de warmup acumuladas')
  .action(async () => {
    const instances = warmupConfig.instances.length >= 2 ? warmupConfig.instances : ['mock1', 'mock2'];
    const warmup = ghost.createWarmup({ ...warmupConfig, instances });
    const stats = warmup.getStats();

    console.log(chalk.cyan('\n═══════════════════════════════════'));
    console.log(chalk.cyan('  GhostSender — Estatísticas Warmup'));
    console.log(chalk.cyan('═══════════════════════════════════'));
    console.log(`  Dias completos  : ${chalk.yellow(stats.totalDays)}`);
    console.log(`  Mensagens total : ${chalk.yellow(stats.totalMessages)}`);
    console.log(`  Fase atual      : ${chalk.yellow(stats.currentPhase)}/5`);
    console.log(`  Sessões         : ${chalk.yellow(stats.sessions.length)}`);

    if (stats.sessions.length > 0) {
      console.log(chalk.gray('\n  Últimas 5 sessões:'));
      stats.sessions.slice(-5).reverse().forEach((s) => {
        const date = new Date(s.date).toLocaleDateString('pt-BR');
        console.log(chalk.gray(`    ${date} | Fase ${s.phase} | ${s.messagesSent} msgs`));
      });
    }
    console.log(chalk.cyan('═══════════════════════════════════\n'));
  });

// ────────────────────────────────────────────────────────────
//  BLAST / DISPARO
// ────────────────────────────────────────────────────────────

const blastCmd = program.command('blast').description('Disparo de mensagens em massa');

blastCmd
  .command('send')
  .description('Dispara mensagem para lista de números')
  .requiredOption('-i, --instance <name>', 'Nome da instância remetente')
  .requiredOption('-m, --message <text>', 'Mensagem a enviar (use {{nome}} para variáveis)')
  .requiredOption('-f, --file <path>', 'Arquivo CSV/TXT com números (um por linha ou CSV: numero,nome)')
  .option('--no-verify', 'Não verifica números antes de enviar')
  .option('-c, --concurrency <n>', 'Envios simultâneos', '5')
  .option('-d, --delay <ms>', 'Delay entre envios (ms)', '3000')
  .action(async (opts) => {
    printBanner();

    const targets = parseTargetFile(opts.file);
    if (!targets.length) {
      console.error(chalk.red('✗ Nenhum número encontrado no arquivo.'));
      process.exit(1);
    }

    console.log(chalk.yellow(`\nInstância : ${opts.instance}`));
    console.log(chalk.yellow(`Mensagem  : ${opts.message}`));
    console.log(chalk.yellow(`Alvos     : ${targets.length} números`));
    console.log(chalk.yellow(`Verificar : ${opts.verify ? 'Sim' : 'Não'}\n`));

    const confirm = await askConfirm(`Confirma disparo para ${targets.length} contato(s)?`);
    if (!confirm) { console.log(chalk.gray('Cancelado.')); process.exit(0); }

    const spinner = ora('Iniciando disparo...').start();

    const report = await ghost.blast.run({
      instance: opts.instance,
      message: opts.message,
      targets,
      concurrency: parseInt(opts.concurrency),
      delayBetweenMs: parseInt(opts.delay),
      verifyNumbers: opts.verify,
    });

    spinner.stop();
    console.log('\n' + ghost.blast.formatReport(report));

    const reportFile = `blast-report-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`\nRelatório salvo em: ${reportFile}`));
  });

blastCmd
  .command('media')
  .description('Dispara mídia (imagem/vídeo) para lista de números')
  .requiredOption('-i, --instance <name>', 'Instância remetente')
  .requiredOption('-f, --file <path>', 'Arquivo com números')
  .requiredOption('-u, --url <url>', 'URL da mídia')
  .option('-t, --type <type>', 'Tipo: image | video | document', 'image')
  .option('--caption <text>', 'Legenda da mídia')
  .option('-c, --concurrency <n>', 'Concorrência', '3')
  .action(async (opts) => {
    printBanner();
    const targets = parseTargetFile(opts.file);

    const spinner = ora(`Disparando mídia para ${targets.length} contatos...`).start();
    const report = await ghost.blast.runWithMedia({
      instance: opts.instance,
      message: opts.caption ?? '',
      targets,
      mediaUrl: opts.url,
      mediaType: opts.type as 'image' | 'video' | 'document',
      caption: opts.caption,
      concurrency: parseInt(opts.concurrency),
    });
    spinner.stop();
    console.log('\n' + ghost.blast.formatReport(report));
  });

// ────────────────────────────────────────────────────────────
//  VERIFY / VERIFICAR NÚMEROS
// ────────────────────────────────────────────────────────────

const verifyCmd = program.command('verify').description('Verificação de números WhatsApp');

verifyCmd
  .command('check')
  .description('Verifica se números têm WhatsApp')
  .requiredOption('-f, --file <path>', 'Arquivo TXT com números (um por linha)')
  .option('-i, --instance <name>', 'Instância para verificar')
  .option('-o, --output <path>', 'Salvar válidos em arquivo')
  .action(async (opts) => {
    printBanner();

    const instance = opts.instance ?? verifyConfig.defaultInstance;
    if (!instance) {
      console.error(chalk.red('✗ Especifique a instância com -i ou configure VERIFY_DEFAULT_INSTANCE'));
      process.exit(1);
    }

    const numbers = fs.readFileSync(opts.file, 'utf-8').split('\n').map((n) => n.trim()).filter(Boolean);
    const spinner = ora(`Verificando ${numbers.length} números...`).start();

    const results = await ghost.contacts.filterValid(instance, numbers);

    spinner.succeed(`${results.length}/${numbers.length} números com WhatsApp`);

    console.log(chalk.cyan('\n═════════════════════════════'));
    results.slice(0, 20).forEach((r) => {
      console.log(chalk.green(`  ✓ ${r.number}${r.name ? ` — ${r.name}` : ''}`));
    });
    if (results.length > 20) console.log(chalk.gray(`  ... e mais ${results.length - 20}`));
    console.log(chalk.cyan('═════════════════════════════\n'));

    if (opts.output) {
      const lines = results.map((r) => r.number).join('\n');
      fs.writeFileSync(opts.output, lines);
      console.log(chalk.gray(`Válidos salvos em: ${opts.output}`));
    }
  });

verifyCmd
  .command('profile')
  .description('Busca perfil de um número')
  .requiredOption('-n, --number <number>', 'Número para buscar')
  .option('-i, --instance <name>', 'Instância para usar')
  .action(async (opts) => {
    const instance = opts.instance ?? verifyConfig.defaultInstance;
    const spinner = ora(`Buscando perfil de ${opts.number}...`).start();

    const profile = await ghost.contacts.fetchProfile(instance, opts.number);
    spinner.stop();

    if (!profile) {
      console.log(chalk.red('Perfil não encontrado.'));
      return;
    }

    console.log(chalk.cyan('\nPerfil:'));
    console.log(`  Número : ${profile.wuid}`);
    console.log(`  Nome   : ${profile.name ?? 'N/D'}`);
    console.log(`  Status : ${profile.status ?? 'N/D'}`);
    console.log(`  Foto   : ${profile.picture ?? 'N/D'}`);
  });

// ────────────────────────────────────────────────────────────
//  INSTANCE / INSTÂNCIAS
// ────────────────────────────────────────────────────────────

const instCmd = program.command('instance').description('Gerenciamento de instâncias');

instCmd
  .command('list')
  .description('Lista todas as instâncias')
  .action(async () => {
    const spinner = ora('Buscando instâncias...').start();
    const list = await ghost.instances.list();
    spinner.stop();

    if (!list.length) { console.log(chalk.gray('Nenhuma instância encontrada.')); return; }

    console.log(chalk.cyan(`\n${'Nome'.padEnd(25)} ${'Status'.padEnd(12)} JID`));
    console.log(chalk.gray('─'.repeat(60)));
    list.forEach((i) => {
      const status = i.connectionStatus === 'open' ? chalk.green('● conectada') : chalk.red('○ desconectada');
      console.log(`${i.instanceName.padEnd(25)} ${status.padEnd(20)} ${i.ownerJid ?? ''}`);
    });
    console.log('');
  });

instCmd
  .command('status <name>')
  .description('Verifica o status de uma instância')
  .action(async (name) => {
    const state = await ghost.instances.connectionState(name);
    const label = state === 'open' ? chalk.green('conectada') : chalk.red(state);
    console.log(`${name}: ${label}`);
  });

instCmd
  .command('create <name>')
  .description('Cria uma nova instância e exibe QR code')
  .option('--number <n>', 'Número WhatsApp (sem +)')
  .action(async (name, opts) => {
    const spinner = ora(`Criando instância "${name}"...`).start();
    try {
      const inst = await ghost.instances.create({
        instanceName: name,
        number: opts.number,
        qrcode: true,
      });
      spinner.succeed(`Instância criada: ${inst.instanceName}`);
      if (inst.apikey) console.log(chalk.gray(`  API Key: ${inst.apikey}`));
    } catch (err) {
      spinner.fail(`Erro: ${err instanceof Error ? err.message : err}`);
    }
  });

instCmd
  .command('delete <name>')
  .description('Remove permanentemente uma instância')
  .action(async (name) => {
    const confirm = await askConfirm(`Tem certeza que quer deletar "${name}"? Essa ação é irreversível.`);
    if (!confirm) { console.log('Cancelado.'); return; }
    const spinner = ora('Deletando...').start();
    await ghost.instances.delete(name);
    spinner.succeed(`Instância "${name}" deletada.`);
  });

// ────────────────────────────────────────────────────────────
//  MSG / ENVIAR MENSAGEM AVULSA
// ────────────────────────────────────────────────────────────

program
  .command('send <instance> <number> <message>')
  .description('Envia uma mensagem de texto avulsa')
  .action(async (instance, number, message) => {
    const spinner = ora(`Enviando para ${number}...`).start();
    try {
      const result = await ghost.messages.sendText(instance, { number, text: message });
      spinner.succeed(`Mensagem enviada! ID: ${result.key.id}`);
    } catch (err) {
      spinner.fail(`Erro: ${err instanceof Error ? err.message : err}`);
    }
  });

// ── Helpers ───────────────────────────────────────────────────

function parseTargetFile(filePath: string): BlastTarget[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',');
      return {
        number: parts[0].replace(/\D/g, ''),
        name: parts[1]?.trim(),
        variables: parts[1] ? { nome: parts[1].trim() } : undefined,
      };
    })
    .filter((t) => t.number.length >= 10);
}

function askConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow(`\n${question} [s/N] `), (ans) => {
      rl.close();
      resolve(ans.toLowerCase() === 's');
    });
  });
}

// ── Parse & Run ───────────────────────────────────────────────

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  printBanner();
  program.outputHelp();
}
