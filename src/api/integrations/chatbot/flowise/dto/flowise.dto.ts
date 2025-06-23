import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class FlowiseDto extends BaseChatbotDto {
  apiUrl: string;
  apiKey?: string;
}

export class FlowiseSettingDto extends BaseChatbotSettingDto {
  flowiseIdFallback?: string;
}
