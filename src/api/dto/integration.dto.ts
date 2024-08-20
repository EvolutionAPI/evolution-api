import { RabbitMQInstanceMixin } from '@api/integrations/event/rabbitmq/dto/rabbitmq.dto';
import { SQSInstanceMixin } from '@api/integrations/event/sqs/dto/sqs.dto';
import { WebhookInstanceMixin } from '@api/integrations/event/webhook/dto/webhook.dto';
import { WebsocketInstanceMixin } from '@api/integrations/event/websocket/dto/websocket.dto';

export type Constructor<T = {}> = new (...args: any[]) => T;

function ChatwootInstanceMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    chatwootAccountId?: string;
    chatwootToken?: string;
    chatwootUrl?: string;
    chatwootSignMsg?: boolean;
    chatwootReopenConversation?: boolean;
    chatwootConversationPending?: boolean;
    chatwootMergeBrazilContacts?: boolean;
    chatwootImportContacts?: boolean;
    chatwootImportMessages?: boolean;
    chatwootDaysLimitImportMessages?: number;
    chatwootNameInbox?: string;
    chatwootOrganization?: string;
    chatwootLogo?: string;
  };
}

export class IntegrationDto extends WebhookInstanceMixin(
  WebsocketInstanceMixin(RabbitMQInstanceMixin(SQSInstanceMixin(ChatwootInstanceMixin(class {})))),
) {}
