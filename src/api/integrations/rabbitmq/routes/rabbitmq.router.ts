import { RequestHandler, Router } from 'express';

import { instanceSchema, rabbitmqSchema } from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { rabbitmqController } from '../../../server.module';
import { RabbitmqDto } from '../dto/rabbitmq.dto';

export class RabbitmqRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        console.log('RabbitmqRouter -> constructor -> req', req.body);
        const response = await this.dataValidate<RabbitmqDto>({
          request: req,
          schema: rabbitmqSchema,
          ClassRef: RabbitmqDto,
          execute: (instance, data) => rabbitmqController.createRabbitmq(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => rabbitmqController.findRabbitmq(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
