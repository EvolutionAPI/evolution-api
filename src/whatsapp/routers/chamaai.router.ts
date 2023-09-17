import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import { chamaaiSchema, instanceNameSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { ChamaaiDto } from '../dto/chamaai.dto';
import { InstanceDto } from '../dto/instance.dto';
import { chamaaiController } from '../whatsapp.module';
import { HttpStatus } from './index.router';

const logger = new Logger('ChamaaiRouter');

export class ChamaaiRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setChamaai');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<ChamaaiDto>({
          request: req,
          schema: chamaaiSchema,
          ClassRef: ChamaaiDto,
          execute: (instance, data) => chamaaiController.createChamaai(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findChamaai');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => chamaaiController.findChamaai(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
