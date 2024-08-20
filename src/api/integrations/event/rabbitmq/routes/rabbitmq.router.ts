import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { RabbitmqDto } from '@api/integrations/event/rabbitmq/dto/rabbitmq.dto';
import { rabbitmqController } from '@api/server.module';
import { HttpStatus } from '@api/routes/index.router';
import { instanceSchema, rabbitmqSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class RabbitmqRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<RabbitmqDto>({
          request: req,
          schema: rabbitmqSchema,
          ClassRef: RabbitmqDto,
          execute: (instance, data) => rabbitmqController.set(instance.instanceName, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => rabbitmqController.get(instance.instanceName),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
