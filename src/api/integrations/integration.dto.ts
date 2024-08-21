import { ChatwootInstanceMixin } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { RabbitMQInstanceMixin } from '@api/integrations/event/rabbitmq/dto/rabbitmq.dto';
import { SQSInstanceMixin } from '@api/integrations/event/sqs/dto/sqs.dto';
import { WebhookInstanceMixin } from '@api/integrations/event/webhook/dto/webhook.dto';
import { WebsocketInstanceMixin } from '@api/integrations/event/websocket/dto/websocket.dto';

export type Constructor<T = {}> = new (...args: any[]) => T;

export class IntegrationDto extends WebhookInstanceMixin(
  WebsocketInstanceMixin(RabbitMQInstanceMixin(SQSInstanceMixin(ChatwootInstanceMixin(class {})))),
) {}
