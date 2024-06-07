import { RequestHandler, Router } from 'express';

import { ConfigService, WaBusiness } from '../../config/env.config';
import { instanceSchema, webhookSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { webhookController } from '../server.module';
import { HttpStatus } from './index.router';

export class WebhookRouter extends RouterBroker {
  constructor(readonly configService: ConfigService, ...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<WebhookDto>({
          request: req,
          schema: webhookSchema,
          ClassRef: WebhookDto,
          execute: (instance, data) => webhookController.createWebhook(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => webhookController.findWebhook(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('whatsapp'), async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => webhookController.receiveWebhook(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get(this.routerPath('whatsapp'), async (req, res) => {
        if (req.query['hub.verify_token'] === this.configService.get<WaBusiness>('WA_BUSINESS').TOKEN_WEBHOOK)
          res.send(req.query['hub.challenge']);
        else res.send('Error, wrong validation token');
      });
  }

  public readonly router = Router();
}
