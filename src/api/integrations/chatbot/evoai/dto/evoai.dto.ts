import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class EvoaiDto extends BaseChatbotDto {
  agentUrl?: string;
  apiKey?: string;
}

export class EvoaiSettingDto extends BaseChatbotSettingDto {
  evoaiIdFallback?: string;
}
