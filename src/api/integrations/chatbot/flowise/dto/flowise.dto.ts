import { TriggerOperator, TriggerType } from '@prisma/client';

import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class FlowiseDto extends BaseChatbotDto {
  apiUrl: string;
  apiKey: string;
  description: string;
  keywordFinish?: string | null;
  triggerType: TriggerType;
  enabled?: boolean;
  expire?: number;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  triggerOperator?: TriggerOperator;
  triggerValue?: string;
  ignoreJids?: any;
  splitMessages?: boolean;
  timePerChar?: number;
}

export class FlowiseSettingDto extends BaseChatbotSettingDto {
  expire?: number;
  keywordFinish?: string | null;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  flowiseIdFallback?: string;
  ignoreJids?: any;
  splitMessages?: boolean;
  timePerChar?: number;
}
