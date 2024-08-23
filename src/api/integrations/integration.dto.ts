import { ChatwootInstanceMixin } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { EventInstanceMixin } from '@api/integrations/event/event.dto';

export type Constructor<T = {}> = new (...args: any[]) => T;

export class IntegrationDto extends EventInstanceMixin(ChatwootInstanceMixin(class {})) {}
