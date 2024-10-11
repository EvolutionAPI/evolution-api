import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { EventDto } from '@api/integrations/event/event.dto';
import { HttpStatus } from '@api/routes/index.router';
import { eventManager } from '@api/server.module';
import { instanceSchema, pusherSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';
export class PusherRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<EventDto>({
          request: req,
          schema: pusherSchema,
          ClassRef: EventDto,
          execute: (instance, data) => eventManager.pusher.set(instance.instanceName, data),
        });
        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => eventManager.pusher.get(instance.instanceName),
        });
        res.status(HttpStatus.OK).json(response);
      });
  }
  public readonly router: Router = Router();
}
