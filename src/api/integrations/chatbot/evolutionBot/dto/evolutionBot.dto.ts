import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class EvolutionBotDto extends BaseChatbotDto {
  apiUrl: string;
  apiKey: string;
}

export class EvolutionBotSettingDto extends BaseChatbotSettingDto {
  botIdFallback?: string;
}
