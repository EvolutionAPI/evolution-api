import { BaseChatbotDto, BaseChatbotSettingDto } from '../../base-chatbot.dto';

export class PrefilledVariables {
  remoteJid?: string;
  pushName?: string;
  messageType?: string;
  additionalData?: { [key: string]: any };
}

export class TypebotDto extends BaseChatbotDto {
  url: string;
  typebot: string;
}

export class TypebotSettingDto extends BaseChatbotSettingDto {
  typebotIdFallback?: string;
}
