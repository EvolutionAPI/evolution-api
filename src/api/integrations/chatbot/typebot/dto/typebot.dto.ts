import { TriggerOperator, TriggerType } from '@prisma/client';

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
  description: string;
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
}

export class TypebotSettingDto extends BaseChatbotSettingDto {
  expire?: number;
  keywordFinish?: string | null;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
  debounceTime?: number;
  typebotIdFallback?: string;
  ignoreJids?: any;
}
