import { RequestHandler, Router } from 'express';

import { instanceSchema, websocketSchema } from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { websocketController } from '../../../server.module';
import { WebsocketDto } from '../dto/websocket.dto';

export class WebsocketRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<WebsocketDto>({
          request: req,
          schema: websocketSchema,
          ClassRef: WebsocketDto,
          execute: (instance, data) => websocketController.createWebsocket(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => websocketController.findWebsocket(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
