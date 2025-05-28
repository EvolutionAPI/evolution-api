import { TriggerOperator, TriggerType } from '@prisma/client';

/**
 * Base DTO for all chatbot integrations
 * Contains common properties shared by all chatbot types
 */
export class BaseChatbotDto {
  enabled?: boolean;
  description: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  triggerType: TriggerType;
  triggerOperator?: TriggerOperator;
  triggerValue?: string;
  ignoreJids?: string[];
  splitMessages?: boolean;
  timePerChar?: number;
}

/**
 * Base settings DTO for all chatbot integrations
 */
export class BaseChatbotSettingDto {
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  ignoreJids?: any;
  splitMessages?: boolean;
  timePerChar?: number;
  fallbackId?: string; // Unified fallback ID field for all integrations
}
