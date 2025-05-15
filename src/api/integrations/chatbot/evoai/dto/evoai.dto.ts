import { TriggerOperator, TriggerType } from '@prisma/client';

export class EvoaiDto {
  enabled?: boolean;
  description?: string;
  agentUrl?: string;
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
  splitMessages?: boolean;
  timePerChar?: number;
}

export class EvoaiSettingDto {
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  evoaiIdFallback?: string;
  ignoreJids?: any;
  splitMessages?: boolean;
  timePerChar?: number;
}
