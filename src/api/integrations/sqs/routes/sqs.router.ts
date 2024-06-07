import { RequestHandler, Router } from 'express';

import { instanceSchema, sqsSchema } from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { sqsController } from '../../../server.module';
import { SqsDto } from '../dto/sqs.dto';

export class SqsRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SqsDto>({
          request: req,
          schema: sqsSchema,
          ClassRef: SqsDto,
          execute: (instance, data) => sqsController.createSqs(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => sqsController.findSqs(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
