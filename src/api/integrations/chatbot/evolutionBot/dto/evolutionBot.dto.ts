import { TriggerOperator, TriggerType } from '@prisma/client';

import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class EvolutionBotDto extends BaseChatbotDto {
  apiUrl: string;
  apiKey: string;
  enabled?: boolean;
  expire?: number;
  keywordFinish?: string | null;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  triggerType: TriggerType;
  triggerOperator?: TriggerOperator;
  triggerValue?: string;
  ignoreJids?: any;
  splitMessages?: boolean;
  timePerChar?: number;
}

export class EvolutionBotSettingDto extends BaseChatbotSettingDto {
  expire?: number;
  keywordFinish?: string | null;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  botIdFallback?: string;
  ignoreJids?: any;
  splitMessages?: boolean;
  timePerChar?: number;
}
