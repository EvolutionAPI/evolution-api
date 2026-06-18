// ──────────────────────────────────────────────────────────────
//  GhostSender — Tipos centrais
// ──────────────────────────────────────────────────────────────

export interface GhostSenderConfig {
  apiUrl: string;
  apiKey: string;
}

// ── Instância ────────────────────────────────────────────────

export interface Instance {
  instanceName: string;
  instanceId?: string;
  status?: string;
  serverUrl?: string;
  apikey?: string;
  connectionStatus?: ConnectionStatus;
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
}

export type ConnectionStatus = 'open' | 'close' | 'connecting';

export interface CreateInstanceDto {
  instanceName: string;
  token?: string;
  qrcode?: boolean;
  number?: string;
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS' | 'EVOLUTION';
  reject_call?: boolean;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
  webhookUrl?: string;
  webhookEvents?: string[];
}

// ── Mensagens ────────────────────────────────────────────────

export interface SendTextDto {
  number: string;
  text: string;
  delay?: number;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  quoted?: QuotedMessage;
}

export interface SendMediaDto {
  number: string;
  mediatype: 'image' | 'video' | 'document' | 'audio';
  mimetype?: string;
  caption?: string;
  media: string; // URL ou base64
  fileName?: string;
  delay?: number;
  quoted?: QuotedMessage;
}

export interface SendReactionDto {
  key: MessageKey;
  reaction: string;
}

export interface SendAudioDto {
  number: string;
  audio: string; // URL ou base64
  delay?: number;
  encoding?: boolean;
}

export interface SendLocationDto {
  number: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  delay?: number;
}

export interface SendContactDto {
  number: string;
  contact: ContactVcard[];
  delay?: number;
}

export interface ContactVcard {
  fullName: string;
  wuid: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
}

export interface SendPollDto {
  number: string;
  name: string;
  selectableCount: number;
  values: string[];
  delay?: number;
}

export interface SendListDto {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footerText?: string;
  sections: ListSection[];
  delay?: number;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface ListRow {
  title: string;
  description?: string;
  rowId: string;
}

export interface SendButtonsDto {
  number: string;
  title: string;
  description: string;
  footer?: string;
  buttons: Button[];
  delay?: number;
}

export interface Button {
  type: 'reply' | 'copy' | 'url' | 'call' | 'pix';
  displayText: string;
  id?: string;
  copyCode?: string;
  url?: string;
  phoneNumber?: string;
  currency?: string;
  name?: string;
  keyType?: string;
  key?: string;
}

export interface QuotedMessage {
  key: MessageKey;
  message?: Record<string, unknown>;
}

export interface MessageKey {
  remoteJid: string;
  fromMe?: boolean;
  id: string;
}

export interface MessageSentResult {
  key: MessageKey;
  message?: Record<string, unknown>;
  messageTimestamp?: number;
  status?: string;
}

// ── Contatos / Números ───────────────────────────────────────

export interface WhatsAppNumberCheckResult {
  exists: boolean;
  jid?: string;
  number: string;
  name?: string;
}

export interface ContactProfile {
  wuid: string;
  name?: string;
  numberExists?: boolean;
  picture?: string;
  status?: string;
  isBusiness?: boolean;
  email?: string;
  description?: string;
  website?: string[];
}

// ── Grupos ──────────────────────────────────────────────────

export interface CreateGroupDto {
  subject: string;
  description?: string;
  participants: string[];
}

export interface GroupInfo {
  id: string;
  subject: string;
  subjectOwner?: string;
  subjectTime?: number;
  pictureUrl?: string;
  size?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  participants?: GroupParticipant[];
}

export interface GroupParticipant {
  id: string;
  admin?: 'admin' | 'superadmin' | null;
}

// ── Warmup ───────────────────────────────────────────────────

export type WarmupPhase = 1 | 2 | 3 | 4 | 5;

export interface WarmupConfig {
  instances: string[];
  startPhase?: WarmupPhase;
  hourStart?: string; // HH:MM
  hourEnd?: string;   // HH:MM
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface WarmupSession {
  date: string;
  phase: WarmupPhase;
  messagesSent: number;
  pairs: Array<{ sender: string; receiver: string }>;
}

export interface WarmupStats {
  totalDays: number;
  totalMessages: number;
  currentPhase: WarmupPhase;
  sessions: WarmupSession[];
}

// ── Blast / Disparo ──────────────────────────────────────────

export type BlastStatus = 'pending' | 'sent' | 'failed' | 'invalid';

export interface BlastTarget {
  number: string;
  name?: string;
  variables?: Record<string, string>;
}

export interface BlastResult {
  number: string;
  name?: string;
  status: BlastStatus;
  messageId?: string;
  error?: string;
  sentAt?: Date;
}

export interface BlastReport {
  total: number;
  sent: number;
  failed: number;
  invalid: number;
  results: BlastResult[];
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
}

export interface BlastConfig {
  instance: string;
  message: string | ((target: BlastTarget) => string);
  targets: BlastTarget[];
  concurrency?: number;
  delayBetweenMs?: number;
  verifyNumbers?: boolean;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'document';
}

// ── API genérica ─────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status?: number;
}
