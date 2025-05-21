import { TriggerOperator, TriggerType } from '@prisma/client';

import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class N8nDto extends BaseChatbotDto {
  // N8n specific fields
  webhookUrl?: string;
  basicAuthUser?: string;
  basicAuthPass?: string;

  // Advanced bot properties (copied from DifyDto style)
  triggerType: TriggerType;
  triggerOperator?: TriggerOperator;
  triggerValue?: string;
  expire?: number;
  keywordFinish?: string[];
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

export class N8nSettingDto extends BaseChatbotSettingDto {
  // N8n specific fields
}

export class N8nMessageDto {
  chatInput: string;
  sessionId: string;
}
