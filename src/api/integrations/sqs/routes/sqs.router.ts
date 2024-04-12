import { RequestHandler, Router } from 'express';

import { Logger } from '../../../../config/logger.config';
import { instanceNameSchema, sqsSchema } from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { sqsController } from '../../../server.module';
import { SqsDto } from '../dto/sqs.dto';

const logger = new Logger('SqsRouter');

export class SqsRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setSqs');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<SqsDto>({
          request: req,
          schema: sqsSchema,
          ClassRef: SqsDto,
          execute: (instance, data) => sqsController.createSqs(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findSqs');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => sqsController.findSqs(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
