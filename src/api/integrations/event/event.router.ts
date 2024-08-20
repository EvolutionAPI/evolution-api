import { RabbitmqRouter } from '@api/integrations/event/rabbitmq/routes/rabbitmq.router';
import { SqsRouter } from '@api/integrations/event/sqs/routes/sqs.router';
import { WebhookRouter } from '@api/integrations/event/webhook/routes/webhook.router';
import { WebsocketRouter } from '@api/integrations/event/websocket/routes/websocket.router';
import { Router } from 'express';

export class EventRouter {
  public readonly router: Router;

  constructor(configService: any, ...guards: any[]) {
    this.router = Router();

    this.router.use('/webhook', new WebhookRouter(configService, ...guards).router);
    this.router.use('/websocket', new WebsocketRouter(...guards).router);
    this.router.use('/rabbitmq', new RabbitmqRouter(...guards).router);
    this.router.use('/sqs', new SqsRouter(...guards).router);
  }
}
