import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { SqsDto } from '@api/integrations/event/sqs/dto/sqs.dto';
import { sqsController } from '@api/server.module';
import { HttpStatus } from '@api/routes/index.router';
import { instanceSchema, sqsSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class SqsRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SqsDto>({
          request: req,
          schema: sqsSchema,
          ClassRef: SqsDto,
          execute: (instance, data) => sqsController.set(instance.instanceName, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => sqsController.get(instance.instanceName),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
