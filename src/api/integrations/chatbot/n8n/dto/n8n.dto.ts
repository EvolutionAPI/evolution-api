import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class N8nDto extends BaseChatbotDto {
  // N8n specific fields
  webhookUrl?: string;
  basicAuthUser?: string;
  basicAuthPass?: string;
}

export class N8nSettingDto extends BaseChatbotSettingDto {
  // N8n has no specific fields
}

export class N8nMessageDto {
  chatInput: string;
  sessionId: string;
}
