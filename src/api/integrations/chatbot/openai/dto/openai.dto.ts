import { TriggerOperator, TriggerType } from '@prisma/client';

import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class OpenaiCredsDto {
  name: string;
  apiKey: string;
}

export class OpenaiDto extends BaseChatbotDto {
  openaiCredsId: string;
  botType: string;
  assistantId?: string;
  functionUrl?: string;
  model?: string;
  systemMessages?: string[];
  assistantMessages?: string[];
  userMessages?: string[];
  maxTokens?: number;
}

export class OpenaiSettingDto extends BaseChatbotSettingDto {
  openaiCredsId?: string;
  openaiIdFallback?: string;
  speechToText?: boolean;
}
