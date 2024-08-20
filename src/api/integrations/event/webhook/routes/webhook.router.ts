import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { HttpStatus } from '@api/routes/index.router';
import { webhookController } from '@api/server.module';
import { ConfigService } from '@config/env.config';
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
      });
  }

  public readonly router: Router = Router();
}
