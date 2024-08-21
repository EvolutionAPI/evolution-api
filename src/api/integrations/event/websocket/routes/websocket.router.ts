import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { WebsocketDto } from '@api/integrations/event/websocket/dto/websocket.dto';
import { websocketController } from '@api/server.module';
import { HttpStatus } from '@api/routes/index.router';
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
          execute: (instance, data) => websocketController.set(instance.instanceName, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => websocketController.get(instance.instanceName),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
