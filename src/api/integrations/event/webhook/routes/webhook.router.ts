import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { webhookController } from '@api/server.module';
import { ConfigService, WaBusiness } from '@config/env.config';
import { instanceSchema, webhookSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

import { WebhookDto } from '../dto/webhook.dto';

export class WebhookRouter extends RouterBroker {
  constructor(readonly configService: ConfigService, ...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<WebhookDto>({
          request: req,
          schema: webhookSchema,
          ClassRef: WebhookDto,
          execute: (instance, data) => webhookController.set(instance.instanceName, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => webhookController.get(instance.instanceName),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get('meta', async (req, res) => {
        if (req.query['hub.verify_token'] === configService.get<WaBusiness>('WA_BUSINESS').TOKEN_WEBHOOK)
          res.send(req.query['hub.challenge']);
        else res.send('Error, wrong validation token');
      })
      .post('meta', async (req, res) => {
        const { body } = req;
        const response = await webhookController.receiveWebhook(body);

        return res.status(200).json(response);
      });
  }

  public readonly router: Router = Router();
}
