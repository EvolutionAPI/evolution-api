import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import { instanceNameSchema, proxySchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { ProxyDto } from '../dto/proxy.dto';
import { proxyController } from '../server.module';
import { HttpStatus } from './index.router';

const logger = new Logger('ProxyRouter');

export class ProxyRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setProxy');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<ProxyDto>({
          request: req,
          schema: proxySchema,
          ClassRef: ProxyDto,
          execute: (instance, data) => proxyController.createProxy(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findProxy');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => proxyController.findProxy(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
