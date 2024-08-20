import { $Enums, TriggerOperator, TriggerType } from '@prisma/client';

export class Session {
  remoteJid?: string;
  sessionId?: string;
  status?: string;
  createdAt?: number;
  updateAt?: number;
}

export class DifyDto {
  enabled?: boolean;
  description?: string;
  botType?: $Enums.DifyBotType;
  apiUrl?: string;
  apiKey?: string;
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

export class DifySettingDto {
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  difyIdFallback?: string;
  ignoreJids?: any;
}

export class DifyIgnoreJidDto {
  remoteJid?: string;
  action?: string;
}
