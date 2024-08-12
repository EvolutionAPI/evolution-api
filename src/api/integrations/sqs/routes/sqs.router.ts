import { RouterBroker } from '@api/abstract/abstract.router';
import { InstanceDto } from '@api/dto/instance.dto';
import { SqsDto } from '@api/integrations/sqs/dto/sqs.dto';
import { HttpStatus } from '@api/routes/index.router';
import { sqsController } from '@api/server.module';
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

  public readonly router: Router = Router();
}
