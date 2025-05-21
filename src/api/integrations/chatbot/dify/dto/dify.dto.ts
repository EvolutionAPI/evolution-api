import { $Enums, TriggerOperator, TriggerType } from '@prisma/client';

import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class DifyDto extends BaseChatbotDto {
  // Dify specific fields
  botType?: $Enums.DifyBotType;
  apiUrl?: string;
  apiKey?: string;
}

export class DifySettingDto extends BaseChatbotSettingDto {
  // Dify specific fields
}
