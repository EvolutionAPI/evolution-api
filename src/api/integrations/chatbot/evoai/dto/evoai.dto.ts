import { TriggerOperator, TriggerType } from '@prisma/client';

import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class EvoaiDto extends BaseChatbotDto {
  // Evoai specific fields
  agentUrl?: string;
  apiKey?: string;
}

export class EvoaiSettingDto extends BaseChatbotSettingDto {
  // Evoai specific fields
}
