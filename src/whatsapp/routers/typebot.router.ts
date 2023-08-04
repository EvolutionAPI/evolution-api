import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import { instanceNameSchema, typebotSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { TypebotDto } from '../dto/typebot.dto';
import { typebotController } from '../whatsapp.module';
import { HttpStatus } from './index.router';

const logger = new Logger('TypebotRouter');

export class TypebotRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setTypebot');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<TypebotDto>({
          request: req,
          schema: typebotSchema,
          ClassRef: TypebotDto,
          execute: (instance, data) => typebotController.createTypebot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findTypebot');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.findTypebot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
