import { TriggerOperator, TriggerType } from '@prisma/client';

export class N8nDto {
  enabled?: boolean;
  description?: string;
  webhookUrl?: string;
  basicAuthUser?: string;
  basicAuthPass?: string;

  // Advanced bot properties (copied from DifyDto style)
  triggerType?: TriggerType;
  triggerOperator?: TriggerOperator;
  triggerValue?: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
}

export class N8nSettingDto {
  // Add settings fields here if needed for compatibility
}

export class N8nMessageDto {
  chatInput: string;
  sessionId: string;
}
