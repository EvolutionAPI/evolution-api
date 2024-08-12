import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { WebsocketDto } from '@api/integrations/websocket/dto/websocket.dto';
import { HttpStatus } from '@api/routes/index.router';
import { websocketController } from '@api/server.module';
import { instanceSchema, websocketSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

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

  public readonly router: Router = Router();
}
