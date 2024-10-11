import { TriggerOperator, TriggerType } from '@prisma/client';

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
  functionUrl?: string;
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
  splitMessages?: boolean;
  timePerChar?: number;
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
  splitMessages?: boolean;
  timePerChar?: number;
}
