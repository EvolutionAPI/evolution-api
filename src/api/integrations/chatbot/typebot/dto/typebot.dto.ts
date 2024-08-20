import { TriggerOperator, TriggerType } from '@prisma/client';

export class Session {
  remoteJid?: string;
  sessionId?: string;
  status?: string;
  createdAt?: number;
  updateAt?: number;
  prefilledVariables?: PrefilledVariables;
}

export class PrefilledVariables {
  remoteJid?: string;
  pushName?: string;
  messageType?: string;
  additionalData?: { [key: string]: any };
}

export class TypebotDto {
  enabled?: boolean;
  description?: string;
  url: string;
  typebot?: string;
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

export class TypebotSettingDto {
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  typebotIdFallback?: string;
  ignoreJids?: any;
}

export class TypebotIgnoreJidDto {
  remoteJid?: string;
  action?: string;
}
