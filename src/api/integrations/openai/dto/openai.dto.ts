import { TriggerOperator, TriggerType } from '@prisma/client';

export class Session {
  remoteJid?: string;
  sessionId?: string;
  status?: string;
  createdAt?: number;
  updateAt?: number;
}

export class OpenaiCredsDto {
  name: string;
  apiKey: string;
}

export class OpenaiDto {
  enabled?: boolean;
  description?: string;
  openaiCredsId: string;
  botType?: string;
  assistantId?: string;
  model?: string;
  systemMessages?: string[];
  assistantMessages?: string[];
  userMessages?: string[];
  maxTokens?: number;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  triggerType?: TriggerType;
  triggerOperator?: TriggerOperator;
  triggerValue?: string;
  ignoreJids?: any;
}

export class OpenaiSettingDto {
  openaiCredsId?: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  openaiIdFallback?: string;
  ignoreJids?: any;
  speechToText?: boolean;
}

export class OpenaiIgnoreJidDto {
  remoteJid?: string;
  action?: string;
}
