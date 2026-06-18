// ──────────────────────────────────────────────────────────────
//  GhostSender — Banco de Conversas Ultra-Realistas (PT-BR)
//  Conversas naturais para aquecimento de números WhatsApp
// ──────────────────────────────────────────────────────────────

import { pickRandom, pickWeighted, sometimes } from './humanizer';

export type MessageRole = 'A' | 'B';

export interface ConversationTurn {
  role: MessageRole;
  text: string;
  type?: 'text' | 'reaction' | 'audio_note';
  reaction?: string;
}

export interface ConversationScript {
  id: string;
  category: string;
  turns: ConversationTurn[];
}

// ── Banco de Conversas ───────────────────────────────────────

export const CONVERSATION_SCRIPTS: ConversationScript[] = [
  // ──── Cotidiano / Saudações ────────────────────────────────
  {
    id: 'greet_01',
    category: 'cotidiano',
    turns: [
      { role: 'A', text: 'Oi, tudo bem?' },
      { role: 'B', text: 'Tudo sim e vc?' },
      { role: 'A', text: 'Aqui tá ótimo 😊 trabalhando muito essa semana' },
      { role: 'B', text: 'Sei como é kkkk semana puxada mesmo' },
      { role: 'A', text: 'Mas tá indo! E aí o que você fez de fim de semana?' },
      { role: 'B', text: 'Fui no churrasco na casa do primo foi muito bom' },
      { role: 'A', text: 'Que ótimo! Faz tempo que não vou num churrasco boa' },
    ],
  },
  {
    id: 'greet_02',
    category: 'cotidiano',
    turns: [
      { role: 'A', text: 'Oi boa tarde!' },
      { role: 'B', text: 'Boa tarde! Como vai?' },
      { role: 'A', text: 'Bem obrigada, e vc?' },
      { role: 'B', text: 'Bem também graças a deus' },
      { role: 'A', text: '😊👍' },
    ],
  },
  {
    id: 'greet_03',
    category: 'cotidiano',
    turns: [
      { role: 'A', text: 'Oi sumiço kkk' },
      { role: 'B', text: 'kkkkk verdade, tava corrido aqui' },
      { role: 'A', text: 'Imagino, trabalho né' },
      { role: 'B', text: 'Isso mesmo, mas apareceu! E vc tá bem?' },
      { role: 'A', text: 'Tô sim, na correria também mas bem' },
      { role: 'B', text: 'Que bom! Qualquer coisa tô aqui' },
    ],
  },
  // ──── Trabalho ────────────────────────────────────────────
  {
    id: 'work_01',
    category: 'trabalho',
    turns: [
      { role: 'A', text: 'Oi, você conseguiu terminar o relatório?' },
      { role: 'B', text: 'Quase, só falta ajustar umas coisas no final' },
      { role: 'A', text: 'Ok sem pressa, preciso só até amanhã de manhã' },
      { role: 'B', text: 'Perfeito, até o fim do dia deixo pronto' },
      { role: 'A', text: 'Ótimo obrigado!' },
      { role: 'B', text: '👍' },
    ],
  },
  {
    id: 'work_02',
    category: 'trabalho',
    turns: [
      { role: 'A', text: 'A reunião foi remarcada pra sexta às 14h' },
      { role: 'B', text: 'Ah que bom, sexta tá melhor pra mim mesmo' },
      { role: 'A', text: 'Exato, e o cliente também preferiu' },
      { role: 'B', text: 'Certo! Fica anotado aqui' },
      { role: 'A', text: 'Te mando o convite no e-mail agora' },
      { role: 'B', text: 'Pode mandar, obrigada!' },
    ],
  },
  // ──── Combinações / Planos ────────────────────────────────
  {
    id: 'plans_01',
    category: 'planos',
    turns: [
      { role: 'A', text: 'Vamos sair esse fim de semana?' },
      { role: 'B', text: 'Quero sim! Que dia você pode?' },
      { role: 'A', text: 'Sábado de noite tá bom pra você?' },
      { role: 'B', text: 'Sábado tô livre sim' },
      { role: 'A', text: 'Ótimo, vamos no restaurante novo da avenida?' },
      { role: 'B', text: 'Aquele italiano? Ouvi que é bom' },
      { role: 'A', text: 'Esse mesmo! Faço a reserva' },
      { role: 'B', text: 'Perfeito 😍 tô animada' },
    ],
  },
  {
    id: 'plans_02',
    category: 'planos',
    turns: [
      { role: 'A', text: 'Oi! Você lembra que disse que ia me ajudar na mudança?' },
      { role: 'B', text: 'Claro! Quando é mesmo?' },
      { role: 'A', text: 'Domingo de manhã, tipo 9h' },
      { role: 'B', text: 'Tô lá sim, pode contar' },
      { role: 'A', text: 'Demais te devo uma 😄' },
      { role: 'B', text: 'Kkk de nada, entre amigos né' },
    ],
  },
  // ──── Humor / Casual ──────────────────────────────────────
  {
    id: 'casual_01',
    category: 'casual',
    turns: [
      { role: 'A', text: 'Você viu o jogo ontem???' },
      { role: 'B', text: 'Assisti sim que sufoco' },
      { role: 'A', text: 'Cara quase tive um infarto no segundo tempo kkk' },
      { role: 'B', text: 'Hahahaha eu também! Mas no final deu certo' },
      { role: 'A', text: 'Menos mal 😅 que alívio' },
    ],
  },
  {
    id: 'casual_02',
    category: 'casual',
    turns: [
      { role: 'A', text: 'Tem visto alguma série boa últimamente?' },
      { role: 'B', text: 'Sim! Tô assistindo aquela nova de suspense na Netflix' },
      { role: 'A', text: 'Que série? Me indica' },
      { role: 'B', text: 'Vc ainda não viu? É muito boa, vc vai adorar' },
      { role: 'A', text: 'Vou começar hoje mesmo!' },
      { role: 'B', text: 'Quando terminar me fala o que achou 😄' },
    ],
  },
  {
    id: 'casual_03',
    category: 'casual',
    turns: [
      { role: 'A', text: 'Bom dia! ☀️' },
      { role: 'B', text: 'Bom dia!! 😊' },
      { role: 'A', text: 'Como tá o tempo aí?' },
      { role: 'B', text: 'Aqui tá nublado, mas sem chuva ainda' },
      { role: 'A', text: 'Aqui tá quente demais 🥵' },
      { role: 'B', text: 'Kkkk inveja zero' },
      { role: 'A', text: 'Rsrs' },
    ],
  },
  // ──── Família ────────────────────────────────────────────
  {
    id: 'family_01',
    category: 'familia',
    turns: [
      { role: 'A', text: 'Oi! Você vai na festa da vovó sábado?' },
      { role: 'B', text: 'Vou sim, é claro! Vcs vão também?' },
      { role: 'A', text: 'Com certeza, ela ficaria triste se a gente faltasse' },
      { role: 'B', text: 'Verdade, ela ama quando tá todo mundo junto' },
      { role: 'A', text: 'Que horas vocês chegam?' },
      { role: 'B', text: 'Tipo umas 14h, você?' },
      { role: 'A', text: 'Mais ou menos isso também, ótimo' },
    ],
  },
  // ──── Compras / Indicações ───────────────────────────────
  {
    id: 'shopping_01',
    category: 'compras',
    turns: [
      { role: 'A', text: 'Você conhece alguma boa loja de roupas no shopping?' },
      { role: 'B', text: 'Conheço sim! Tem uma lá no segundo andar que tem tudo' },
      { role: 'A', text: 'É cara?' },
      { role: 'B', text: 'Tem de tudo, tem coisa barata também' },
      { role: 'A', text: 'Vou passar lá essa semana, obrigada!' },
      { role: 'B', text: 'De nada 😊 depois me conta' },
    ],
  },
  // ──── Saúde / Bem-estar ──────────────────────────────────
  {
    id: 'health_01',
    category: 'saude',
    turns: [
      { role: 'A', text: 'Tô indo na academia hoje, finalmente voltei a me cuidar' },
      { role: 'B', text: 'Que ótimo!! Eu também preciso voltar' },
      { role: 'A', text: 'Anda comigo! A gente se motiva mais' },
      { role: 'B', text: 'Verdade, qual é sua academia?' },
      { role: 'A', text: 'É aquela perto do trabalho, super boa' },
      { role: 'B', text: 'Vou pensar sim, boa sorte hoje!' },
      { role: 'A', text: 'Obrigada 💪' },
    ],
  },
  // ──── Curtas e naturais ──────────────────────────────────
  {
    id: 'short_01',
    category: 'curta',
    turns: [
      { role: 'A', text: '😊' },
      { role: 'B', text: '😁' },
    ],
  },
  {
    id: 'short_02',
    category: 'curta',
    turns: [
      { role: 'A', text: 'Oi' },
      { role: 'B', text: 'Oi! Sumiu' },
      { role: 'A', text: 'Kkk tava atarefado' },
      { role: 'B', text: 'Normal 👍' },
    ],
  },
  {
    id: 'short_03',
    category: 'curta',
    turns: [
      { role: 'A', text: 'Disponível agora?' },
      { role: 'B', text: 'Pode falar' },
      { role: 'A', text: 'Mandei o arquivo no e-mail, dá pra dar uma olhada?' },
      { role: 'B', text: 'Já abri aqui, obrigado' },
    ],
  },
];

// ── Emojis frequentes por contexto ────────────────────────────

export const COMMON_EMOJIS = ['😊', '😄', '👍', '❤️', '🙏', '😂', '🥰', '😅', '✅', '🔥'];

export const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

// ── Variações de texto para não repetir ──────────────────────

export const ACK_PHRASES = [
  'Ok!',
  'Entendi',
  'Certo',
  'Combinado',
  'Perfeito',
  'Ótimo',
  'Beleza',
  '👍',
  '😊',
  'Sim!',
];

export const FAREWELL_PHRASES = [
  'Até mais!',
  'Tchauzinho 👋',
  'Até logo!',
  'Um abraço!',
  'Boa semana!',
  'Bjs',
  'Flw!',
];

// ── Seleção de conversa ───────────────────────────────────────

/**
 * Seleciona um script de conversa aleatório.
 * Prefere conversas mais longas mas mantém probabilidade de curtas.
 */
export function pickConversation(): ConversationScript {
  return pickWeighted([
    ...CONVERSATION_SCRIPTS.filter((c) => c.category !== 'curta').map((c) => ({ value: c, weight: 3 })),
    ...CONVERSATION_SCRIPTS.filter((c) => c.category === 'curta').map((c) => ({ value: c, weight: 1 })),
  ]);
}

/**
 * Humaniza levemente um texto: adiciona/remove pontuação, ajusta capitalização.
 * Simula erros naturais de digitação.
 */
export function humanizeText(text: string): string {
  let t = text;

  // Às vezes não usa maiúscula no início
  if (sometimes(0.3)) t = t.charAt(0).toLowerCase() + t.slice(1);

  // Às vezes remove ponto final
  if (sometimes(0.4) && t.endsWith('.')) t = t.slice(0, -1);

  // Às vezes duplica letras para ênfase
  if (sometimes(0.1)) {
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    const vowel = pickRandom(vowels);
    t = t.replace(new RegExp(vowel, 'i'), (m) => m + m);
  }

  return t;
}
